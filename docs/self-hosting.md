# Self-hosting

Chalkboard is a single Cloudflare Worker with a D1 database. The worker
serves three things from one origin:

- the JSON API under `/api/v1/*` (plus `/auth/*` for SSO cookies),
- the board SPA (every non-API route falls through to static assets),
- the embed SDK at `/sdk.js`.

The step-by-step install lives in [`deploy/README.md`](../deploy/README.md).
This page covers the concepts you need to run it well.

## Architecture

```
your app (dashboard)            feedback.example.com (Worker)
┌──────────────────────┐        ┌───────────────────────────────┐
│ <script src=/sdk.js> │  API   │ createFeedbackApp()           │
│ Chalkboard('embed')  │──────▶ │  /api/v1/*  → D1 (posts, …)   │
│ <chalk-hint …>       │        │  /auth/sso  → cb_session      │
│   iframe /embed/*    │◀─────▶ │  everything else → board SPA  │
└──────────────────────┘  postMessage  └───────────────────────┘
```

The worker package has **zero runtime dependencies** — shared logic comes
from `@chalkcom/core`, also dependency-free, so the attack/audit surface
is the code in this repository.

## Identity: the JWT contract

Your app signs a short-lived HS256 JWT with the shared
`FEEDBACK_JWT_SECRET` and either:

- passes it to the SDK (`Chalkboard('config', { jwt })` or the `jwt`
  option of `embed`), which sends it as `Authorization: Bearer …`, or
- redirects to `GET /auth/sso?jwt=…&return_to=/` for the full-page board,
  which exchanges it for an HttpOnly `cb_session` cookie (7 days).

Claims:

```json
{
    "sub": "user-123",           // required, stable id in YOUR system
    "email": "owner@cafe.com",   // recommended (matches imported voters)
    "name": "Sam Owner",
    "accountId": "acct-42",      // optional business/tenant id
    "accountName": "Corner Cafe",
    "role": "member",            // "member" | "staff"
    "locale": "en",
    "exp": 1780000000            // required in practice: unix seconds
}
```

`role: "staff"` unlocks moderation (status changes, merging, tags, the
triage queue, metrics, export). Everything else is a member.

Users are upserted on their first authenticated write. If a user was
previously imported (placeholder row with an email but no `external_id`),
their first SSO/JWT write with a matching email claims that row, keeping
imported votes and comments attached to them.

## Bindings and variables

| Name | Kind | Purpose |
| --- | --- | --- |
| `DB` | D1 | all data; migrations in `packages/worker/migrations` |
| `RATE` | KV | fixed-window rate limits (fails open if absent) |
| `ASSETS` | assets | board SPA + `sdk.js`, SPA fallback enabled. The `[assets]` block **must** keep `run_worker_first = ["/api/*", "/auth/*"]`: assets-first serving answers top-level browser navigations with the SPA fallback before the worker runs, so without it `GET /auth/sso` returns index.html — no session cookie, and the SSO JWT stays in browser history |
| `PUBLIC_URL` | var | canonical origin, SSO redirect allow-list |
| `ALLOWED_ORIGINS` | var | comma list; scoped wildcards allowed (e.g. `https://*--your-site.netlify.app`) — wildcard matches get CORS **without credentials**, and cookie-authed writes require an exact entry; never allow a bare shared-hosting suffix |
| `ALLOW_ANONYMOUS_POSTS` | var | `'true'` / `'false'` |
| `FEEDBACK_JWT_SECRET` | secret | HS256 secret shared with your app |
| `IMPORT_TOKEN` | secret | bearer token for `POST /api/v1/import` |

## Data lifecycle

- Post/comment deletion is soft (tombstones keep threads coherent);
  `DELETE /api/v1/users/:id` anonymizes a user, `?purge=1` also removes
  their votes and authorship links.
- A nightly cron (`scheduled`) prunes analytics events older than 180
  days. Posts, votes and comments are never auto-deleted.
- `GET /api/v1/export` (staff) returns a complete JSON dump; keep a copy
  before destructive experiments.

## Importing from another tool

`POST /api/v1/import` with `Authorization: Bearer <IMPORT_TOKEN>` accepts
up to 100 posts per call, each with nested `comments[]` and `voters[]`,
a `voteOffset` for votes you cannot attribute, and an `externalRef` used
as the idempotency key — re-running an import updates rather than
duplicates. Send `{ "dryRun": true }` first to get counts without writes.
