# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
