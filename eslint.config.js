import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/', 'public/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // 纯度护栏：纯逻辑文件禁 import phaser（type import 放行——编译期擦除，无运行时依赖）。
  // 表现层文件显式白名单；新增 Phaser 文件必须在此登记——这道摩擦是有意的。
  // 边界的完整定义是「能在 node 的 vitest 里 import」，DOM/WebAudio 越界靠约定与单测把守。
  // 实验隔离护栏：ECS 实验只能经 src/experiments/ecsExperiment.ts 这一个 facade 接入主干。
  // 用基础规则（非 @typescript-eslint 版）以免覆盖上面那条 phaser 规则；type import 一并禁——
  // 类型耦合虽然编译期擦除，但删实验时照样让主干编译不过，对「一步拆干净」是同等障碍。
  {
    files: ['src/**/*.ts', 'e2e/**/*.ts'],
    ignores: ['src/ecs/**/*.ts', 'src/experiments/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/ecs', '**/ecs/*', '**/ecs/**', './ecs/*', '../ecs/*', 'bitecs'],
              message:
                'ECS 是实验代码：一律经 src/experiments/ecsExperiment.ts 调用，不要直接 import src/ecs/ 或 bitecs（这样实验的耦合面才数得清、下线时能一步拆干净）',
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
      'src/battle/BaseArenaScene.ts',
      'src/battle/UIScene.ts',
      'src/core/Joystick.ts',
      'src/core/damageFont.ts',
      'src/core/fx.ts',
      'src/maps/*Scene.ts',
      'src/menu/*Scene.ts',
      // ECS 实验：宿主场景 + 自绘渲染层触碰 Phaser/WebGL（表现层）；ECS 逻辑文件仍禁 phaser
      'src/ecs/EcsBattleScene.ts',
      'src/ecs/render/**/*.ts',
      'src/experiments/*.ts',
      'src/menu/grid.ts',
      'src/menu/scroll.ts',
      'src/emoji/textures.ts',
      'src/emoji/thumbs.ts',
      'src/emoji/virtualGrid.ts',
      'src/core/apply.ts',
      'src/debug/diagnostics.ts',
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
