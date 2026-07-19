# Warmoji

emoji 幸存者 web 游戏：Phaser 3 + Vite + TypeScript。纯 vibe coding 个人项目：用户只在聊天里提需求（中文），不看代码、不 review；agent 全权开发、测试、部署，验证做多深按改动大小自行判断——项目允许出错，不必用重流程换确定性。代码即 SSOT，文档与注释能简则简。

## 项目事实

- `main` 直接 push 即上线（无 PR、不开分支，Vercel 自动部署 → https://warmoji.ebnbin.dev）；页面右下角 `#build-badge` 显示当前构建的 commit 短 hash
- 无 CI（用户要求删除 workflows，勿加回）：质量验证 = 本地 `npm run check`
- 不改 package.json 的 version，版本以 commit hash 为准（用户要求）
- src 按业务域分包。一个实体的所有代码放进同一个包：Def 类型、注册表、纯逻辑、运行时结构体和相关机器代码都在一起。core 包只放任何游戏都用得上的通用代码，禁止 import 业务包
- 纯逻辑和界面表现写在同一个包的不同文件里。纯逻辑文件禁止 import phaser（eslint 白名单强制；DOM/WebAudio 没有工具强制，靠自觉）。单元测试只测纯逻辑文件，测试文件和被测文件放同一目录
- 纯逻辑文件之间的 import（指真实代码引用，纯类型引用不算）不允许形成包与包之间的循环。例外是 `*Scene.ts`：场景要读所有状态，它引用谁都行
- 内容管线：角色/敌人/道具这些数据在 `defs/` 目录用 TS 书写，`npm run gen`（dev/build/test 前自动跑）校验后生成 `src/assets/`（gitignore，不要手改）；运行时直接信任生成的 JSON，不做任何校验。想调数值，去改 defs/
- 手感和节奏类的调参常量（击退力度、刷怪间隔这类）不进 defs/，就写成普通 TS 常量，放在用它的那个包里
- 数值一律用人类单位：距离和速度用格，角度用度（0–360），**禁止在数值里预先乘 UNIT 或 π**——需要像素或弧度时，在用的地方换算
- 正文字号 26 逻辑 px 是真机可读下限（手机上实际显示只有一半大，容器截图里看不出来），不要再调小

## 环境陷阱（远程容器）

- shell 直连 api.github.com 会被拦且静默失败，查仓库状态用 GitHub MCP 工具
- 不要跑 `playwright install`：预装的 Chromium 已经在 playwright.config.ts 里配好
- Playwright 每次运行会清空 `test-results/`，要留的截图先拷走
- 容器没有 GPU，软件渲染帧率极低是环境现象，和线上真机无关；测移动速度这类指标用游戏时钟，不要用墙钟
