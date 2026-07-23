# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [0.1.2] - 2026-07-24

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