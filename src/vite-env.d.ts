/// <reference types="vite/client" />

declare const __BUILD_HASH__: string
declare const __BUILD_TIME__: string
declare const __TWEMOJI_VERSION__: string

// e2e 读取的运行时状态（src/ui/debug.ts 写入）
interface WarmojiSelectDebug {
  selected: number
  size: number
  focusedId: string
  // 逻辑坐标：矩形为左上角+宽高，toggle/start 的 x/y 为按钮中心
  items: { id: string; x: number; y: number; w: number; h: number; inLineup: boolean }[]
  list: { x: number; y: number; w: number; h: number; scrollY: number; contentH: number }
  detail: { x: number; y: number; w: number; h: number }
  toggle: { x: number; y: number; w: number; h: number; mode: 'add' | 'remove' | 'full' }
  start: { x: number; y: number; w: number; h: number; enabled: boolean }
}

interface WarmojiShopDebug {
  wave: number
  coins: number
  focusedId: string
  freeRefreshes: number
  level: number
  points: number
  slots: {
    id: string
    x: number
    y: number
    w: number
    h: number
    offer: string | null
    price: number | null
    owned: number
    memberLevel: number | null
  }[]
  buy: { x: number; y: number; w: number; h: number; enabled: boolean }
  refresh: { x: number; y: number; w: number; h: number; enabled: boolean }
  upgrade: { x: number; y: number; w: number; h: number; enabled: boolean }
  recruit: {
    candidates: { id: string; x: number; y: number; w: number; h: number }[]
    selected: string | null
  }
  start: { x: number; y: number; w: number; h: number }
}

interface WarmojiMenuDebug {
  start: { x: number; y: number; w: number; h: number }
  settings: { x: number; y: number; w: number; h: number }
  wiki: { x: number; y: number; w: number; h: number }
}

interface WarmojiWikiDebug {
  category: string
  focused: string
  allSelected: string | null
  entryCount: number
  manifestCount: number
  usedCount: number
  atlas: 'idle' | 'loading' | 'ready'
  scrollY: number
  maxScroll: number
  items: { key: string; x: number; y: number; w: number; h: number }[]
  list: { x: number; y: number; w: number; h: number }
  categories: { title: string; x: number; y: number; w: number; h: number }[]
  back: { x: number; y: number; w: number; h: number }
}

interface WarmojiSettingsDebug {
  items: { id: string; x: number; y: number; w: number; h: number; on: boolean }[]
  back: { x: number; y: number; w: number; h: number }
}

interface WarmojiCaptainDebug {
  selected: string
  items: { id: string; x: number; y: number; w: number; h: number }[]
  start: { x: number; y: number; w: number; h: number }
}

interface WarmojiDebug {
  scene: 'menu' | 'wiki' | 'settings' | 'captain' | 'select' | 'shop' | 'arena' | 'gameover'
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
  wave?: number
  coins?: number
  menu?: WarmojiMenuDebug
  wiki?: WarmojiWikiDebug
  settings?: WarmojiSettingsDebug
  captain?: WarmojiCaptainDebug
  select?: WarmojiSelectDebug
  shop?: WarmojiShopDebug
}

interface Window {
  __warmoji?: WarmojiDebug
  __game?: unknown
  __twemojiVersion?: string
  __setStress?: (on: boolean) => void
  __addCoins?: (n: number) => void
  __addXp?: (n: number) => void
  __sfxStats?: () => { baked: number; played: number }
}
