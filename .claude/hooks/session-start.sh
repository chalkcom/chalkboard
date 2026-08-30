#!/bin/bash
set -euo pipefail

# Install workspace dependencies for Claude Code on the web sessions so
# linters and tests work immediately. No-op in local sessions, where the
# checkout is expected to be set up already.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
    exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# The repo pins pnpm via package.json#packageManager; corepack provides
# that exact version when the container image doesn't ship pnpm.
if ! command -v pnpm > /dev/null 2>&1; then
    corepack enable
fi

pnpm install
