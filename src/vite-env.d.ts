/// <reference types="vite/client" />

declare const __BUILD_HASH__: string
declare const __BUILD_TIME__: string
declare const __TWEMOJI_VERSION__: string

// e2e 读取的运行时状态（src/ui/debug.ts 写入）
interface WarmojiPromoteDebug {
  mode: 'recruit' | 'upgrade' | 'formation'
  points: number
  selected: string
  /** 招募/升级模式 = 网格候选；队形模式 = 预览中的队员站位 */
  items: { id: string; x: number; y: number; w: number; h: number }[]
  confirm: { x: number; y: number; w: number; h: number; enabled: boolean }
  /** wave=1 为「返回队长页」，wave>1 为「结束本局」 */
  back: { x: number; y: number; w: number; h: number }
  /** 队形环节（mode='formation' 时提供） */
  formation?: {
    id: string
    locked: boolean
    order: string[]
    cards: { id: string; x: number; y: number; w: number; h: number }[]
  }
}

interface WarmojiShopDebug {
  wave: number
  coins: number
  focusedId: string
  freeRefreshes: number
  level: number
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
  scene: 'menu' | 'wiki' | 'settings' | 'captain' | 'promote' | 'shop' | 'arena' | 'gameover'
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
  /** arena：当前局队形 id */
  formation?: string
  menu?: WarmojiMenuDebug
  wiki?: WarmojiWikiDebug
  settings?: WarmojiSettingsDebug
  captain?: WarmojiCaptainDebug
  promote?: WarmojiPromoteDebug
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
