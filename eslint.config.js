import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/', 'public/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // 纯度护栏：纯逻辑文件禁 import phaser（type import 放行——编译期擦除，无运行时依赖）。
  // 表现层文件显式白名单；新增 Phaser 文件必须在此登记——这道摩擦是有意的。
  // 边界的完整定义是「能在 node 的 vitest 里 import」，DOM/WebAudio 越界靠约定与单测把守。
  // 实现隔离护栏：两套并列的战斗实现（src/arcade/ 旧框架、src/ecs/ 实验）都只能经
  // src/battle.ts 这一个 facade 接入主干，各自包内自由互引。
  // 用基础规则（非 @typescript-eslint 版）以免覆盖上面那条 phaser 规则；type import 一并禁——
  // 类型耦合虽然编译期擦除，但删某一侧时照样让主干编译不过，对「一步拆干净」是同等障碍。
  {
    files: ['src/**/*.ts', 'e2e/**/*.ts'],
    ignores: ['src/ecs/**/*.ts', 'src/arcade/**/*.ts', 'src/battle.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/ecs', '**/ecs/*', '**/ecs/**', './ecs/*', '../ecs/*',
                '**/arcade', '**/arcade/*', '**/arcade/**', './arcade/*', '../arcade/*',
                'bitecs',
              ],
              message:
                '战斗实现（src/arcade/ 与 src/ecs/）是两套可互相替换的并列分支：一律经 src/battle.ts 调用，不要直接 import（这样两侧的耦合面才数得清、淘汰其一时能一步拆干净）',
            },
          ],
        },
      ],
    },
  },
  // 战斗域边界护栏：src/war/ 只放战斗世界本身——能力/命中/特效/敌人 AI/世界几何/换算，
  // 判据是「两套战斗实现至少有一方真的 import 它」。全部页面（含 HUD 的 UIScene）都在
  // src/scene/，一律不得依赖 war/——战斗场景相对页面是独立的，这条边界一破，
  // 「战斗是一块可整体替换的东西」这个前提就没了。
  // 必须排在上面那条实现隔离护栏之后：flat config 里同名规则后者整个替换前者，
  // 故这里把 war 与两套实现的 pattern 一并给出（页面三者都不该碰）。
  // main.ts 不在此列：它要把战斗场景与 HUD 注册进 Phaser。
  {
    files: ['src/scene/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/war', '**/war/*', '**/war/**'],
              message:
                'src/war/ 只放战斗世界本身，页面不该依赖它。若页面与战斗都要用，说明它是接缝（放 src/run/，如 hudHost）或共享数据（放 src/data/），不该留在 war/',
            },
            {
              group: [
                '**/ecs', '**/ecs/*', '**/ecs/**',
                '**/arcade', '**/arcade/*', '**/arcade/**',
                'bitecs',
              ],
              message:
                '战斗实现（src/arcade/ 与 src/ecs/）一律经 src/battle.ts 调用',
            },
          ],
        },
      ],
    },
  },
  // 反方向同样要拦：战斗侧不得依赖页面层。通用控件已抽到 src/ui/。
  // 历史上这个方向漏过两次：UIScene 曾直接 import menu/scroll；两套战斗框架曾
  // import type { UIScene } 只为读一个摇杆向量（现已收成 run/hudHost 的 HudInput 契约）。
  {
    files: ['src/war/**/*.ts', 'src/arcade/**/*.ts', 'src/ecs/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../scene/*', '../scene/**', '../../scene/*', '../../scene/**'],
              message: '战斗侧不得依赖场景层；通用控件在 src/ui/，业务数据在 src/data/',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: [
      'src/main.ts',
      'src/scene/*Scene.ts',
      // 基准面板/环境诊断/采样器：Phaser 帧阶段事件、渲染器信息、自绘面板
      'src/bench/panel.ts',
      'src/bench/diagnostics.ts',
      'src/bench/metrics.ts',
      'src/war/damageFont.ts',
      'src/util/fx.ts',
      // 旧框架（arcade）整包是表现层：Scene 继承 + Arcade Physics body
      'src/arcade/**/*.ts',
      // ECS 实验：宿主场景 + 自绘渲染层触碰 Phaser/WebGL（表现层）；ECS 逻辑文件仍禁 phaser
      'src/ecs/EcsBattleScene.ts',
      'src/ecs/render/**/*.ts',
      'src/battle.ts',
      // ui 整包是通用控件层（Phaser 容器/图形/输入）
      'src/ui/**/*.ts',
      'src/emoji/textures.ts',
      'src/emoji/thumbs.ts',
      'src/util/apply.ts',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'phaser',
              message: '纯逻辑文件禁 import phaser；确属表现层则把文件加进 eslint.config.js 白名单',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  // data 是内容层：各张游戏数据表（读 src/assets/*.json）+ 其类型 + 对表的纯查询。
  // 它是叶子——只许向下依赖 util 与 assets，不得依赖任何业务包。
  // 一旦 data 反向引用 war/run/scene，「内容与玩法分离」就名存实亡。
  {
    files: ['src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // 显式列出禁止的业务包：no-restricted-imports 的 group 不支持 '!' negation
              //（试过 ['../*', '!../util/*'] —— 负向被忽略，连 util 一起拦），故只能正向枚举。
              // 新增顶层包时记得同步这张表。
              group: [
                '../war/*', '../war/**',
                '../arcade/*', '../arcade/**',
                '../ecs/*', '../ecs/**',
                '../battle',
                '../run/*', '../run/**',
                '../save/*', '../save/**',
                '../scene/*', '../scene/**',
                '../debug', '../manifest',
                '../emoji/*', '../emoji/**',
                '../audio/*', '../audio/**',
              ],
              message: 'data 是内容叶子层：只可依赖 util / assets，不得反向依赖业务包',
            },
          ],
        },
      ],
    },
  },
  // defs 是创作层：内容与数值的手写源，经 scripts/gen-defs.ts 校验后产出 src/assets/*.json。
  // 它对 src 的依赖只该是「这张表长什么样」——即 src/data/ 里的数据类型定义；
  // 另允许 src/util/ 的纯工具（如 palette.hslToInt，让地图配色能按 HSL 书写）。
  // 一旦 defs 够到 war/audio/scene 等功能包，创作层就跟着玩法实现走了：
  // 那些包本该反过来消费内容，删改其中任一个都会连累「内容怎么写」。
  {
    files: ['defs/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // 同 data 那条：group 不支持 '!' negation，只能正向枚举禁止项。
              // src/ 下新增顶层包时记得同步这张表。
              group: [
                '../src/war/*', '../src/war/**',
                '../src/arcade/*', '../src/arcade/**',
                '../src/ecs/*', '../src/ecs/**',
                '../src/battle', '../src/debug', '../src/manifest',
                '../src/run/*', '../src/run/**',
                '../src/save/*', '../src/save/**',
                '../src/scene/*', '../src/scene/**',
                '../src/ui/*', '../src/ui/**',
                '../src/emoji/*', '../src/emoji/**',
                '../src/audio/*', '../src/audio/**',
                // 产物是 defs 的下游，创作层读它就成环了
                '../src/assets/*', '../src/assets/**',
              ],
              message:
                'defs 是创作层：类型一律取自 src/data/（数据类型定义所在），纯工具可取 src/util/；不得依赖功能包。若某个类型现在住在功能包里，说明它本就该搬进 src/data/',
            },
          ],
        },
      ],
    },
  },
  // types 是纯类型层：只放 interface / type，零运行时代码。
  // 它是 defs（创作层）与全部业务包共同的形状契约——一旦混进函数或常量，
  // 「这张表长什么样」就又埋回了实现里。用 no-restricted-syntax 硬性钉死，
  // 不靠自觉：新增任何 export function / export const 都会红。
  {
    files: ['src/types/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportNamedDeclaration > FunctionDeclaration',
          message: 'types 只放类型声明：函数属于用它的那一层（规则去 war/ 或 data/，只有一个消费方的直接放消费方）',
        },
        {
          selector: 'ExportNamedDeclaration > VariableDeclaration',
          message: 'types 只放类型声明：常量与表属于 data/',
        },
      ],
    },
  },
  // util 是杂物层：一堆没有更好归处的静态方法。它**不是**干净的 infra——
  // 里面既有真能带走的（rng / vec / storage / mask），也有纯本作专属的
  // （units 的 UNIT 标定、fonts 字号阶、background 渐变、fx 战斗特效、format）。
  // 唯一还成立的约束是不向上引用；别把它当"换个游戏能整目录搬走"的地基。
  {
    files: ['src/util/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*'],
              message: 'util 不得 import src 中 util 以外的包（杂物层不向上引用）',
            },
          ],
        },
      ],
    },
  },
  // 数据表的唯一入口：assets/*.json 只许 data/ 与 types/ 读
  //（前者导出表，后者用 keyof typeof 派生 id 联合类型）。别处要用就 import data/ 的常量。
  // 不设这条的下场是同一张表被多处各读一遍、各取一半字段：历史上 feel.json 被
  // data/feel.ts 与 war/orbit.ts 瓜分，progression.json 更散在 data/waves、
  // run/recruit、war/xp 三处——想知道「某个参数在哪」得翻遍全仓。
  // 这条同时把「表 vs 算法」钉死：war/ 与 run/ 只放算法，表一律回 data/。
  {
    files: ['src/**/*.ts'],
    ignores: ['src/data/**/*.ts', 'src/types/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/assets/*.json', '**/assets/**/*.json'],
              message:
                'assets/*.json 只许 data/ 与 types/ 读：把表搬进 data/ 并导出常量，这里 import 那个常量',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      // 含 Playwright 探针：page.evaluate 回调在浏览器执行，需要浏览器全局
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        window: 'readonly',
        localStorage: 'readonly',
      },
    },
  },
)
