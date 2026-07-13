import { execSync } from 'node:child_process'
import { defineConfig } from 'vitest/config'

// 构建版本号：Vercel/CI 环境取平台注入的 commit SHA，本地取 git HEAD，兜底 'dev'。
function commitHash(): string {
  const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA
  if (fromEnv) return fromEnv.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  define: {
    __BUILD_HASH__: JSON.stringify(commitHash()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
