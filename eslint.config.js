import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/', 'public/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // 纯度护栏：纯逻辑文件禁 import phaser（type import 放行——编译期擦除，无运行时依赖）。
  // 表现层文件显式白名单；新增 Phaser 文件必须在此登记——这道摩擦是有意的。
  // 边界的完整定义是「能在 node 的 vitest 里 import」，DOM/WebAudio 越界靠约定与单测把守。
  {
    files: ['src/**/*.ts'],
    ignores: [
      'src/main.ts',
      'src/boot/PreloadScene.ts',
      'src/battle/BaseArenaScene.ts',
      'src/battle/UIScene.ts',
      'src/battle/Joystick.ts',
      'src/battle/damageFont.ts',
      'src/battle/fx.ts',
      'src/maps/*Scene.ts',
      'src/menu/*Scene.ts',
      'src/menu/grid.ts',
      'src/emoji/textures.ts',
      'src/emoji/thumbs.ts',
      'src/emoji/virtualGrid.ts',
      'src/screen/apply.ts',
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
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      // 含 Playwright 探针：page.evaluate 回调在浏览器执行，需要浏览器全局
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        window: 'readonly',
        localStorage: 'readonly',
      },
    },
  },
)
