---
name: steward
description: Repo conventions for driving Chalkboard PRs to green — the validation loop, hard gates, and merge etiquette.
---

# Driving a Chalkboard PR

## Before every push

Run the full CI mirror from the repo root and push only when all four
pass:

```bash
pnpm lint && pnpm format:check && pnpm build && pnpm test
```

For a CI fix, reproduce the failing check locally first, then show the
same command passing. Fix formatting with `pnpm format`.

## Hard gates (never trade these for a green build)

- `packages/sdk/test/size.spec.js` failing means the SDK got too big.
  Shrink the change; never raise `LIMIT_BYTES`.
- No new runtime `dependencies` in `core`, `worker`, or `sdk`, and no
  frameworks in the SDK (see CLAUDE.md hard rules).
- Never skip, disable, or quarantine a test.
- Worker test failures reproduce locally (`pnpm -F @chalkcom/worker
  test`) — they run in workerd, so "works in Node" proves nothing.

## Conventions

- User-facing changes carry a changeset; add one with `pnpm changeset`
  if the PR lacks it.
- Regenerate `pnpm-lock.yaml` only via `pnpm install` — never edit it
  by hand.
- Resolve merge conflicts by merging the base branch into the PR head;
  never rebase or force-push someone else's branch.
- Migrations are append-only: conflicts in
  `packages/worker/migrations/` mean renumbering your new file, not
  editing existing ones.
