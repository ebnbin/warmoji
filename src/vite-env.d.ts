/// <reference types="vite/client" />

declare const __BUILD_HASH__: string
declare const __BUILD_TIME__: string
declare const __TWEMOJI_VERSION__: string

// e2e 读取的运行时状态（src/ui/debug.ts 写入）
interface WarmojiDebug {
  scene: 'menu' | 'arena' | 'gameover'
  elapsed: number
  hp: number
  kills: number
  level: number
  enemies: number
  viewW: number
  viewH: number
  playerX: number
  playerY: number
  camX: number
  camY: number
}

interface Window {
  __warmoji?: WarmojiDebug
  __game?: unknown
  __twemojiVersion?: string
}
