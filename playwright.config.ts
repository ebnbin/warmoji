import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// 容器预装固定版 Chromium 且禁止下载浏览器；CI 走 playwright install 的默认浏览器
const containerChromium = '/opt/pw-browsers/chromium'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    launchOptions: existsSync(containerChromium) ? { executablePath: containerChromium } : {},
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
