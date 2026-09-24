/// <reference types="vite/client" />

declare const __BUILD_HASH__: string
declare const __BUILD_TIME__: string

// e2e 读取的运行时状态
interface WarmojiRecruitDebug {
  /** 详情面板正在展示的候选 */
  selected: string
  /** 卡池网格 */
  items: {
    id: string
    x: number
    y: number
    w: number
    h: number
    state: 'open' | 'locked' | 'taken'
  }[]
  confirm: { x: number; y: number; w: number; h: number; enabled: boolean }
  back: { x: number; y: number; w: number; h: number }
  /** 名额数与已选候选 */
  due: number
  picked: string[]
}

interface WarmojiFormationDebug {
  /** 当前受保护中心 */
  center: string
  /** 队员站位 */
  items: { id: string; x: number; y: number; w: number; h: number }[]
  confirm: { x: number; y: number; w: number; h: number }
  back: { x: number; y: number; w: number; h: number }
}

interface WarmojiShopDebug {
  wave: number
  coins: number
  focusedId: string
  freeRefreshes: number
  level: number
  /** 专属等级 1..3 与累计经验 */
  focusedLevel: number
  focusedXp: number
  slots: {
    id: string
    x: number
    y: number
    w: number
    h: number
    offer: string | null
    price: number | null
    owned: number
    /** 专属等级 1..3 */
    level: number
  }[]
  buy: { x: number; y: number; w: number; h: number; enabled: boolean }
  refresh: { x: number; y: number; w: number; h: number; enabled: boolean }
  start: { x: number; y: number; w: number; h: number }
  /** 满员后才有，否则 null */
  formation: { x: number; y: number; w: number; h: number } | null
}

interface WarmojiCardsDebug {
  /** 待抽次数（含当前这次） */
  remaining: number
  /** cardId → 等级 */
  owned: Record<string, number>
  choices: {
    id: string
    level: number
    maxLevel: number
    rarity: 'common' | 'rare' | 'epic'
    x: number
    y: number
    w: number
    h: number
  }[]
}

interface WarmojiMenuDebug {
  start: { x: number; y: number; w: number; h: number }
  settings: { x: number; y: number; w: number; h: number }
  wiki: { x: number; y: number; w: number; h: number }
  studio: { x: number; y: number; w: number; h: number }
}

interface WarmojiStudioDebug {
  tab: 'recipes' | 'templates' | 'anatomy'
  tabs: { id: string; x: number; y: number; w: number; h: number }[]
  items: { key: string; x: number; y: number; w: number; h: number }[]
  selected: string
  template: string
  templates: { id: string; x: number; y: number; w: number; h: number }[]
  /** 单 clip 时 clips 为空 */
  clip: string
  clips: { id: string; x: number; y: number; w: number; h: number }[]
  /** 仅解剖 tab 且树就绪时提供；rows 只含完整可见行 */
  anatomy?: {
    hidden: string[]
    rows: {
      path: string
      tag: string
      depth: number
      container: boolean
      paints: boolean
      expanded: boolean | null
      hidden: boolean
      x: number
      y: number
      w: number
      h: number
    }[]
    reset: { x: number; y: number; w: number; h: number }
    full: { x: number; y: number; w: number; h: number }
    split: { x: number; y: number; w: number; h: number }
  }
  /** 键：prev / toggle / next / speed */
  controls: Record<string, { x: number; y: number; w: number; h: number }>
  paused: boolean
  speed: number
  preview: 'idle' | 'loading' | 'ready'
  thumbsReady: number
  back: { x: number; y: number; w: number; h: number }
}

interface WarmojiWikiDebug {
  category: string
  focused: string
  allSelected: string | null
  entryCount: number
  manifestCount: number
  usedCount: number
  thumbsReady: number
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

interface WarmojiMapDebug {
  selected: string
  items: { id: string; x: number; y: number; w: number; h: number }[]
  start: { x: number; y: number; w: number; h: number }
  sandbox: { x: number; y: number; on: boolean }
}

interface WarmojiResultDebug {
  win: boolean
  rows: number
  newBest: boolean
  again: { x: number; y: number; w: number; h: number }
  menu: { x: number; y: number; w: number; h: number }
}

interface WarmojiDebug {
  scene: 'menu' | 'map' | 'wiki' | 'studio' | 'settings' | 'captain' | 'recruit' | 'formation' | 'cards' | 'shop' | 'result'
  elapsed: number
  kills: number
  level: number
  viewW: number
  viewH: number
  wave?: number
  coins?: number
  menu?: WarmojiMenuDebug
  map?: WarmojiMapDebug
  wiki?: WarmojiWikiDebug
  studio?: WarmojiStudioDebug
  settings?: WarmojiSettingsDebug
  captain?: WarmojiCaptainDebug
  recruit?: WarmojiRecruitDebug
  formation?: WarmojiFormationDebug
  cards?: WarmojiCardsDebug
  shop?: WarmojiShopDebug
  result?: WarmojiResultDebug
}

interface Window {
  __warmoji?: WarmojiDebug
  __sandbox?: import('./ecs/sandbox/probe').SandboxPerfProbe
}
