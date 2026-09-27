# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `SSEClient` delivers events. The server names every SSE frame after its
  topic (`event: *`, `event: content:articles`), and `EventSource` hands a
  named frame only to a listener registered for that name, never to
  `onmessage`, so `onEvent` never fired and `events` stayed empty. The client
  now registers a listener for each topic it subscribes to.
- The subscription is sent as the `topic` query parameter the server reads.
  `filter.schemas` becomes one `content:<name>` topic each, and with no filter
  the stream subscribes to the catch-all topic `*`.

### Added

- `filter.topics` names topics directly, such as `schema:changed`, `presence`
  or a topic a flow publishes to.

### Changed

- Events are typed as `RealtimeEvent`: the payload the server sent, plus the
  `topic` it arrived on. Content events carry `schema`, `action` and
  `record_id`.
- The README points both transports at the API port, which is where the
  engine serves `/api/v1`. It named the admin port, where both paths are 404.

### Removed

- `HookBusEvent`, `HookEventType` and `filter.event_types`. The server never
  read `event_types` and never sent the `HookBusEvent` shape.

## [0.1.11] - 2026-09-12

### Fixed

- The package manifest carries `repository`, `homepage` and `bugs`, so the npm
  page links back to the source and the issue tracker. It published with none
  of the three, which left a reader on npm with no way back to the code.

### Changed

- The declared Node floor is 24. Continuous integration has run on Node 24 for
  some time and the manifest still said 20, which described a runtime nothing
  was tested against. Node 22 consumers are no longer within the declared
  range.
- `prepublishOnly` runs the build, so a publish cannot skip the package lint,
  the dist check or the version check. All three ran only from the build
  script before, and a bare publish uploaded whatever `dist` happened to hold.
  The version check refuses when `package.json` and the CHANGELOG head name
  different versions.

## [0.1.10] - 2026-09-09

### Changed

- Documentation and shipped strings no longer carry em dashes, unicode
  ellipses or unicode bullets. Where a string is an error or a log line the
  wording changed and nothing else: status codes, machine-readable error codes
  and behavior are untouched, so a client matching on a code is unaffected.
- An elision inside a code span now uses three ASCII periods, so a reader who
  copies one gets something their tool accepts.

## [0.1.9] - 2026-09-02

### Security

- The WebSocket client no longer puts `token` in the connect URL. It offers the credential as a `Sec-WebSocket-Protocol` entry, `lyeve.bearer.<token>`, alongside the plain `lyeve.v1` entry the server selects. A query string reaches proxy access logs, browser history and `Referer`, which is three copies of a live session credential that nobody audits. No server ever read the query parameter, so nothing that worked stops working.

### Changed

- CONTRIBUTING documents the branch model. It covered commits and releases but never said which branch a change starts from: work branches off `dev` and the PR goes back into `dev`, while `main` takes merges and carries the release tags.

## [0.1.8] - 2026-08-12

### Changed

- Move to node 24 and pnpm 10.33.4.

### Removed

- The `@lyeve-labs/client` peer dependency. This package never imported it, so
  requiring consumers to install it was never necessary.

## [0.1.7] - 2026-08-04

### Fixed

- Split the `types` export condition so TypeScript resolves `.d.ts` under `import` and `.d.cts` under `require`.

## [0.1.6] - 2026-07-28

Published with no user-facing changes; repository tooling only.

## [0.1.5] - 2026-07-24

### Fixed

- SSE and WebSocket re-entrant connect guards now check both `connected` and `connecting` states, preventing duplicate connections during rapid connect/disconnect sequences.
- WebSocket client sends auth token as a query parameter when configured.

### Changed

- SSE client class now named `SSEClient` for consistency with the generic `WSClient` naming.

## [0.1.0] - 2026-07-23

### Added

- Initial release.
- WebSocket pub/sub client (`createWSClient` / `WSClient`) with automatic reconnection, status tracking, and typed event handling.
- Server-Sent Events client (`SSEClient`) with connection lifecycle management, event filtering, and status reporting.
- Support for consuming CMS HookBus events in real time over both transport protocols.
