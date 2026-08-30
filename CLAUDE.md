# Chalkboard — agent guide

Open-source feature voting + embeddable feedback hints, self-hosted on
Cloudflare Workers and D1. One Worker serves the API, the board SPA, and
the embed SDK on a single domain. README.md has the product tour; this
file is the working contract for coding agents.

## Monorepo map

| Path              | What it is                                                                       |
| ----------------- | -------------------------------------------------------------------------------- |
| `packages/core`   | Dependency-free shared logic (validation, slugs, JWT, markdown, protocol). No build; consumed from source. |
| `packages/worker` | The Cloudflare Worker: API, auth, rate limiting, cron. D1 migrations in `migrations/`. |
| `packages/board`  | Board SPA (Vue 3 + Vite + Tailwind), served by the worker, embedded via iframe.  |
| `packages/sdk`    | Embed SDK + `<chalk-*>` hint elements. Vanilla JS on purpose — see hard rules.   |
| `deploy`          | Wrangler config, `scripts/assemble.mjs` deploy assembly, seed data.              |

## Commands

pnpm 10, Node ≥ 22. `pnpm install` once (the SessionStart hook does this
in web sessions).

Mirror CI exactly before any push — all four must pass:

```bash
pnpm lint && pnpm format:check && pnpm build && pnpm test
```

Scoped runs while iterating: `pnpm -F @chalkcom/worker test`,
`pnpm -F @chalkcom/board test`, `pnpm -F @chalkcom/sdk test` (builds
first via `pretest`). Fix formatting with `pnpm format`, never by hand.

## Hard rules

- **The SDK stays framework-free.** Decided 2026-08: it runs on
  customers' pages, so shadow-DOM custom elements + vanilla JS beat any
  framework on size and isolation. Complex UI belongs in the Vue board
  behind the iframe (open it via the overlay), not in the SDK. Do not
  add React/Vue/Svelte/Preact/Lit to `packages/sdk`.
- **SDK size budget: 18kB gzipped**, enforced by
  `packages/sdk/test/size.spec.js` (currently ~4.4kB). Never raise
  `LIMIT_BYTES` to get a build green.
- **Zero runtime dependencies** in `core`, `worker`, and `sdk` — "the
  code you audit is the code that runs" is a README promise. Dev
  dependencies are fine; runtime `dependencies` (beyond workspace
  packages) are not.
- **Never skip, disable, or quarantine a test** to get CI green.
- **Changesets**: user-facing changes need `pnpm changeset` (patch/minor
  + a sentence). Internal-only changes (CI, docs, tests) don't.
- **Schema changes** are new numbered files in
  `packages/worker/migrations/` — never edit an existing migration.

## Testing notes

- Worker tests run inside workerd (`@cloudflare/vitest-pool-workers`).
  workerd has no filesystem: migrations and the example wrangler config
  are read at config time in `packages/worker/vitest.config.js` and
  passed in as bindings. New test env vars go there.
- Board and SDK tests run in happy-dom.
- Security-sensitive areas — JWT/sessions (`core/src/jwt`), CORS +
  allowed origins, rate limiting, XSS-safe markdown
  (`core/src/markdown`) — all have dedicated tests. Touching them means
  extending those tests, not just passing them.

## Docs

`docs/embedding.md` (embed SDK contract), `docs/hints.md` (hint
elements), `docs/assist.md` (AI interviewer), `docs/self-hosting.md` and
`deploy/README.md` (deployment).
