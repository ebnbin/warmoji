/// <reference types="vite/client" />

declare const __BUILD_HASH__: string
declare const __BUILD_TIME__: string
declare const __TWEMOJI_VERSION__: string

// e2e 读取的运行时状态（src/ui/debug.ts 写入）
interface WarmojiMenuDebug {
  selected: number
  size: number
  // 逻辑坐标：卡片为左上角+宽高，start 为按钮中心
  cards: { id: string; x: number; y: number; w: number; h: number; selected: boolean }[]
  start: { x: number; y: number; w: number; h: number; enabled: boolean }
}

interface WarmojiDebug {
  scene: 'menu' | 'arena' | 'gameover'
  elapsed: number
  hp: number
  alive: number
  kills: number
  level: number
  enemies: number
  pending: number
  fps: number
  viewW: number
  viewH: number
  playerX: number
  playerY: number
  camX: number
  camY: number
  menu?: WarmojiMenuDebug
}

interface Window {
  __warmoji?: WarmojiDebug
  __game?: unknown
  __twemojiVersion?: string
  __setStress?: (on: boolean) => void
}
