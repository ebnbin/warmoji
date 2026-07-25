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
  // src/experiments/battleExperiment.ts 这一个 facade 接入主干，各自包内自由互引。
  // 用基础规则（非 @typescript-eslint 版）以免覆盖上面那条 phaser 规则；type import 一并禁——
  // 类型耦合虽然编译期擦除，但删某一侧时照样让主干编译不过，对「一步拆干净」是同等障碍。
  {
    files: ['src/**/*.ts', 'e2e/**/*.ts'],
    ignores: ['src/ecs/**/*.ts', 'src/arcade/**/*.ts', 'src/experiments/**'],
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
                '战斗实现（src/arcade/ 与 src/ecs/）是两套可互相替换的并列分支：一律经 src/experiments/battleExperiment.ts 调用，不要直接 import（这样两侧的耦合面才数得清、淘汰其一时能一步拆干净）',
            },
          ],
        },
      ],
    },
  },
  // 战斗域边界护栏：src/war/ 是战斗场景的地基（两套实现 + HUD 共用），大厅页
  // （菜单/图鉴/工坊/设置/商店/卡牌/整编/结算）与启动流程不得依赖它——战斗场景相对
  // 大厅是独立的，这条边界一破，「战斗是一块可整体替换的东西」这个前提就没了。
  // 必须排在上面那条实现隔离护栏之后：flat config 里同名规则后者整个替换前者，
  // 故这里把 war 与两套实现的 pattern 一并给出（大厅页三者都不该碰）。
  // main.ts 不在此列：它要把战斗场景与 HUD 注册进 Phaser。
  {
    files: ['src/menu/**/*.ts', 'src/boot/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/war', '**/war/*', '**/war/**'],
              message:
                'src/war/ 是战斗域地基，大厅页不该依赖它；若确实需要某份数据，说明它属于共享数据层（各 registry），应留在原包而非 war/',
            },
            {
              group: [
                '**/ecs', '**/ecs/*', '**/ecs/**',
                '**/arcade', '**/arcade/*', '**/arcade/**',
                'bitecs',
              ],
              message:
                '战斗实现（src/arcade/ 与 src/ecs/）一律经 src/experiments/battleExperiment.ts 调用',
            },
          ],
        },
      ],
    },
  },
  // 反方向同样要拦：战斗侧不得依赖大厅页。通用控件已抽到 src/ui/，
  // 战斗 HUD 要用滚动容器就从那里取——之前 war/UIScene 直接 import menu/scroll，
  // 正是因为只拦了 menu → war 这一个方向才一直没被发现。
  {
    files: ['src/war/**/*.ts', 'src/arcade/**/*.ts', 'src/ecs/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../menu/*', '../menu/**', '../../menu/*', '../../menu/**'],
              message: '战斗侧不得依赖大厅页；通用控件在 src/ui/，业务数据在 src/data/',
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
      'src/boot/PreloadScene.ts',
      'src/war/UIScene.ts',
      'src/war/Joystick.ts',
      'src/war/damageFont.ts',
      'src/core/fx.ts',
      'src/menu/*Scene.ts',
      // 旧框架（arcade）整包是表现层：Scene 继承 + Arcade Physics body
      'src/arcade/**/*.ts',
      // ECS 实验：宿主场景 + 自绘渲染层触碰 Phaser/WebGL（表现层）；ECS 逻辑文件仍禁 phaser
      'src/ecs/EcsBattleScene.ts',
      'src/ecs/render/**/*.ts',
      'src/experiments/*.ts',
      // ui 整包是通用控件层（Phaser 容器/图形/输入）
      'src/ui/**/*.ts',
      'src/emoji/textures.ts',
      'src/emoji/thumbs.ts',
      'src/emoji/virtualGrid.ts',
      'src/core/apply.ts',
      'src/war/diagnostics.ts',
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
  // 它是叶子——只许向下依赖 core 与 assets（外加 audio 的 SfxId 类型），不得依赖任何
  // 业务包。一旦 data 反向引用 war/run/menu，「内容与玩法分离」就名存实亡。
  {
    files: ['src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // 显式列出禁止的业务包：no-restricted-imports 的 group 不支持 '!' negation
              //（试过 ['../*', '!../core/*'] —— 负向被忽略，连 core 一起拦），故只能正向枚举。
              // 新增顶层包时记得同步这张表。
              group: [
                '../war/*', '../war/**',
                '../arcade/*', '../arcade/**',
                '../ecs/*', '../ecs/**',
                '../experiments/*', '../experiments/**',
                '../run/*', '../run/**',
                '../menu/*', '../menu/**',
                '../boot/*', '../boot/**',
                '../debug/*', '../debug/**',
                '../emoji/*', '../emoji/**',
                '../audio/bgm', '../audio/music',
              ],
              message: 'data 是内容叶子层：只可依赖 core / assets（及 audio 的 SfxId 类型），不得反向依赖业务包',
            },
          ],
        },
      ],
    },
  },
  // core 是地基：任何游戏都会用到的通用层，可依赖 Phaser，不得依赖业务包
  //（类型引用也不行——换一个游戏要能整目录原样带走）
  {
    files: ['src/core/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*'],
              message: 'core 不得 import src 中 core 以外的包（地基不向上引用）',
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
