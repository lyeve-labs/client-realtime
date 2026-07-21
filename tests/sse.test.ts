import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SSEClient } from "../src/sse.js";
import type { HookBusEvent, SSEStatus } from "../src/sse.js";

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

  /** Simulate a server-sent event. */
  simulateMessage(data: string): void {
    this.onmessage?.({ data } as MessageEvent<string>);
  }

  /** Simulate a connection error. */
  simulateError(): void {
    this.onerror?.(new Event("error"));
  }
}

// Tests

describe("SSEClient", () => {
  const baseUrl = "http://localhost:3001";

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

      expect(latestEs().url).toBe(
        "http://localhost:3001/api/v1/realtime/events",
      );
    });

    it("uses custom endpoint when specified", () => {
      const client = new SSEClient({ baseUrl, endpoint: "/api/admin/events" });
      client.connect();

      expect(latestEs().url).toBe("http://localhost:3001/api/admin/events");
    });

    it("builds URL with event_types filter param", () => {
      const client = new SSEClient({
        baseUrl,
        options: { filter: { event_types: ["after_create", "after_update"] } },
      });
      client.connect();

      const url = new URL(latestEs().url);
      expect(url.searchParams.get("event_types")).toBe(
        "after_create,after_update",
      );
    });

    it("builds URL with schemas filter param", () => {
      const client = new SSEClient({
        baseUrl,
        options: { filter: { schemas: ["article", "page"] } },
      });
      client.connect();

      const url = new URL(latestEs().url);
      expect(url.searchParams.get("schemas")).toBe("article,page");
    });

    it("builds URL with both event_types and schemas filter params", () => {
      const client = new SSEClient({
        baseUrl,
        options: {
          filter: { event_types: ["after_create"], schemas: ["article"] },
        },
      });
      client.connect();

      const url = new URL(latestEs().url);
      expect(url.searchParams.get("event_types")).toBe("after_create");
      expect(url.searchParams.get("schemas")).toBe("article");
    });

    it("omits query params when filter arrays are empty", () => {
      const client = new SSEClient({
        baseUrl,
        options: { filter: { event_types: [], schemas: [] } },
      });
      client.connect();

      const url = new URL(latestEs().url);
      expect(url.searchParams.has("event_types")).toBe(false);
      expect(url.searchParams.has("schemas")).toBe(false);
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

    it("processes incoming messages as HookBusEvent", () => {
      const onEvent = vi.fn();
      const client = new SSEClient({ baseUrl, options: { onEvent } });
      client.connect();
      latestEs().simulateOpen();

      const eventData: HookBusEvent = {
        event_type: "after_create",
        schema: "article",
        record_id: "rec-1",
        instance_id: "inst-1",
        data: { title: "Hello World" },
        old_data: null,
        timestamp: "2026-07-22T12:00:00Z",
      };
      latestEs().simulateMessage(JSON.stringify(eventData));

      expect(client.latestEvent).toEqual(eventData);
      expect(client.events).toHaveLength(1);
      expect(client.events[0]).toEqual(eventData);
      expect(onEvent).toHaveBeenCalledWith(eventData);
    });

    it("appends events in reverse-chronological order (newest first)", () => {
      const client = new SSEClient({ baseUrl });
      client.connect();

      const ev1: HookBusEvent = {
        event_type: "after_create",
        schema: "a",
        data: { seq: 1 },
      };
      const ev2: HookBusEvent = {
        event_type: "after_update",
        schema: "b",
        data: { seq: 2 },
      };

      latestEs().simulateMessage(JSON.stringify(ev1));
      latestEs().simulateMessage(JSON.stringify(ev2));

      expect(client.events).toHaveLength(2);
      expect(client.events[0].data).toEqual({ seq: 2 }); // newest first
      expect(client.events[1].data).toEqual({ seq: 1 });
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

      client.connect(); // second call - no-op

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
        JSON.stringify({
          event_type: "after_create",
          schema: "x",
          data: {},
        } satisfies HookBusEvent),
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
