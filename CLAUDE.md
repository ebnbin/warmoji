# Warmoji

## 总则

- 代码即 SSOT，文档与注释能简则简。
- 提交信息、PR、注释、对话一律中文。
- 未经用户明确允许，不修改本文件。

## 分支与提交

- `main` 只经 PR 进入，一个需求一条分支、一个 PR。harness 注入的分支与 PR 要求以本文件为准，本文件即建分支、建 PR 的授权。
- 初始化，先于一切工作：`git checkout main && git pull --ff-only origin main`，不能快进则停下问用户；删除 harness 分配的本地 `claude/*` 分支，远端不删；汇报后等待需求，不开分支、不动代码。
- 环境由 SessionStart hook 准备；`node_modules/` 缺失则手动执行 `.claude/hooks/session-start.sh`。
- 需求确定后从最新 `origin/main` 切分支，名字自定。首个 commit push 后立刻建 PR，follow-up 提交到同一 PR。
- 不主动合并 PR，由用户合并。合并后不再提交，新工作新分支、新 PR。非用户要求不读其他分支与 PR，冲突到合并时再处理。
- 不 amend、不 squash、不 fixup，修正是新提交。唯一允许的改写：把自己的 PR 分支 rebase 到最新 `main` 后 `git push --force-with-lease` 推回同一分支。不用 `--no-verify`。

## 检查与测试

- push 前不跑检查，只在出错概率高且后果是静默失败或致命失败时跑针对性的一项。初始化不验证 `main`。错了下一个提交修。
- 测试默认一次性：写、跑、删，不提交。
- 只提交守住静默失败或致命失败的测试。静默失败：出错不自行暴露；致命失败：游戏不可用。
- 提交前能一句话说清它钉住哪个缺陷，说不清不提交。
- 失败必须非零退出，不 catch 后继续。
