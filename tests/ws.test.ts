import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWSClient, WSClient } from '../src/ws.js';

// Mock WebSocket

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  close = vi.fn();
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  /** Simulate the server opening the connection. */
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  /** Simulate a message from the server. */
  simulateMessage(data: string): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  /** Simulate a WebSocket error. */
  simulateError(): void {
    this.onerror?.(new Event('error'));
  }

  /** Simulate the connection closing. */
  simulateClose(code: number, reason: string): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason } as CloseEvent);
  }
}

// Tests

describe('WSClient', () => {
  const baseUrl = 'http://localhost:3001';

  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function latestWs(): MockWebSocket {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }

  // constructor

  describe('constructor', () => {
    it('sets initial status to idle', () => {
      const client = createWSClient({ baseUrl });

      expect(client).toBeInstanceOf(WSClient);
      expect(client.status).toBe('idle');
      expect(client.lastError).toBeNull();
    });
  });

  // on / off

  describe('on() / off()', () => {
    it('on() registers a handler and off() removes it', () => {
      const client = createWSClient({ baseUrl });
      const handler = vi.fn();

      // register
      client.on('message', handler);
      client.connect();
      latestWs().simulateMessage(JSON.stringify({ type: 'test' }));
      expect(handler).toHaveBeenCalledWith({ type: 'test' });

      handler.mockClear();

      // remove - handler should no longer fire
      client.off('message', handler);
      latestWs().simulateMessage(JSON.stringify({ type: 'test2' }));
      expect(handler).not.toHaveBeenCalled();
    });

    it('supports multiple handlers for the same event', () => {
      const client = createWSClient({ baseUrl });
      const h1 = vi.fn();
      const h2 = vi.fn();

      client.on('message', h1);
      client.on('message', h2);
      client.connect();
      latestWs().simulateMessage(JSON.stringify({ type: 'test' }));

      expect(h1).toHaveBeenCalledWith({ type: 'test' });
      expect(h2).toHaveBeenCalledWith({ type: 'test' });
    });

    it('off() on a non-existent handler does not throw', () => {
      const client = createWSClient({ baseUrl });
      const handler = vi.fn();

      expect(() => client.off('message', handler)).not.toThrow();
    });

    it('supports open, error, and close events via on()', () => {
      const client = createWSClient({ baseUrl });
      const onOpen = vi.fn();
      const onError = vi.fn();
      const onClose = vi.fn();

      client.on('open', onOpen);
      client.on('error', onError);
      client.on('close', onClose);
      client.connect();

      latestWs().simulateOpen();
      expect(onOpen).toHaveBeenCalledWith({});

      latestWs().simulateError();
      expect(onError).toHaveBeenCalledWith({ message: 'WebSocket error' });

      latestWs().simulateClose(1000, 'bye');
      expect(onClose).toHaveBeenCalledWith({ code: 1000, reason: 'bye' });
    });
  });

  // connect()

  describe('connect()', () => {
    it('builds correct URL without topic', () => {
      createWSClient({ baseUrl }).connect();

      expect(latestWs().url).toBe('ws://localhost:3001/api/v1/ws/connect');
    });

    it('builds correct URL with topic param', () => {
      createWSClient({ baseUrl, topic: 'content:article' }).connect();

      expect(latestWs().url).toBe(
        'ws://localhost:3001/api/v1/ws/connect?topic=content%3Aarticle',
      );
    });

    it('encodes special characters in topic', () => {
      createWSClient({ baseUrl, topic: 'my topic' }).connect();

      expect(latestWs().url).toContain('topic=my+topic');
    });

    it('sets status to connecting immediately', () => {
      const client = createWSClient({ baseUrl });
      client.connect();

      expect(client.status).toBe('connecting');
    });

    it('sets status to connected on open', () => {
      const client = createWSClient({ baseUrl });
      client.connect();
      latestWs().simulateOpen();

      expect(client.status).toBe('connected');
      expect(client.lastError).toBeNull();
    });

    it('sets status to error on WebSocket error', () => {
      const client = createWSClient({ baseUrl });
      client.connect();
      latestWs().simulateError();

      expect(client.status).toBe('error');
    });

    it('is idempotent - calling connect() while connected does not create a second WebSocket', () => {
      const client = createWSClient({ baseUrl });
      client.connect();
      latestWs().simulateOpen();

      client.connect(); // second call - should be a no-op

      expect(MockWebSocket.instances.length).toBe(1);
    });

    it('parses JSON messages and emits them to message handlers', () => {
      const client = createWSClient({ baseUrl });
      const handler = vi.fn();
      client.on('message', handler);
      client.connect();

      const payload = { topic: 'article', action: 'updated', id: '1' };
      latestWs().simulateMessage(JSON.stringify(payload));

      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('emits raw string data for non-JSON messages', () => {
      const client = createWSClient({ baseUrl });
      const handler = vi.fn();
      client.on('message', handler);
      client.connect();

      latestWs().simulateMessage('raw string');

      expect(handler).toHaveBeenCalledWith('raw string');
    });

    it('reconnects after abnormal close', () => {
      vi.useFakeTimers();
      const client = createWSClient({ baseUrl, reconnectBaseDelay: 10 });
      client.connect();
      latestWs().simulateOpen();

      latestWs().simulateClose(1006, 'timeout');

      vi.advanceTimersByTime(20);
      expect(MockWebSocket.instances.length).toBe(2);
    });

    it('does not reconnect after normal close (code 1000)', () => {
      vi.useFakeTimers();
      const client = createWSClient({ baseUrl });
      client.connect();
      latestWs().simulateOpen();

      latestWs().simulateClose(1000, 'bye');

      vi.advanceTimersByTime(100_000);
      expect(MockWebSocket.instances.length).toBe(1);
    });
  });

  // close()

  describe('close()', () => {
    it('sets status to idle', () => {
      const client = createWSClient({ baseUrl });
      client.connect();
      latestWs().simulateOpen();
      expect(client.status).toBe('connected');

      client.close();

      expect(client.status).toBe('idle');
    });

    it('calls ws.close with 1000 and normal closure reason', () => {
      const client = createWSClient({ baseUrl });
      client.connect();
      const ws = latestWs();
      ws.simulateOpen();

      client.close();

      expect(ws.close).toHaveBeenCalledWith(1000, 'client close');
    });

    it('stops auto-reconnect when closed by the client', () => {
      vi.useFakeTimers();
      const client = createWSClient({ baseUrl });
      client.connect();
      const ws = latestWs();

      client.close();
      ws.simulateClose(1006, 'abnormal'); // this simulates the onclose after close()

      // No reconnect timer should have been scheduled
      vi.advanceTimersByTime(100_000);
      expect(MockWebSocket.instances.length).toBe(1);
    });
  });
});
