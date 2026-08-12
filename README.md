# @lyeve-labs/client-realtime

Realtime clients for LyEve Core. WebSocket pub/sub and Server-Sent Events.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6.svg)](https://www.typescriptlang.org)

```bash
pnpm add @lyeve-labs/client-realtime
```

```ts
import { createWSClient, SSEClient } from "@lyeve-labs/client-realtime";

// WebSocket pub/sub
const ws = createWSClient({
  baseUrl: "http://localhost:3001",
  topic: "content:articles",
});
ws.on("message", (data) => console.log(data));
ws.connect();

// Server-Sent Events
const sse = new SSEClient({ baseUrl: "http://localhost:3001" });
sse.connect();
```

Two transports, one package. Reconnect, filter, stream.

---

## What's in the box

- **WebSocket pub/sub:** topic-based messaging with auto-reconnect and exponential
  backoff.
- **SSE client:** lifecycle event stream with `event_type` and `schema` filtering.
- **Connection guards:** re-entrant `connect()` is safe. Guards check both
  `connected` and `connecting` states.
- **Event buffer:** SSE client keeps the last 200 events in a rolling buffer.
- **Status tracking:** `status`, `latestEvent`, `lastError` available on every client.

## Requirements

- **Node 20** or newer

## Install

```bash
pnpm add @lyeve-labs/client-realtime
# or npm install @lyeve-labs/client-realtime
# or yarn add @lyeve-labs/client-realtime
```

## Use

### WebSocket

```ts
import { createWSClient } from "@lyeve-labs/client-realtime";

const ws = createWSClient({
  baseUrl: "http://localhost:3001",
  topic: "content:articles",
  // optional overrides:
  maxReconnectAttempts: 10,
  reconnectBaseDelay: 200,
  reconnectMaxDelay: 30000,
});

ws.on("message", (data) => console.log("received:", data));
ws.on("open", () => console.log("connected"));
ws.on("close", () => console.log("disconnected"));
ws.on("error", (err) => console.error(err));

ws.connect();
// Later: ws.close();
```

### SSE

```ts
import { SSEClient } from "@lyeve-labs/client-realtime";

const sse = new SSEClient({
  baseUrl: "http://localhost:3001",
  options: {
    filter: {
      event_types: ["after_create", "after_update"],
      schemas: ["articles"],
    },
    onEvent: (event) => {
      console.log(event.event_type, event.schema, event.record_id);
    },
  },
});

sse.connect();
// Later: sse.disconnect();
```

## API

### WSClient

| Endpoint                     | Description                             |
| ---------------------------- | --------------------------------------- |
| `/api/v1/ws/connect?topic=X` | Topic-based pub/sub with auto-reconnect |

- `connect()` / `close()`. Manage connection lifecycle
- `on(event, handler)` / `off(event, handler)`. Listen for `message`, `error`, `open`, `close`
- Auto-reconnects on disconnect (configurable attempts/delay)

### SSEClient

| Endpoint                  | Description                            |
| ------------------------- | -------------------------------------- |
| `/api/v1/realtime/events` | SSE stream of HookBus lifecycle events |
| `/api/admin/events`       | Admin-scoped event stream              |

- `connect()` / `disconnect()`. Manage connection lifecycle
- Optional filter: `event_types` and/or `schemas`
- Auto-reconnects with exponential backoff
- `events` buffer (capped at 200), `latestEvent`, `status`, `lastError`

## Local development

```bash
pnpm install            # install dependencies
pnpm test               # run unit tests
pnpm check              # type-check
pnpm build              # tsup + publint -> dist/
```

## Project layout

```
src/
  index.ts           # public API
  ws.ts              # createWSClient / WSClient
  sse.ts             # SSEClient
tests/               # vitest test suite
```

## Versioning

`@lyeve-labs/client-realtime` follows [SemVer](https://semver.org). While under `1.0`,
breaking changes bump the **minor** version; additive changes bump the **patch**.
Every release is logged in [`CHANGELOG.md`](CHANGELOG.md).

## Contributing

Bug reports and feature requests are welcome. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the development setup and conventions.

## License

MIT. See [`LICENSE`](LICENSE).
