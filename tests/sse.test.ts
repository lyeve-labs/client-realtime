import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SSEClient } from "../src/sse.js";
import type { RealtimeEvent, SSEStatus } from "../src/sse.js";

// Mock EventSource

class MockEventSource {
  static instances: MockEventSource[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  url: string;
  readyState = MockEventSource.CONNECTING;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  close = vi.fn();
  withCredentials = false;
  listeners = new Map<string, Array<(e: MessageEvent<string>) => void>>();

  constructor(url: string, eventSourceInitDict?: EventSourceInit) {
    this.url = url;
    if (eventSourceInitDict?.withCredentials) {
      this.withCredentials = true;
    }
    MockEventSource.instances.push(this);
  }

  /** Simulate the server opening the connection. */
  simulateOpen(): void {
    this.readyState = MockEventSource.OPEN;
    this.onopen?.(new Event("open"));
  }

  addEventListener(type: string, fn: (e: MessageEvent<string>) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }

  /**
   * Simulate a server-sent frame the way EventSource dispatches one: a frame
   * named `type` reaches the listeners for that name, and only an unnamed
   * frame (type "message") reaches onmessage.
   */
  simulateEvent(type: string, data: string): void {
    const e = { type, data } as MessageEvent<string>;
    for (const fn of this.listeners.get(type) ?? []) fn(e);
    if (type === "message") this.onmessage?.(e);
  }

  /** Simulate a content event on the catch-all topic the server defaults to. */
  simulateMessage(data: string): void {
    this.simulateEvent("*", data);
  }

  /** Simulate a connection error. */
  simulateError(): void {
    this.onerror?.(new Event("error"));
  }
}

// Tests

describe("SSEClient", () => {
  const baseUrl = "http://localhost:3002";

  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal(
      "EventSource",
      MockEventSource as unknown as typeof EventSource,
    );
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function latestEs(): MockEventSource {
    return MockEventSource.instances[MockEventSource.instances.length - 1];
  }

  // constructor

  describe("constructor", () => {
    it("sets initial status to idle", () => {
      const client = new SSEClient({ baseUrl });

      expect(client.status).toBe("idle");
      expect(client.events).toEqual([]);
      expect(client.latestEvent).toBeNull();
      expect(client.lastError).toBeNull();
      expect(client.reconnectAttempts).toBe(0);
    });

    it("uses default endpoint when not specified", () => {
      const client = new SSEClient({ baseUrl });
      client.connect();

      const url = new URL(latestEs().url);
      expect(url.origin + url.pathname).toBe(
        "http://localhost:3002/api/v1/realtime/events",
      );
    });

    it("uses custom endpoint when specified", () => {
      const client = new SSEClient({ baseUrl, endpoint: "/stream/events" });
      client.connect();

      const url = new URL(latestEs().url);
      expect(url.origin + url.pathname).toBe(
        "http://localhost:3002/stream/events",
      );
    });

    it("subscribes to the catch-all topic when no filter is given", () => {
      const client = new SSEClient({ baseUrl });
      client.connect();

      const url = new URL(latestEs().url);
      expect(url.searchParams.getAll("topic")).toEqual(["*"]);
      expect([...latestEs().listeners.keys()]).toEqual(["*"]);
    });

    it("turns schemas into content topics", () => {
      const client = new SSEClient({
        baseUrl,
        options: { filter: { schemas: ["article", "page"] } },
      });
      client.connect();

      const url = new URL(latestEs().url);
      expect(url.searchParams.getAll("topic")).toEqual([
        "content:article",
        "content:page",
      ]);
      expect([...latestEs().listeners.keys()]).toEqual([
        "content:article",
        "content:page",
      ]);
    });

    it("adds named topics after the schema topics, once each", () => {
      const client = new SSEClient({
        baseUrl,
        options: {
          filter: {
            schemas: ["article"],
            topics: ["schema:changed", "content:article", "presence"],
          },
        },
      });
      client.connect();

      const url = new URL(latestEs().url);
      expect(url.searchParams.getAll("topic")).toEqual([
        "content:article",
        "schema:changed",
        "presence",
      ]);
    });

    it("falls back to the catch-all topic when filter arrays are empty", () => {
      const client = new SSEClient({
        baseUrl,
        options: { filter: { schemas: [], topics: [""] } },
      });
      client.connect();

      const url = new URL(latestEs().url);
      expect(url.searchParams.getAll("topic")).toEqual(["*"]);
    });

    it("sets withCredentials on EventSource", () => {
      const client = new SSEClient({ baseUrl });
      client.connect();

      expect(latestEs().withCredentials).toBe(true);
    });
  });

  // connect()

  describe("connect()", () => {
    it("sets status to connecting then connected on open", () => {
      const client = new SSEClient({ baseUrl });
      client.connect();

      expect(client.status).toBe("connecting");

      latestEs().simulateOpen();

      expect(client.status).toBe("connected");
      expect(client.lastError).toBeNull();
      expect(client.reconnectAttempts).toBe(0);
    });

    it("calls onStatusChange callback through status transitions", () => {
      const onStatusChange = vi.fn();
      const client = new SSEClient({
        baseUrl,
        options: { onStatusChange },
      });

      client.connect();
      expect(onStatusChange).toHaveBeenCalledWith("connecting");

      latestEs().simulateOpen();
      expect(onStatusChange).toHaveBeenCalledWith("connected");
    });

    it("delivers a named frame to onEvent with its topic", () => {
      const onEvent = vi.fn();
      const client = new SSEClient({ baseUrl, options: { onEvent } });
      client.connect();
      latestEs().simulateOpen();

      latestEs().simulateEvent(
        "*",
        JSON.stringify({
          schema: "article",
          action: "create",
          record_id: "rec-1",
        }),
      );

      const expected: RealtimeEvent = {
        topic: "*",
        schema: "article",
        action: "create",
        record_id: "rec-1",
      };
      expect(client.latestEvent).toEqual(expected);
      expect(client.events).toEqual([expected]);
      expect(onEvent).toHaveBeenCalledWith(expected);
    });

    it("delivers frames named after a subscribed schema topic", () => {
      const onEvent = vi.fn();
      const client = new SSEClient({
        baseUrl,
        options: { filter: { schemas: ["article"] }, onEvent },
      });
      client.connect();

      latestEs().simulateEvent(
        "content:article",
        JSON.stringify({ schema: "article", action: "delete", record_id: "r" }),
      );
      latestEs().simulateEvent("*", JSON.stringify({ schema: "page" }));

      expect(onEvent).toHaveBeenCalledOnce();
      expect(onEvent.mock.calls[0][0].topic).toBe("content:article");
    });

    it("ignores unnamed frames, which the server never sends", () => {
      const onEvent = vi.fn();
      const client = new SSEClient({ baseUrl, options: { onEvent } });
      client.connect();

      latestEs().simulateEvent("message", JSON.stringify({ schema: "a" }));

      expect(onEvent).not.toHaveBeenCalled();
    });

    it("appends events in reverse-chronological order (newest first)", () => {
      const client = new SSEClient({ baseUrl });
      client.connect();

      latestEs().simulateMessage(JSON.stringify({ schema: "a", seq: 1 }));
      latestEs().simulateMessage(JSON.stringify({ schema: "b", seq: 2 }));

      expect(client.events).toHaveLength(2);
      expect(client.events[0].seq).toBe(2); // newest first
      expect(client.events[1].seq).toBe(1);
    });

    it("ignores a payload that is not a JSON object", () => {
      const onEvent = vi.fn();
      const client = new SSEClient({ baseUrl, options: { onEvent } });
      client.connect();

      latestEs().simulateMessage("[1,2]");
      latestEs().simulateMessage("null");

      expect(client.events).toEqual([]);
      expect(onEvent).not.toHaveBeenCalled();
    });

    it("ignores malformed JSON messages", () => {
      const onEvent = vi.fn();
      const client = new SSEClient({ baseUrl, options: { onEvent } });
      client.connect();

      latestEs().simulateMessage("not valid json");

      expect(client.latestEvent).toBeNull();
      expect(client.events).toEqual([]);
      expect(onEvent).not.toHaveBeenCalled();
    });

    it("sets status to error and schedules reconnect on EventSource error", () => {
      const client = new SSEClient({ baseUrl });
      client.connect();
      latestEs().simulateOpen();

      latestEs().simulateError();

      expect(client.status).toBe("error");
      // A reconnect should be scheduled
      vi.advanceTimersByTime(1000);
      expect(MockEventSource.instances.length).toBe(2);
    });

    it("does not create a second EventSource when already connected", () => {
      const client = new SSEClient({ baseUrl });
      client.connect();
      latestEs().simulateOpen();

      client.connect(); // second call: no-op

      expect(MockEventSource.instances.length).toBe(1);
    });
  });

  // disconnect()

  describe("disconnect()", () => {
    it("sets status to idle", () => {
      const client = new SSEClient({ baseUrl });
      client.connect();
      latestEs().simulateOpen();

      client.disconnect();

      expect(client.status).toBe("idle");
    });

    it("calls EventSource close()", () => {
      const client = new SSEClient({ baseUrl });
      client.connect();
      const es = latestEs();

      client.disconnect();

      expect(es.close).toHaveBeenCalledOnce();
    });

    it("stops reconnection attempts after disconnect", () => {
      const client = new SSEClient({ baseUrl });
      client.connect();

      client.disconnect();
      // The onerror handler should check #mounted and not reconnect
      latestEs().simulateError();

      vi.advanceTimersByTime(100_000);
      expect(MockEventSource.instances.length).toBe(1);
    });

    it("is idempotent - calling disconnect() twice does not throw", () => {
      const client = new SSEClient({ baseUrl });

      client.disconnect();
      expect(() => client.disconnect()).not.toThrow();
    });

    it("clears latestEvent and lastError does not persist from prior connect", () => {
      const client = new SSEClient({ baseUrl });
      client.connect();

      // Receive an event
      latestEs().simulateMessage(
        JSON.stringify({ schema: "x", action: "create", record_id: "r" }),
      );
      expect(client.latestEvent).not.toBeNull();

      client.disconnect();
      // latestEvent is still the last event (the data is preserved between connect cycles)
      // but status resets to idle
      expect(client.status).toBe("idle");
    });
  });

  // reconnection

  describe("reconnection", () => {
    it("reconnects with exponential backoff on error", () => {
      const client = new SSEClient({
        baseUrl,
        options: {
          reconnectBaseDelay: 100,
          reconnectMaxDelay: 5000,
        },
      });
      client.connect();
      latestEs().simulateOpen();

      // First failure > reconnect after ~100ms
      latestEs().simulateError();
      vi.advanceTimersByTime(99);
      expect(MockEventSource.instances.length).toBe(1);
      vi.advanceTimersByTime(2);
      expect(MockEventSource.instances.length).toBe(2);

      // Second failure > reconnect after ~200ms
      latestEs().simulateError();
      vi.advanceTimersByTime(199);
      expect(MockEventSource.instances.length).toBe(2);
      vi.advanceTimersByTime(2);
      expect(MockEventSource.instances.length).toBe(3);
    });

    it("stops reconnecting after maxReconnectAttempts", () => {
      const client = new SSEClient({
        baseUrl,
        options: {
          maxReconnectAttempts: 2,
          reconnectBaseDelay: 10,
          reconnectMaxDelay: 100,
        },
      });
      client.connect();

      // 3 failures should stop after 2 attempts
      latestEs().simulateError();
      vi.advanceTimersByTime(100);

      latestEs().simulateError();
      vi.advanceTimersByTime(100);

      latestEs().simulateError();
      vi.advanceTimersByTime(100);

      expect(client.status).toBe("disconnected");
      expect(client.lastError).toBe("Max reconnect attempts (2) reached.");
    });

    it("resets reconnectAttempts on successful reconnection", () => {
      const client = new SSEClient({
        baseUrl,
        options: { reconnectBaseDelay: 10 },
      });
      client.connect();
      latestEs().simulateOpen();

      // Fail once
      latestEs().simulateError();
      vi.advanceTimersByTime(100);

      // Reconnect succeeds
      latestEs().simulateOpen();
      expect(client.reconnectAttempts).toBe(0);
    });
  });
});
