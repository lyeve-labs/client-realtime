# Contributing to `@lyeve-labs/client-realtime`

## Quick start

```bash
git clone git@github.com:lyeve-labs/cms-client-realtime.git
cd cms-client-realtime
pnpm install
pnpm test         # verify everything works
```

You'll need:

- **Node 20** or newer
- **pnpm 9.15** (the `packageManager` field pins it)

## Repository layout

```
src/
  index.ts           # public API
  sse.ts             # Server-Sent Events client
  ws.ts              # WebSocket client
tests/               # vitest test suite
```

## Coding conventions

- TypeScript everywhere. No plain `.js` files.
- One export entry point via `src/index.ts`. Don't deep-import internals.
- Tests live in `tests/`, named `*.test.ts`.
- Run `pnpm format` before committing. CI checks formatting.

## Verifying changes

Before pushing:

```bash
pnpm check          # type-check
pnpm test           # vitest
pnpm format:check   # prettier
pnpm build          # ensure tsup + publint pass
```

CI runs the same set on every PR.

## Commits

We use Conventional Commits:

- `feat: add X method`
- `fix: handle null response in Y`
- `chore: bump dependencies`
- `docs: update README example`

One logical change per commit. Squash before merging if a PR has noise.

## Releases

Releases are cut from `main` after the changelog section is moved out of
`[Unreleased]` and the version is bumped in `package.json`. Tag the commit
`v<version>` and push. CI handles the npm publish.

## Questions

Open an issue with the `question` label, or reach out in the LyEve Discord.
