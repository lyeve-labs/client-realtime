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
  baseUrl: "http://localhost:3002",
  topic: "content:articles",
});
ws.on("message", (data) => console.log(data));
ws.connect();

// Server-Sent Events
const sse = new SSEClient({
  baseUrl: "http://localhost:3002",
  options: { onEvent: (event) => console.log(event.topic, event.action) },
});
sse.connect();
```

Both transports live on the engine's API port (3002 by default), not the admin
port.

Two transports, one package. Reconnect, filter, stream.

---

## What's in the box

- **WebSocket pub/sub:** topic-based messaging with auto-reconnect and exponential
  backoff.
- **SSE client:** content, schema, presence and flow events, subscribed by topic.
- **Connection guards:** re-entrant `connect()` is safe. Guards check both
  `connected` and `connecting` states.
- **Event buffer:** SSE client keeps the last 200 events in a rolling buffer.
- **Status tracking:** `status` and `lastError` on both clients; the SSE client
  also keeps `latestEvent`.

## Requirements

- **Node 24** or newer

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
  baseUrl: "http://localhost:3002",
  topic: "content:articles",
  token: sessionToken,
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

`token` never reaches the URL. A browser cannot set request headers on a
WebSocket handshake but it can offer subprotocols, so the credential goes
there:

```
Sec-WebSocket-Protocol: lyeve.v1, lyeve.bearer.<token>
```

The server selects `lyeve.v1` in its response, which is what makes the browser
accept the handshake. Query strings are written to proxy access logs, kept in
browser history and sent on in `Referer`, so a credential must not travel in
one. Earlier releases of this package put it there; the server never read it,
and it is gone.

### SSE

```ts
import { SSEClient } from "@lyeve-labs/client-realtime";

const sse = new SSEClient({
  baseUrl: "http://localhost:3002",
  options: {
    filter: {
      schemas: ["articles"],
      topics: ["schema:changed"],
    },
    onEvent: (event) => {
      console.log(event.topic, event.schema, event.action, event.record_id);
    },
  },
});

sse.connect();
// Later: sse.disconnect();
```

The server names every frame after the topic it was published on, and the
client listens for exactly the topics it subscribed to:

| Topic            | Carries                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| `*`              | every content and schema event, and every flow push                      |
| `content:<name>` | `{ schema, action, record_id }` for one content schema                   |
| `schema:changed` | `{ schema, action }` when a schema is created                            |
| `presence`       | `{ action, user_id, email?, display_name? }` when a user joins or leaves |
| any flow topic   | the payload a flow published to that topic                               |

`action` is `create`, `update` or `delete`. `filter.schemas` subscribes to
`content:<name>` for each name and `filter.topics` names topics directly. With
neither, the stream subscribes to `*`. The server takes at most 32 topics. Subscribing to `*` and to a topic it
covers delivers each of those events twice.

`EventSource` cannot send an `Authorization` header, so the stream
authenticates with the session cookie (`withCredentials` is on) and the server
refuses an `Origin` outside its CORS allowlist.

## API

### WSClient

| Endpoint                     | Description                             |
| ---------------------------- | --------------------------------------- |
| `/api/v1/ws/connect?topic=X` | Topic-based pub/sub with auto-reconnect |

- `connect()` / `close()`. Manage connection lifecycle
- `on(event, handler)` / `off(event, handler)`. Listen for `message`, `error`, `open`, `close`
- Auto-reconnects on disconnect (configurable attempts/delay)

### SSEClient

| Endpoint                          | Description                                 |
| --------------------------------- | ------------------------------------------- |
| `/api/v1/realtime/events?topic=X` | SSE stream of the named topics (repeatable) |

- `connect()` / `disconnect()`. Manage connection lifecycle
- Optional filter: `schemas` and/or `topics`
- `onEvent(event)` receives a `RealtimeEvent`: the payload's fields plus `topic`
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
