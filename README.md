# Chalkboard

**Open-source feature voting + embeddable feedback hints, self-hosted on
Cloudflare Workers and D1.**

Chalkboard gives your product a public feedback board — posts, upvotes,
statuses, threaded comments, a roadmap — plus something boards alone never
get you: tiny **hint elements** you drop inline in your app
(`<chalk-hint>`, `<chalk-topic>`, `<chalk-post>`) that capture feedback at
the exact moment a user hits a gap, with duplicate detection and vote
prompts built in.

Everything runs as **one Worker on your own Cloudflare account**: API,
board SPA and embed SDK on a single domain, data in your own D1 database.
The worker has **zero runtime dependencies** — the code you audit in this
repo is the code that runs.

## Features

- 📋 **Board** — post, upvote, comment (threaded, team badges), search
  (SQLite FTS5), sort by top/new/trending, topic & tag filters
- 🗺️ **Roadmap** — planned / in progress / complete, sorted by votes
- 🧑‍💼 **Moderation** — statuses, pinning, tagging, duplicate merging with
  vote coalescing, a triage queue (untagged / unanswered / new), metrics
- 🪄 **Embed SDK** — iframe embed + slide-over overlay with a
  `Featurebase('embed', …)`-compatible call shape for easy migration
- 💡 **Hints** — inline custom elements that turn "missing something?"
  moments into posts and votes, with impression→submit funnel analytics
- 🔐 **Bring-your-own identity** — sign a JWT in your app; no separate
  accounts, imported voters are claimed by email on first sign-in
- 📦 **Import/export** — idempotent bulk import (e.g. from Featurebase),
  full JSON export, user anonymization
- 🆓 **MIT licensed**, runs comfortably on Cloudflare's free tier

## Five-minute self-host

```bash
git clone https://github.com/chalkcom/chalkboard && cd chalkboard
pnpm install
cd deploy && cp wrangler.toml.example wrangler.toml
npx wrangler d1 create feedback          # paste id into wrangler.toml
npx wrangler kv namespace create RATE    # paste id into wrangler.toml
npx wrangler secret put FEEDBACK_JWT_SECRET
npx wrangler secret put IMPORT_TOKEN
cd .. && pnpm build && cd deploy
npx wrangler d1 migrations apply feedback --remote
npx wrangler deploy
```

Full guide: [`deploy/README.md`](deploy/README.md) ·
[`docs/self-hosting.md`](docs/self-hosting.md)

## Embed it in your app

```html
<script>
    window.Chalkboard =
        window.Chalkboard ||
        function () {
            (window.Chalkboard.q = window.Chalkboard.q || []).push(arguments);
        };
</script>
<script src="https://feedback.yourdomain.com/sdk.js" defer></script>

<div data-feedback-embed></div>
<script>
    Chalkboard('embed', {
        url: 'https://feedback.yourdomain.com',
        jwt: '<signed server-side>',
        initialPage: 'Board'
    });
</script>
```

## Drop hints where feedback happens

```html
<chalk-hint label="Missing a report? Tell us" topic="reports"></chalk-hint>

<chalk-topic
    topic="reports"
    label="open ideas for reports"
    cta-label="vote or add yours"
></chalk-topic>

<chalk-post post="bulk-edit-menu-items"></chalk-post>
```

Docs: [`docs/embedding.md`](docs/embedding.md) ·
[`docs/hints.md`](docs/hints.md)

## Packages

| Package | What it is |
| --- | --- |
| [`packages/core`](packages/core) | Dependency-free shared logic: validation, slugs, WebCrypto JWT/sessions, XSS-safe markdown, protocol constants |
| [`packages/worker`](packages/worker) | The Cloudflare Worker: `createFeedbackApp()` → API + auth + rate limiting + cron, D1 migrations |
| [`packages/board`](packages/board) | The board SPA (Vue 3 + Vite + Tailwind), served by the worker |
| [`packages/sdk`](packages/sdk) | Embed SDK + `<chalk-*>` hint elements (no framework, ≤18kB gzipped) |
| [`deploy`](deploy) | Wrangler config, deploy assembly, seed data, quickstart |

## Development

```bash
pnpm install
pnpm lint && pnpm format:check
pnpm build          # board + sdk dist, then deploy assembly
pnpm test           # vitest everywhere; worker tests run in workerd
```

## License

[MIT](LICENSE) © 2026 Chalkboard contributors
