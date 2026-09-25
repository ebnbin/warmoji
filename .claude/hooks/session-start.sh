#!/bin/bash
set -euo pipefail
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then exit 0; fi
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
  git fetch --unshallow origin || echo "session-start: unshallow 失败，稍后手动 git fetch --unshallow origin" >&2
fi

git config author.name "Bin Zhang"
git config author.email "ebnbin@gmail.com"

git config core.hooksPath "$(git rev-parse --show-toplevel)/.claude/hooks/git"

npm install --no-audit --no-fund --no-save
npm run gen
