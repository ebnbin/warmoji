# Warmoji — 开发约定

一个部署在 Vercel 上的 web 游戏。全部开发由 Claude 通过聊天驱动：用户只提需求、不 review 代码，agent 负责编码、测试、部署。

## 与用户的协作方式

- 全程使用中文交流。
- 一次聊天只解决一个问题：每项决策单独提出、确认后再进行下一项，不要一次抛出一堆方案和问题。
- 用户不看代码，质量完全依赖自动化验证（见下）。
- 需要用户在浏览器里操作或决策时，给出最小、明确的步骤。

## 已确认的决策

- 仓库保持 **private**。
- 托管：**Vercel**（Git 集成，`main` 分支即生产环境）；用户的个人域名后续绑定。
- 工作流：**直接 push `main`，不走 PR**；用户已授权 agent 自行管理 `main`。
- 技术栈：Vite + TypeScript(strict) + Phaser 3；Vitest 单测；Playwright 冒烟测试。
- 目标设备：桌面 + 手机（触屏）都要支持。
- 玩法方向：**尚未确认**。已向用户提议「emoji 幸存者」（割草生存，见 docs/GDD.md），动手写玩法前必须先得到用户明确同意。

## 质量门槛（每次推送前必须全绿）

```
npm run check   # typecheck + lint + 单测 + 构建 + Playwright 冒烟
```

- 推送后确认 Vercel 部署成功，并核对线上页面右下角的构建徽章 = 刚推送的 commit 短 hash。
- 有可见变化时，用 Playwright 截图（test-results/smoke.png）发给用户。

## 代码结构约定

- `src/core/`：纯游戏逻辑（数值、状态机、随机数等），**禁止 import phaser、禁止触碰 DOM**；单元测试集中在这里，与实现文件同目录（`*.test.ts`）。
- `src/scenes/`：Phaser 场景，只做渲染和输入绑定，逻辑尽量下沉到 core。
- 随机数一律使用 `src/core/rng.ts` 的种子化 `Rng`，不直接用 `Math.random()`，保证可测试、可复现。
- `e2e/`：Playwright 冒烟测试，底线是页面能加载、canvas 出现、无 console error。

## 版本徽章

页面右下角 `#build-badge` 显示构建 commit 短 hash（构建时注入：Vercel 取 `VERCEL_GIT_COMMIT_SHA`，CI 取 `GITHUB_SHA`，本地取 `git rev-parse`，兜底 `dev`），用于确认用户看到的是哪个版本。
