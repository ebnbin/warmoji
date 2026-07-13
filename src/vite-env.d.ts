/// <reference types="vite/client" />

declare const __BUILD_HASH__: string
declare const __BUILD_TIME__: string

// 供 e2e 测试读取的运行时状态（由 src/ui/debug.ts 写入）
interface WarmojiDebug {
  scene: 'menu' | 'arena' | 'gameover'
  elapsed: number
  hp: number
  kills: number
  level: number
  enemies: number
}

interface Window {
  __warmoji?: WarmojiDebug
  __game?: unknown
}
