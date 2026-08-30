# Hint elements

Hints are tiny custom elements (`<chalk-*>`) you drop inline where users
actually feel a gap — next to a feature, an empty state, a settings page —
to capture feedback in context instead of hoping people find the board.
They ship inside `/sdk.js`; load the SDK and call `Chalkboard('config', …)`
once, then use them anywhere in your markup.

All visible copy comes from attributes, so you control wording and
localisation completely — the elements render no default marketing text
beyond a generic fallback label.

## `<chalk-hint>` — capture a missing-feature moment

```html
<chalk-hint
    variant="link"
    label="Missing a report? Tell us"
    topic="reports"
    prefill-title=""
></chalk-hint>
```

- `variant` — `link` (default), `button`, or `card`
- `label` — the trigger text
- `description` — second line (card variant only)
- `topic` — tags the resulting post and pre-filters similar ideas
- `prefill-title` — pre-fills the submit form's title

Clicking opens the submit overlay, pre-filled, with duplicate detection
("similar ideas") running as the user types.

## `<chalk-topic>` — show demand, invite votes

```html
<chalk-topic
    topic="reports"
    label="open ideas for reports"
    cta-label="vote or add yours"
    status="open,planned"
></chalk-topic>
```

Renders "**4** open ideas for reports — vote or add yours". The count
comes from `GET /api/v1/posts/count` and is cached in `sessionStorage`
for 5 minutes per topic+status. Clicking opens the board overlay filtered
to the topic.

## `<chalk-post>` — rally votes for one idea

```html
<chalk-post
    post="bulk-edit-menu-items"
    cta-label="Vote for this"
    voted-label="You're on the list ✓"
></chalk-post>
```

Fetches the post (id or slug), renders a small card with title, vote
count and status, and votes in place — optimistically — using the JWT
from `Chalkboard('config')`. Without a JWT it opens the post overlay so
the visitor can sign in and vote there.

## Analytics

Hints report `hint_impression` (once per element per pageview, when the
element first scrolls into view) and `hint_click`, batched to
`POST /api/v1/events` with `sendBeacon` on page hide. Staff see the
funnel on `/staff` (impressions → clicks → overlay opens → submissions).
Successful actions also dispatch `chalk:submitted` / `chalk:voted`
CustomEvents.

## Theming

The elements use Shadow DOM but read these inheritable custom properties:

```css
:root {
    --chalk-brand: #e11d48;   /* buttons, links */
    --chalk-fg: #111827;      /* text */
    --chalk-muted: #6b7280;   /* secondary text, card borders */
    --chalk-bg: #ffffff;      /* button text / card background */
    --chalk-radius: 8px;
    --chalk-font: inherit;
}
```

Scope them to a container to theme hints differently per surface. The
embed and overlay take a `theme` object on `config`/`embed` instead — see
`docs/embedding.md`.
