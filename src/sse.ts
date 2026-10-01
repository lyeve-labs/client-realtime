/**
 * Framework-agnostic SSE client for the LyEve realtime event stream.
 *
 * Connects to /api/v1/realtime/events on the API port. The server writes every
 * event as a named SSE frame whose name is the topic it was published on
 * (`event: *`, `event: content:articles`), so the client registers a listener
 * per subscribed topic. EventSource never delivers a named frame to
 * `onmessage`.
 */

/**
 * One event from the stream. Content events carry `schema`, `action`
 * ("create", "update" or "delete") and `record_id`. A schema creation carries
 * `schema` and `action`. Presence and flow events carry their own fields.
 */
export interface RealtimeEvent {
  /** The topic the frame was delivered on, which is its SSE event name. */
  topic: string;
  schema?: string;
  action?: string;
  record_id?: string;
  [field: string]: unknown;
}

export type SSEStatus =
  "idle" | "connecting" | "connected" | "disconnected" | "error";

/**
 * Which topics to subscribe to. `schemas` adds `content:<schema>` for each
 * name. `topics` names topics directly (`schema:changed`, `presence`, a flow
 * topic). With neither, the stream carries the catch-all topic `*`.
 */
export interface SSEFilter {
  schemas?: string[];
  topics?: string[];
}

export interface SSEOptions {
  filter?: SSEFilter;
  maxReconnectAttempts?: number;
  reconnectBaseDelay?: number;
  reconnectMaxDelay?: number;
  onEvent?: (event: RealtimeEvent) => void;
  onStatusChange?: (status: SSEStatus) => void;
}

/** The topic the server subscribes a stream to when the request names none. */
const CATCH_ALL_TOPIC = "*";

const MAX_EVENT_BUFFER = 200;

export class SSEClient {
  status: SSEStatus = "idle";
  latestEvent: RealtimeEvent | null = null;
  events: RealtimeEvent[] = [];
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
  #onEvent: ((event: RealtimeEvent) => void) | undefined;
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

    const topics = this.#topics();
    const url = new URL(this.#endpoint, this.#baseUrl);
    for (const topic of topics) url.searchParams.append("topic", topic);

    const es = new EventSource(url.toString(), { withCredentials: true });
    this.#eventSource = es;

    es.onopen = () => {
      this.#setStatus("connected");
      this.reconnectAttempts = 0;
      this.lastError = null;
    };

    const receive = (msg: MessageEvent<string>) => this.#receive(msg);
    for (const topic of topics) es.addEventListener(topic, receive);

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

  #topics(): string[] {
    const { schemas = [], topics = [] } = this.#filter;
    const all = [...schemas.map((schema) => `content:${schema}`), ...topics];
    const unique = [...new Set(all.filter((topic) => topic.length > 0))];
    return unique.length > 0 ? unique : [CATCH_ALL_TOPIC];
  }

  #receive(msg: MessageEvent<string>): void {
    let payload: unknown;
    try {
      payload = JSON.parse(msg.data);
    } catch {
      return;
    }
    if (
      payload === null ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    )
      return;
    const event: RealtimeEvent = { ...payload, topic: msg.type };
    this.latestEvent = event;
    this.events = [event, ...this.events].slice(0, MAX_EVENT_BUFFER);
    this.#onEvent?.(event);
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
