import { execSync } from 'node:child_process'
import { defineConfig } from 'vitest/config'

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
  build: {
    // SVG 须以文件产出：Phaser 经 XHR 加载，内联 data URI 不可靠
    assetsInlineLimit: 0,
  },
  define: {
    __BUILD_HASH__: JSON.stringify(commitHash()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
