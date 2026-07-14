import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/', 'public/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
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
