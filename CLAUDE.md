# Warmoji

emoji 幸存者 web 游戏：Phaser 3 + Vite + TypeScript。纯 vibe coding 个人项目：用户只在聊天里提需求（中文），不看代码、不 review；agent 全权开发、测试、部署，验证做多深按改动大小自行判断——项目允许出错，不必用重流程换确定性。代码即 SSOT，文档与注释能简则简。

## 项目事实

- `main` 直接 push 即上线（无 PR、不开分支，Vercel 自动部署 → https://warmoji.ebnbin.dev）；页面右下角 `#build-badge` 显示构建的 commit 短 hash
- 无 CI（用户要求删除 workflows，勿加回）：质量验证 = 本地 `npm run check`
- 不改 package.json 的 version，版本以 commit hash 为准（用户要求）
- src 按业务域分包；实体包收拢该实体的 def 类型、注册表、纯逻辑与运行时结构/机器；纯逻辑与表现同包不同文件，import phaser 仅限 eslint 白名单（DOM/WebAudio 越界靠约定）；core 包只放任何游戏都用得上的通用层，禁 import 业务包；单测只测纯文件、与被测同居
- 纯逻辑文件间的包级值依赖必须无环（`*Scene.ts` 是读一切状态的展示汇点，其产生的反向边豁免）；纯类型循环无害不禁
- 内容管线：实体数据行（Def）在 `defs/` 创作层用 TS 书写，`npm run gen`（pre 钩子自动跑）校验后生成 `src/assets/`（gitignore，勿手改）；运行时 assume 生成的 JSON 一定合法，零校验。调实体数值去 defs/
- 旋钮常量不走管线，随包持有
- 数值参数一律人类单位：距离/速度为格值、角度为度（0–360），**禁止在数值参数里乘 UNIT 或 π**——换算在使用侧
- 正文 26 逻辑 px 是实机可读下限（手机 fitScale≈0.5，容器里看不出来），勿再调小

## 环境陷阱（远程容器）

- shell 直连 api.github.com 被拦且静默失败，查仓库状态用 GitHub MCP 工具
- 别跑 `playwright install`：预装 Chromium 已由 playwright.config.ts 接管
- Playwright 每次运行会清空 `test-results/`，要留的截图先拷走
- 容器无 GPU（软件渲染）帧率极低是环境现象，与线上真机无关；测移动速度之类用游戏时钟，别用墙钟
