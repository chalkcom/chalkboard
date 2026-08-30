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
| config row `assist.model` | D1 | overrides `ASSIST_MODEL` at runtime (`PUT /api/v1/config` as staff with `{"assist.model": "claude-sonnet-5"}`). |
| `createFeedbackApp({assist: {model}})` | code | wins over both. |

Model precedence: **code option → config row → env var → default**.

### Choosing a model

`claude-opus-5` (default) gives the best questions and synthesis quality.
Cheaper alternatives that work well for this task: **`claude-sonnet-5`**
and **`claude-haiku-4-5`**. Expect roughly **1–3¢ per assisted post** on
`claude-opus-5` (one interview + one synthesis call, ~1–2K tokens each,
with the system prompt cached) and **sub-cent** on `claude-haiku-4-5`.

## Privacy note

When assist is enabled, the submitter's draft title/body, their answers,
the topic label, and the titles of up to five similar existing posts are
sent to **Anthropic's API** (`api.anthropic.com`) under *your* API key and
data agreement. Nothing else leaves your Worker; the model gets no tools
and no other board data. When assist is disabled nothing is ever sent.
Say so in your privacy policy if you enable it.

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
