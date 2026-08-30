# The AI interviewer ("assist")

Most feedback arrives as one vague sentence — "make reports better". The
AI interviewer turns that moment into usable signal: when a user drafts a
post, Claude asks up to **three targeted follow-up questions** (impact,
frequency, current workaround, a concrete example), the user answers any
subset inline, and an AI synthesis — which the **user reviews and edits** —
becomes the post body. The original draft and the full Q&A transcript are
stored alongside the post, visible to staff only.

## The three product decisions (fixed)

1. **The model is fully configurable**, defaulting to `claude-opus-5`.
2. **One round of at most 3 questions** with inline answers — not a chat.
   Answering is always optional and **never blocks posting** ("Post as
   is" is always one click away; every failure fails open to the plain
   submit flow).
3. **The user-approved synthesis becomes the public body.** The original
   draft + transcript stay staff-visible on the post for context.

## Configuration (bring your own key)

Assist is off unless you provide an Anthropic API key — that is the
self-hosted story: your key, your billing, your data agreement.

| Name | Kind | Meaning |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | secret | `wrangler secret put ANTHROPIC_API_KEY`. Absent ⇒ feature entirely off: assist routes return 503 and `GET /api/v1/config` reports `assist: {enabled: false}` so UIs hide it. |
| `ASSIST_ENABLED` | var | set to `'false'` to switch assist off without removing the key. |
| `ASSIST_MODEL` | var | model ID; default `claude-opus-5`. |
| `ASSIST_API_URL` | var | endpoint override (Cloudflare AI Gateway, corporate proxies, a local stub). Default: `https://api.anthropic.com/v1/messages`. The `x-api-key` header is sent either way. |
| config row `assist.model` | D1 | overrides `ASSIST_MODEL` at runtime (`PUT /api/v1/config` as staff with `{"assist.model": "claude-sonnet-5"}`). |
| `createFeedbackApp({assist: {model}})` | code | wins over both. |

Model precedence: **code option → config row → env var → default**.

### Choosing a model

`claude-opus-5` (default) gives the best questions and synthesis quality.
Cheaper alternatives that work well for this task: **`claude-sonnet-5`**
and **`claude-haiku-4-5`**. Expect roughly **1–3¢ per assisted post** on
`claude-opus-5` (one interview + one synthesis call, ~1–2K tokens each,
with the system prompt cached) and **sub-cent** on `claude-haiku-4-5`.

## Product briefing (give the interviewer your vocabulary)

An owner-written briefing makes the questions sound like your product
instead of a generic survey. Two ways to author it, with this precedence:

1. **Code option** — `createFeedbackApp({assist: {context: '…'}})` in
   `deploy/worker/index.js` (wins over everything; version-controlled).
2. **Staff UI / config row** — the "Interviewer" card on `/staff` edits
   the `assist.context` config row via `PUT /api/v1/config`.

Cap: **16,000 characters** (over-cap writes are rejected with 400; an
over-cap code option is truncated). Example:

```
StoreKit is a hospitality ordering platform for restaurants and cafés.
"Menu" = the structured item list merchants edit; items have modifiers.
"Till" = the in-store POS app. Orders arrive from QR, web and kiosk.
Roadmap language: we say "planned", never promise dates.
```

Per-topic addenda: entries in the `topics` config (code option or config
row, same precedence) accept an optional `context` (cap 2,000 chars):

```json
{ "id": "menu", "label": "Menu", "context": "Menus have sections; …" }
```

The briefing is injected into the system prompt inside a clearly
delimited "PRODUCT BRIEFING" section marked as reference data — it can
shape terminology and relevance but cannot override the interviewer's
fixed rules. `GET /api/v1/config` exposes only
`assist.contextSource: 'option' | 'config' | 'none'` (never the text);
staff read the stored row via `GET /api/v1/staff/assist`.

## Docs knowledge & the "this already exists" deflection

Feed your documentation in and the interviewer can catch requests for
features you already shipped — before a duplicate post exists.

Quickstart (StoreKit example, pointing at a checkout of the docs' MDX
directory):

```bash
node tools/ingest-docs.mjs \
  --dir ../storekit-docs/src/content \
  --base-url https://docs.storekit.com \
  --target https://feedback.storekit.com \
  --token $IMPORT_TOKEN
```

The CLI strips frontmatter/JSX, chunks on headings (~2,500 chars with
overlap), and POSTs batches to `POST /api/v1/knowledge` (auth: staff or
the import token; ≤100 chunks per call, ≤4,000 chars per chunk; stable
ids make re-runs idempotent). `DELETE /api/v1/knowledge?source=docs`
(staff) clears a source before re-ingest after a docs restructure.

On every assist call the draft is matched against the knowledge index
(FTS5) and the top 3 excerpts are passed to the model. The model may only
claim a feature exists when an excerpt clearly supports it, citing the
excerpt's URL verbatim — it is instructed never to invent capabilities or
links, and to ask questions when unsure. When it does report one, the UI
shows a **"This might already exist"** card with the summary and a docs
link, plus "That solves it" (fires `assist_deflected`, returns to the
board, no post is created) and "Not quite — continue" (proceeds
normally).

The interviewer also sees similar existing posts with their **status,
vote count and latest team reply**, and is instructed to confirm likely
duplicates in its first question ("Is this the same as 'X', which is
already in progress?"). Synthesis responses include those duplicates with
their statuses so the UI can offer "vote instead".

## Privacy note

When assist is enabled, the following are sent to **Anthropic's API**
(`api.anthropic.com`, or your `ASSIST_API_URL`) under *your* API key and
data agreement: the submitter's draft title/body and answers, the topic
label, up to five similar posts (title, status, votes, latest team
reply), **your product briefing**, and **up to three documentation
excerpts** from the knowledge base. Nothing else leaves your Worker; the
model gets no tools. When assist is disabled nothing is ever sent. Say so
in your privacy policy if you enable it.

## Failure behavior (fail open)

- Interview call fails, times out (30s), or returns malformed output ⇒
  the API returns `{questions: []}` and the UI submits normally.
- Synthesis fails or produces an invalid post ⇒ `502`; the UI posts the
  original draft (with the transcript attached for staff).
- The feedback text is treated strictly as data — the system prompt
  instructs the model to ignore any instructions embedded in it, and both
  responses are schema-validated server-side before use.

## API surface

- `POST /api/v1/assist/interview` (member, 10/h/user + 20/h/IP):
  `{title, body?, topic?, locale?}` → `{questions: [{id, question}], model}`.
- `POST /api/v1/assist/synthesize` (member, 10/h/user): adds
  `answers: [{question, answer}]` (≤3, each ≤2000 chars) →
  `{synthesis: {title, body, suggestedTopic?}, duplicates?, model}`.
- `POST /api/v1/posts` accepts an optional `interview` object
  (`{originalTitle, originalBody?, questions, answers, model}`, ≤20KB)
  stored in `post_interviews`; `GET /api/v1/posts/:idOrSlug` includes it
  for staff callers only.

Funnel events: `assist_offered → assist_answered | assist_skipped →
assist_applied`, flowing through the normal events pipeline into
`/api/v1/staff/metrics`.
