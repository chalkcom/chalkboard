# Embedding the board

The SDK is one script served by your own deployment at `/sdk.js`. It
exposes a single global command function, `Chalkboard(command, options)`,
mirroring the `Featurebase('embed', {...})` call shape so an existing
Featurebase integration ports with a rename.

Every deployment also serves `/sdk-test` — a self-contained page that
exercises the embed, overlay and hint elements against that deployment.
Use it to sanity-check a fresh install (or your CSP) before wiring the
SDK into your app; on local dev it can mint a dev-only JWT so the
signed-in flows work too.

## Loading the SDK

```html
<script>
    // Pre-load stub: queues calls made before the script arrives.
    window.Chalkboard =
        window.Chalkboard ||
        function () {
            (window.Chalkboard.q = window.Chalkboard.q || []).push(arguments);
        };
</script>
<script src="https://feedback.example.com/sdk.js" defer></script>
```

Or as a module: `import Chalkboard from 'https://feedback.example.com/sdk.mjs'`.

## Configuration

```js
Chalkboard('config', {
    url: 'https://feedback.example.com', // your deployment
    jwt: '<signed identity JWT>',        // see the identity contract below
    locale: 'en',
    theme: { brand: '#e11d48' },
    onEvent: (name, payload) => analytics.track(name, payload)
});
```

`config` is optional if your first call is `embed` — the embed options
double as global config.

## Inline embed

```js
Chalkboard('embed', {
    url: 'https://feedback.example.com',
    container: '#feedback',   // or omit: [data-feedback-embed], then
                              // [data-featurebase-embed] as a fallback
    initialPage: 'Board',     // 'Board' | 'Roadmap' | 'Changelog'
    filters: { topic: 'reports' },
    hideMenu: false,
    hideLogo: false,
    jwt: token,               // featurebaseJwt works as an alias
    theme: { brand: '#e11d48' },
    onEvent: (name, payload) => {}
});
```

The board renders chrome-less in an iframe that auto-resizes. Navigation:
`Chalkboard('navigate', '/roadmap')`. Tear down: `Chalkboard('unmount')`.

### Vue 2.7 example (StoreKit-style dashboard)

```vue
<template>
    <div data-feedback-embed />
</template>

<script>
export default {
    mounted() {
        Chalkboard('embed', {
            url: process.env.VUE_APP_FEEDBACK_URL,
            jwt: this.$store.state.feedbackJwt,
            initialPage: 'Board'
        });
    },
    beforeDestroy() {
        Chalkboard('unmount');
    }
};
</script>
```

## Overlay

```js
Chalkboard('open', {
    page: 'submit',              // 'submit' | 'post' | 'board'
    topic: 'reports',            // pre-filters / pre-fills
    prefillTitle: 'CSV export',  // submit page only
    postId: 'bulk-edit'          // post page only (id or slug)
});
```

Opens a right-hand slide-over (`min(440px, 100vw)`) with a backdrop; ESC,
the backdrop, or the board's close button dismiss it.

## Identity contract (JWT)

Sign an HS256 JWT with the `FEEDBACK_JWT_SECRET` you configured on the
worker. Claims:

| Claim | Required | Notes |
| --- | --- | --- |
| `sub` | yes | stable user id in your system |
| `exp` | yes | unix seconds; keep it short (≤ 24h) |
| `email` | recommended | lets imported votes attach to the user |
| `name` | recommended | shown next to posts/comments |
| `accountId` | no | tenant/business id |
| `accountName` | no | tenant/business name |
| `role` | no | `'member'` (default) or `'staff'` |
| `locale` | no | reserved for localisation |

Never sign JWTs in the browser — mint them server-side per session.

## Events

Every meaningful interaction emits an analytics event (batched to
`POST /api/v1/events`) and calls your `onEvent`:
`hint_impression, hint_click, overlay_open, similar_shown,
similar_clicked, post_submit, vote, embed_view`.

The SDK also dispatches DOM CustomEvents on `window` so host code can
react without wiring callbacks:

```js
window.addEventListener('chalk:submitted', e => toast('Thanks!', e.detail));
window.addEventListener('chalk:voted', e => console.log(e.detail));
```

## Content security policy

Allow your feedback origin in `script-src` (the SDK), `frame-src` (the
embed/overlay iframes) and `connect-src` (API calls from hint elements).
