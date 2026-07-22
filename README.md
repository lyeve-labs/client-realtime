# @lyeve/cms-client-realtime

Realtime clients for LyEve CMS: WebSocket pub/sub and Server-Sent Events.

Depends on `@lyeve/cms-client` for shared types.

## Install

```sh
pnpm add @lyeve/cms-client @lyeve/cms-client-realtime
```

## Usage

### WebSocket (topic-based pub/sub)

```ts
import { createWSClient } from '@lyeve/cms-client-realtime';

const ws = createWSClient({
  baseUrl: 'http://localhost:3001',
  topic: 'content:articles',
});

ws.on('message', (data) => console.log('received:', data));
ws.connect();
// Later: ws.close();
```

Auto-reconnects with exponential backoff (configurable: maxReconnectAttempts, reconnectBaseDelay, reconnectMaxDelay).

### SSE (lifecycle events stream)

```ts
import { SSEClient } from '@lyeve/cms-client-realtime';

const sse = new SSEClient({
  baseUrl: 'http://localhost:3001',
  options: {
    filter: { event_types: ['after_create', 'after_update'], schemas: ['articles'] },
    onEvent: (event) => console.log(event.event_type, event.schema, event.record_id),
  },
});

sse.connect();
// Later: sse.disconnect();
```

## API

| Client | Endpoint | Description |
|--------|----------|-------------|
| WSClient | /api/v1/ws/connect?topic=X | Topic-based pub/sub with auto-reconnect |
| SSEClient | /api/v1/realtime/events (or /api/admin/events) | SSE stream of HookBus lifecycle events with event_type/schema filtering |

### WSClient

- `connect()` / `close()`: manage connection lifecycle
- `on(event, handler)`: listen for `message`, `error`, `open`, `close`
- `off(event, handler)`: remove listener
- Auto-reconnects on disconnect (configurable attempts/delay)

### SSEClient

- `connect()` / `disconnect()`: manage connection lifecycle
- Optional filter: `event_types` and/or `schemas`
- Auto-reconnects with exponential backoff
- `events` buffer (capped at 200), `latestEvent`, `status`, `lastError`

## License

MIT
