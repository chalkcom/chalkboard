# Self-hosting Chalkboard

Everything here deploys one Cloudflare Worker that serves the API, the
board SPA and the embed SDK from a single domain. You need a Cloudflare
account (the free plan works) and `pnpm`/Node 22.

## Quickstart

```bash
# 0. Clone and install
git clone https://github.com/chalkcom/chalkboard
cd chalkboard && pnpm install

# 1. Create the config
cd deploy
cp wrangler.toml.example wrangler.toml

# 2. Create the D1 database and KV namespace, paste the printed ids
#    into wrangler.toml
npx wrangler d1 create feedback
npx wrangler kv namespace create RATE

# 3. Set the secrets
npx wrangler secret put FEEDBACK_JWT_SECRET   # shared HS256 secret with your app
npx wrangler secret put IMPORT_TOKEN          # any long random string

# 4. Build the board + SDK and assemble ./dist + ./migrations
cd .. && pnpm build && cd deploy

# 5. Apply migrations to the remote database
npx wrangler d1 migrations apply feedback --remote

# 6. (Optional) demo content
npx wrangler d1 execute feedback --remote --file=./seed.sql

# 7. Ship it
npx wrangler deploy
```

Then set the `[vars]` in `wrangler.toml` for your domain:

- `PUBLIC_URL` — where the worker is reachable (used for SSO redirects).
- `ALLOWED_ORIGINS` — the origins of the app(s) that embed the board.
- `ALLOW_ANONYMOUS_POSTS` — `'true'` to accept posts without sign-in.

## Local development

```bash
cd deploy
npx wrangler d1 migrations apply feedback --local
npx wrangler dev          # worker + assembled assets on :8787
# in another terminal, for board hot-reload:
pnpm --filter @chalkcom/board dev   # Vite on :5173, proxies /api to :8787
```

Local dev works without the KV namespace — the rate limiter fails open.

## Customising

`worker/index.js` passes options into `createFeedbackApp({})`. Set
`boardTitle`, `topics` (`[{ id, label }]`) or `theme` (CSS custom property
values, see `docs/hints.md`) there, or manage the same keys at runtime via
`PUT /api/v1/config` as a staff user.

See `docs/self-hosting.md` for the identity (JWT) contract and
`docs/embedding.md` for wiring the SDK into your app.
