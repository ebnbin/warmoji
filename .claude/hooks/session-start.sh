#!/bin/bash
# SessionStart hook：只在 Claude Code 云端容器里跑（每个 session 都是全新容器）。
# 只做环境准备，不碰分支——SessionStart 在 resume / compact / clear 时同样触发，
# 那时切分支会把正在做的 PR 切走。分支步骤由 agent 按 CLAUDE.md 执行。
# 同步模式：跑完 session 才开始，依赖就位后 agent 才动手。
set -euo pipefail
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then exit 0; fi
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# 完整历史：容器常是浅克隆，rebase / merge-base 都要全量历史（网络失败不阻断启动）
if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
  git fetch --unshallow origin || echo "session-start: unshallow 失败，稍后手动 git fetch --unshallow origin" >&2
fi

# 提交身份：作者是用户（GitHub contributions 认作者邮箱），提交者保持容器的 Claude 身份
#（Verified 认提交者的签名）。只设 author.*，不要改 user.*
git config author.name "Bin Zhang"
git config author.email "ebnbin@gmail.com"

# main 守卫：pre-commit 拒绝在 main 上提交，pre-push 拒绝推向 main。脚本在仓库里，随版本走
git config core.hooksPath "$(git rev-parse --show-toplevel)/.claude/hooks/git"

# 依赖与产物。npm install 而非 ci：容器状态会缓存，ci 每次先清空 node_modules；
# --no-save 保证 hook 永远不改 package-lock.json
npm install --no-audit --no-fund --no-save
npm run gen
