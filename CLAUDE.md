# Warmoji

emoji 幸存者 web 游戏：Phaser 3 + Vite + TypeScript。纯 vibe coding 个人项目：用户只在聊天里提需求（中文），不看代码、不 review；agent 全权开发、测试、部署，验证做多深按改动大小自行判断——项目允许出错，不必用重流程换确定性。代码即 SSOT，文档与注释能简则简。

## 项目事实

- `main` 直接 push 即上线（无 PR、不开分支，Vercel 自动部署 → https://warmoji.ebnbin.dev）；页面右下角 `#build-badge` 显示构建的 commit 短 hash
- 无 CI（用户要求删除 workflows，勿加回）：质量验证 = 本地 `npm run check`
- 不改 package.json 的 version，版本以 commit hash 为准（用户要求）
- src 按业务域分包：boot/lib/screen/emoji/audio/characters/enemies/weapons/items/maps/run/battle/menu/debug；纯逻辑与表现文件同包不同文件，import phaser 仅限 eslint 白名单（eslint.config.js；DOM/WebAudio 越界靠约定），单测只测纯文件、与被测同居
- 包间值依赖必须无环，唯一豁免 battle⇄maps（引擎基类查地图注册表 / 地图场景继承基类）；纯类型循环无害不禁
- 玩法数值集中在 `src/config.ts`（第二段重构将按实体拆入各包）
- UI 字号用 `src/lib/fonts.ts` 的 FONT token：手机 fitScale≈0.5，正文 26 逻辑 px 是实机可读下限（容器里看不出来）

## 环境陷阱（远程容器）

- shell 直连 api.github.com 被拦且静默失败，查仓库状态用 GitHub MCP 工具
- 别跑 `playwright install`：预装 Chromium 已由 playwright.config.ts 接管
- Playwright 每次运行会清空 `test-results/`，要留的截图先拷走
- 容器无 GPU（软件渲染）帧率极低是环境现象，与线上真机无关；测移动速度之类用游戏时钟，别用墙钟
