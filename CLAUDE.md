# Warmoji

emoji 幸存者 web 游戏：Phaser 3 + Vite + TypeScript。纯 vibe coding 项目——用户只在聊天里提需求，不看代码、不 review；agent 全权开发、测试、部署。代码即 SSOT，文档与注释能简则简。

## 工作流

- `main` 即生产环境，直接 push（无 PR），Vercel 自动部署到 https://warmoji.ebnbin.dev
- 推送前 `npm run check` 必须全绿
- 推送后验证线上：抓 https://warmoji.ebnbin.dev 的 `/assets/*.js` 应包含新 commit 短 hash（页面右下角 `#build-badge` 同理）
- 有可见变化时把 Playwright 截图发给用户
- 验证只针对改动本身（单测/针对性探针），不必每次跑 `scripts/playtest.mjs` 全 20 波平衡回归——仅在用户要求或大改数值体系时跑
- 与用户中文沟通；一次聊天聚焦少量问题
- 不要改 package.json 的 version（用户明确要求，版本以 commit hash 为准）

## 环境陷阱（远程容器）

- shell 直连 api.github.com 被拦且静默失败，查 CI/仓库状态用 GitHub MCP 工具
- 不要运行 `playwright install`，本地用预装 Chromium（playwright.config.ts 已处理）
- Playwright 每次运行会清空 `test-results/`：要发给用户或留存的截图先拷到别处
- 容器无 GPU（SwiftShader 软件渲染），大 canvas 下帧率极低是环境现象，与线上真机无关

## 代码约定

- 玩法数值集中在 `src/core/config.ts`；`src/core` 为纯逻辑层（禁 phaser/DOM），单测都在这层
- 武器系统：类型与纯判定在 `core/weapons.ts`，运行时在 `src/weapons/`；新武器 = 新 kind + 运行时类 + `create.ts` 注册，角色在 config 里持 0..n 把
