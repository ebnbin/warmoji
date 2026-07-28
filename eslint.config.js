import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// ── 各条 import 护栏的 pattern，提成常量供下面的块组合 ─────────────────────────
//
// **为什么要组合而不是各写各的**：flat config 里同名规则「后者整个替换前者」，
// 而这些块的 files 是重叠的（src/** ⊃ src/ecs/** ⊃ ...）。于是一个覆盖面更大的块
// 只要排在后面，就会把前面所有更具体的 no-restricted-imports 静默清空——
// 不报错、不警告，护栏就此形同虚设。这事真发生过一次：assets/*.json 那条作为
// 最后一个 src/** 块加进来，一口气废掉了它前面的四条护栏，谁都没察觉。
// 故：**每个块必须自己列全「对该组文件生效的所有 pattern」**，由 eslint.test.ts
// 逐条实测每道护栏确实还会报错。

/** assets/*.json 只许 data/ 与 types/ 读 */
const NO_ASSETS_JSON = {
  group: ['**/assets/*.json', '**/assets/**/*.json'],
  message: 'assets/*.json 只许 data/ 与 types/ 读：把表搬进 data/ 并导出常量，这里 import 那个常量',
}

/** 两套战斗实现（含 bitecs）只能经 src/battle.ts 接入 */
const NO_BATTLE_IMPL = {
  group: [
    '**/ecs', '**/ecs/*', '**/ecs/**', './ecs/*', '../ecs/*',
    '**/arcade', '**/arcade/*', '**/arcade/**', './arcade/*', '../arcade/*',
    'bitecs',
  ],
  message:
    '战斗实现（src/arcade/ 与 src/ecs/）是两套可互相替换的并列分支：一律经 src/battle.ts 调用，不要直接 import（这样两侧的耦合面才数得清、淘汰其一时能一步拆干净）',
}

/** 战斗侧不得依赖页面层（任意深度的相对路径都要拦住） */
const NO_SCENE_FROM_BATTLE = {
  group: ['**/scene', '**/scene/*', '**/scene/**'],
  message: '战斗侧不得依赖场景层；通用控件在 src/ui/，业务数据在 src/data/',
}

/** 战斗侧不得依赖开发者工具 */
const NO_DEV_FROM_BATTLE = {
  group: ['**/dev', '**/dev/*', '**/dev/**'],
  message:
    'src/dev/ 是开发者工具（面板 / 帧采样 / 环境诊断），方向只能是它读战斗。战斗侧一旦依赖它，「开发者模式默认关」就不再等于「这些代码不参与正式游戏」——沙盒旋钮读的是 src/run/lab.ts，那才是两边都够得到的那一层',
}

