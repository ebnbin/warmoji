import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// 容器禁止下载浏览器，只能用预装的 Chromium
const containerChromium = '/opt/pw-browsers/chromium'

export default defineConfig({
  testDir: './e2e',
  // 软件渲染下游戏时间走得慢
  timeout: 90_000,
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
