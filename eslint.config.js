import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// flat config 同名规则后者整个替换前者，而各块 files 重叠：每个块必须自己列全对该组文件生效的
// 所有 pattern，由 eslint.test.ts 逐条实测

const NO_ASSETS_JSON = {
  group: ['**/assets/*.json', '**/assets/**/*.json'],
  message: 'assets/*.json 只许 data/ 与 types/ 读：把表搬进 data/ 并导出常量，这里 import 那个常量',
}

const NO_BATTLE_IMPL = {
  group: [
    '**/ecs', '**/ecs/*', '**/ecs/**', './ecs/*', '../ecs/*',
    '**/arcade', '**/arcade/*', '**/arcade/**', './arcade/*', '../arcade/*',
    'bitecs',
  ],
  message:
    '战斗实现（src/arcade/ 与 src/ecs/）是两套可互相替换的并列分支：一律经 src/battle.ts 调用，不要直接 import（这样两侧的耦合面才数得清、淘汰其一时能一步拆干净）',
}

const NO_SCENE_FROM_BATTLE = {
  group: ['**/scene', '**/scene/*', '**/scene/**'],
  message: '战斗侧不得依赖场景层；通用控件在 src/ui/，业务数据在 src/data/',
}

const NO_DEV_FROM_BATTLE = {
  group: ['**/dev', '**/dev/*', '**/dev/**'],
  message:
    'src/dev/ 是开发者工具（面板 / 帧采样 / 环境诊断），方向只能是它读战斗。战斗侧一旦依赖它，「开发者模式默认关」就不再等于「这些代码不参与正式游戏」——沙盒旋钮读的是 src/run/lab.ts，那才是两边都够得到的那一层',
}

const NO_ADD_ENTITY = {
  name: 'bitecs',
  importNames: ['addEntity'],
  message:
    '建实体一律走 entities/entity.ts 的 newEntity：编号越过组件数组容量时它先扩容，绕过它的写入会静默丢失',
}

const NO_NEW_ENTITY = {
  regex: '(^|/)entities/entity$',
  message:
    '建实体只在 src/ecs/entities/ 下：一种实体一个工厂，组件包在那里一次挂齐。就地建实体迟早漏挂组件，而漏挂是编译期查不出来的',
}

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/', 'public/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/data/**/*.ts', 'src/types/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [NO_ASSETS_JSON] }],
    },
  },
  // 用基础版 no-restricted-imports，与 phaser 那条 @typescript-eslint 版互不替换；type import 一并禁
  {
    files: ['src/**/*.ts', 'e2e/**/*.ts'],
    ignores: ['src/ecs/**/*.ts', 'src/arcade/**/*.ts', 'src/battle.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [NO_BATTLE_IMPL, NO_ASSETS_JSON] }],
    },
  },
  // 须排在上一块之后
  {
    files: ['src/scene/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [NO_BATTLE_IMPL, NO_ASSETS_JSON] }],
    },
  },
  {
    files: ['src/arcade/**/*.ts', 'src/ecs/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [NO_SCENE_FROM_BATTLE, NO_DEV_FROM_BATTLE, NO_ASSETS_JSON] }],
    },
  },
  // 须重列上一块的 pattern
  {
    files: ['src/ecs/**/*.ts'],
    ignores: ['src/ecs/entities/entity.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [NO_ADD_ENTITY], patterns: [NO_SCENE_FROM_BATTLE, NO_DEV_FROM_BATTLE, NO_ASSETS_JSON] },
      ],
    },
  },
  // 须排在上一块之后，并重列它的 path 与 pattern
  {
    files: ['src/ecs/**/*.ts'],
    ignores: ['src/ecs/entities/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [NO_ADD_ENTITY],
          patterns: [NO_NEW_ENTITY, NO_SCENE_FROM_BATTLE, NO_DEV_FROM_BATTLE, NO_ASSETS_JSON],
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: [
      'src/main.ts',
      'src/scene/*Scene.ts',
      'src/dev/**/*.ts',
      'src/util/fx.ts',
      'src/arcade/**/*.ts',
      'src/ecs/EcsBattleScene.ts',
      'src/ecs/views.ts',
      'src/ecs/render/**/*.ts',
      'src/battle.ts',
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
  {
    files: ['src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // group 不支持 '!' 取反，只能正向枚举；新增顶层包须同步此表
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
  {
    files: ['defs/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // 同上：正向枚举，新增顶层包须同步此表
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
  {
    files: ['src/types/**/*.ts'],
    rules: {
      // 有意不含 NO_ASSETS_JSON：types 也读 assets/*.json
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