/** 建实体只在 src/ecs/entities/ 下 */
const NO_ADD_ENTITY = {
  name: 'bitecs',
  importNames: ['addEntity'],
  message:
    '建实体只在 src/ecs/entities/ 下：一种实体一个工厂，组件包在那里一次挂齐。就地 addEntity 迟早漏挂组件，而漏挂是编译期查不出来的',
}

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/', 'public/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // 下划线前缀 = 「这个参数我不用，但签名要求它在」。默认规则只放过**尾部**未用参数，
  // 于是「实现某接口但一个参数都不用」的空实现（如 views.ts 里各图的默认 step）无处安放。
  {
    files: ['src/**/*.ts', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // 数据表的唯一入口：assets/*.json 只许 data/ 与 types/ 读
  //（前者导出表，后者用 keyof typeof 派生 id 联合类型）。别处要用就 import data/ 的常量。
  // 不设这条的下场是同一张表被多处各读一遍、各取一半字段：历史上 feel.json 被
  // data/feel.ts 与两套战斗的轨道算法瓜分，progression.json 更散在 data/waves、
  // run/recruit、run/xp 三处——想知道「某个参数在哪」得翻遍全仓。
  // 这条同时把「表 vs 算法」钉死：两套战斗实现与 run/ 只放算法，表一律回 data/。
  {
    files: ['src/**/*.ts'],
    ignores: ['src/data/**/*.ts', 'src/types/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [NO_ASSETS_JSON] }],
    },
  },
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
      'no-restricted-imports': ['error', { patterns: [NO_BATTLE_IMPL, NO_ASSETS_JSON] }],
    },
  },
  // 页面层不得依赖任何战斗实现。从前还有第三个 pattern（src/war/ 那层两套共用的战斗
  // 世界），现在它已按架构拆回两侧各自包内——「战斗是一块可整体替换的东西」这个前提
  // 由 NO_BATTLE_IMPL 一条就守得住。
  // 必须排在上面那条实现隔离护栏之后：flat config 里同名规则后者整个替换前者。
  // main.ts 不在此列：它要把战斗场景与 HUD 注册进 Phaser。
  {
    files: ['src/scene/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [NO_BATTLE_IMPL, NO_ASSETS_JSON] }],
    },
  },
  // 反方向同样要拦：战斗侧不得依赖页面层。通用控件已抽到 src/ui/。
  // 历史上这个方向漏过两次：UIScene 曾直接 import menu/scroll；两套战斗框架曾
  // import type { UIScene } 只为读一个摇杆向量（现已收成 run/hudHost 的 HudInput 契约）。
  {
    files: ['src/arcade/**/*.ts', 'src/ecs/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [NO_SCENE_FROM_BATTLE, NO_DEV_FROM_BATTLE, NO_ASSETS_JSON] }],
    },
  },
  // 建实体的唯一入口护栏：addEntity 只准出现在 src/ecs/entities/ 下，一种实体一个工厂。
  // 教训来自一个真实缺陷：持有物子实体曾在 kinds/ 里就地 addEntity + 手挂组件，漏了
  // Owner，于是回旋镖主镖一飞出去就对推进系统隐形（那两个系统都以 Owner 为准入），
  // 卡在半空不飞不伤不回，85% 的时间都是这个状态。同一批代码里 spawnTwin 是挂了 Owner
  // 的——**规则有例外就得靠人记，而人会忘**。编译器与类型都拦不住「少挂一个组件」，
  // 能拦住的只有「这种实体只有一个地方造得出来」。
  // 必须重述上面那条场景层 pattern：flat config 里同名规则后者整个替换前者。
  {
    files: ['src/ecs/**/*.ts'],
    ignores: ['src/ecs/entities/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [NO_ADD_ENTITY], patterns: [NO_SCENE_FROM_BATTLE, NO_DEV_FROM_BATTLE, NO_ASSETS_JSON] },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: [
      'src/main.ts',
      'src/scene/*Scene.ts',
      // 开发者工具整包是表现层：Phaser 帧阶段事件、渲染器信息、自绘面板
      'src/dev/**/*.ts',
      'src/util/fx.ts',
      // 旧框架（arcade）整包是表现层：Scene 继承 + Arcade Physics body
      'src/arcade/**/*.ts',
      // ECS 实验：宿主场景 + 自绘渲染层触碰 Phaser/WebGL（表现层）；ECS 逻辑文件仍禁 phaser
      'src/ecs/EcsBattleScene.ts',
      'src/ecs/views.ts', // 各图的视觉实现（每张图一份，scene 只认接口）
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
  // 一旦 data 反向引用 run/scene 或某套战斗实现，「内容与玩法分离」就名存实亡。
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
            NO_BATTLE_IMPL,
          ],
        },
      ],
    },
  },
  // defs 是创作层：内容与数值的手写源，经 scripts/gen-defs.ts 校验后产出 src/assets/*.json。
  // 它对 src 的依赖只该是「这张表长什么样」——即 src/data/ 里的数据类型定义；
  // 另允许 src/util/ 的纯工具（如 palette.hslToInt，让地图配色能按 HSL 书写）。
  // 一旦 defs 够到 audio/scene 等功能包，创作层就跟着玩法实现走了：
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
      // types 与 data 一样是 assets/*.json 的合法读者（它用 keyof typeof 派生 id 联合类型），
      // 故这里把上面实现隔离块里的 pattern 重列一遍、独独去掉 NO_ASSETS_JSON
      'no-restricted-imports': ['error', { patterns: [NO_BATTLE_IMPL] }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportNamedDeclaration > FunctionDeclaration',
          message: 'types 只放类型声明：函数属于用它的那一层（内容规则去 data/，战斗规则去用它那套实现的包内，只有一个消费方的直接放消费方）',
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
