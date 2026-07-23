/**
 * WebSocket pub/sub client for LyEve CMS.
 *
 * Connects to /api/v1/ws/connect?topic=X for topic-based pub/sub messaging.
 * Supports auto-reconnect with exponential backoff.
 */

export type WSStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WSClientConfig {
	baseUrl: string;
	/** Topic to subscribe to (passed as query param). */
	topic?: string;
	/** Auth token sent as query param. */
	token?: string;
	/** Max reconnect attempts (default: 10). */
	maxReconnectAttempts?: number;
	/** Reconnect base delay in ms (default: 1000). */
	reconnectBaseDelay?: number;
	/** Reconnect max delay in ms (default: 30000). */
	reconnectMaxDelay?: number;
}

type EventHandler = (data: unknown) => void;

export class WSClient {
	status: WSStatus = 'idle';
	lastError: string | null = null;

	#config: WSClientConfig;
	#ws: WebSocket | null = null;
	#mounted = false;
	#reconnectAttempts = 0;
	#reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	#handlers = new Map<string, Set<EventHandler>>();

	constructor(config: WSClientConfig) {
		this.#config = config;
	}

	/** Register an event listener. Events: 'message', 'error', 'open', 'close'. */
	on(event: 'message' | 'error' | 'open' | 'close', handler: EventHandler): void {
		const set = this.#handlers.get(event) ?? new Set();
		set.add(handler);
		this.#handlers.set(event, set);
	}

	/** Remove an event listener. */
	off(event: string, handler: EventHandler): void {
		this.#handlers.get(event)?.delete(handler);
	}

	/** Open the WebSocket connection. Idempotent. */
	connect(): void {
		if (this.#ws && (this.status === 'connected' || this.status === 'connecting')) return;

		this.#mounted = true;
		this.#clearReconnectTimer();
		this.#setStatus('connecting');

		const url = new URL('/api/v1/ws/connect', this.#config.baseUrl.replace(/^http/, 'ws'));
		if (this.#config.topic) url.searchParams.set('topic', this.#config.topic);
		if (this.#config.token) url.searchParams.set('token', this.#config.token);

		const ws = new WebSocket(url.toString());
		this.#ws = ws;

		ws.onopen = () => {
			this.#setStatus('connected');
			this.#reconnectAttempts = 0;
			this.lastError = null;
			this.#emit('open', {});
		};

		ws.onmessage = (msg: MessageEvent) => {
			try {
				const parsed = JSON.parse(msg.data);
				this.#emit('message', parsed);
			} catch {
				this.#emit('message', msg.data);
			}
		};

		ws.onerror = () => {
			this.#setStatus('error');
			this.#emit('error', { message: 'WebSocket error' });
		};

		ws.onclose = (e: CloseEvent) => {
			this.#ws = null;
			this.#emit('close', { code: e.code, reason: e.reason });
			if (this.#mounted && e.code !== 1000) {
				this.#scheduleReconnect();
			} else if (!this.#mounted) {
				this.#setStatus('idle');
			}
		};
	}

	/** Close the connection and stop auto-reconnect. */
	close(): void {
		this.#mounted = false;
		this.#clearReconnectTimer();
		this.#ws?.close(1000, 'client close');
		this.#ws = null;
		this.#setStatus('idle');
	}

	// private

	#setStatus(s: WSStatus): void {
		this.status = s;
	}

	#emit(event: string, data: unknown): void {
		this.#handlers.get(event)?.forEach((h) => h(data));
	}

	#scheduleReconnect(): void {
		const max = this.#config.maxReconnectAttempts ?? 10;
		if (this.#reconnectAttempts >= max) {
			this.#setStatus('disconnected');
			this.lastError = `Max reconnect attempts (${max}) reached.`;
			return;
		}
		this.#reconnectAttempts += 1;
		const base = this.#config.reconnectBaseDelay ?? 1000;
		const cap = this.#config.reconnectMaxDelay ?? 30000;
		const delay = Math.min(cap, base * Math.pow(2, this.#reconnectAttempts - 1));

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

/** Create a WebSocket client for CMS realtime pub/sub. */
export function createWSClient(config: WSClientConfig): WSClient {
	return new WSClient(config);
}
