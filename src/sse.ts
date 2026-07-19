/**
 * Framework-agnostic SSE client for LyEve CMS lifecycle events.
 *
 * Connects to /api/v1/realtime/events for Server-Sent Events streaming
 * with topic filtering and presence. Also usable with /api/admin/events.
 */

export type HookEventType =
  | "before_create"
  | "after_create"
  | "before_update"
  | "after_update"
  | "before_delete"
  | "after_delete"
  | "before_request"
  | "after_response";

export interface HookBusEvent {
  event_type: HookEventType;
  schema: string;
  record_id?: string;
  instance_id?: string;
  data: Record<string, unknown>;
  old_data?: Record<string, unknown> | null;
  timestamp?: string;
}

export type SSEStatus =
  "idle" | "connecting" | "connected" | "disconnected" | "error";

export interface SSEFilter {
  event_types?: HookEventType[];
  schemas?: string[];
}

export interface SSEOptions {
  filter?: SSEFilter;
  maxReconnectAttempts?: number;
  reconnectBaseDelay?: number;
  reconnectMaxDelay?: number;
  onEvent?: (event: HookBusEvent) => void;
  onStatusChange?: (status: SSEStatus) => void;
}

const MAX_EVENT_BUFFER = 200;

export class SSEClient {
  status: SSEStatus = "idle";
  latestEvent: HookBusEvent | null = null;
  events: HookBusEvent[] = [];
  lastError: string | null = null;
  reconnectAttempts = 0;

  #baseUrl: string;
  #eventSource: EventSource | null = null;
  #filter: SSEFilter;
  #maxReconnectAttempts: number;
  #reconnectBaseDelay: number;
  #reconnectMaxDelay: number;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #mounted = false;
  #onEvent: ((event: HookBusEvent) => void) | undefined;
  #onStatusChange: ((status: SSEStatus) => void) | undefined;
  #endpoint: string;

  constructor(config: {
    baseUrl: string;
    endpoint?: string;
    options?: SSEOptions;
  }) {
    const opts = config.options ?? {};
    this.#baseUrl = config.baseUrl;
    this.#endpoint = config.endpoint ?? "/api/v1/realtime/events";
    this.#filter = opts.filter ?? {};
    this.#maxReconnectAttempts = opts.maxReconnectAttempts ?? 10;
    this.#reconnectBaseDelay = opts.reconnectBaseDelay ?? 1000;
    this.#reconnectMaxDelay = opts.reconnectMaxDelay ?? 30000;
    this.#onEvent = opts.onEvent;
    this.#onStatusChange = opts.onStatusChange;
  }

  connect(): void {
    if (
      this.#eventSource &&
      (this.status === "connected" || this.status === "connecting")
    )
      return;
    this.#mounted = true;
    this.#clearReconnectTimer();
    this.#setStatus("connecting");

    const url = new URL(this.#endpoint, this.#baseUrl);
    const { event_types, schemas } = this.#filter;
    if (event_types && event_types.length > 0)
      url.searchParams.set("event_types", event_types.join(","));
    if (schemas && schemas.length > 0)
      url.searchParams.set("schemas", schemas.join(","));

    const es = new EventSource(url.toString(), { withCredentials: true });
    this.#eventSource = es;

    es.onopen = () => {
      this.#setStatus("connected");
      this.reconnectAttempts = 0;
      this.lastError = null;
    };

    es.onmessage = (msg: MessageEvent<string>) => {
      try {
        const event: HookBusEvent = JSON.parse(msg.data);
        this.latestEvent = event;
        this.events = [event, ...this.events].slice(0, MAX_EVENT_BUFFER);
        this.#onEvent?.(event);
      } catch {
        /* skip malformed */
      }
    };

    es.onerror = () => {
      es.close();
      this.#eventSource = null;
      this.#setStatus("error");
      if (this.#mounted) this.#scheduleReconnect();
    };
  }

  disconnect(): void {
    this.#mounted = false;
    this.#clearReconnectTimer();
    this.#eventSource?.close();
    this.#eventSource = null;
    this.#setStatus("idle");
  }

  #setStatus(s: SSEStatus): void {
    this.status = s;
    this.#onStatusChange?.(s);
  }

  #scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.#maxReconnectAttempts) {
      this.#setStatus("disconnected");
      this.lastError = `Max reconnect attempts (${this.#maxReconnectAttempts}) reached.`;
      return;
    }
    this.reconnectAttempts += 1;
    const delay = Math.min(
      this.#reconnectBaseDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.#reconnectMaxDelay,
    );
    this.#reconnectTimer = setTimeout(() => {
      if (this.#mounted) this.connect();
    }, delay);
  }

  #clearReconnectTimer(): void {
    if (this.#reconnectTimer !== null) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
  }
}
