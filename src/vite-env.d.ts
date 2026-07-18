/// <reference types="vite/client" />

declare const __BUILD_HASH__: string
declare const __BUILD_TIME__: string
declare const __TWEMOJI_VERSION__: string

// e2e 读取的运行时状态（src/ui/debug.ts 写入）
interface WarmojiPromoteDebug {
  mode: 'recruit' | 'formation'
  /** 招募模式 = 详情面板正在展示的候选；阵型模式 = 当前受保护中心 */
  selected: string
  /** 招募模式 = 命定卡池网格（state 三态）；阵型模式 = 预览中的队员站位 */
  items: {
    id: string
    x: number
    y: number
    w: number
    h: number
    state?: 'open' | 'locked' | 'taken'
  }[]
  confirm: { x: number; y: number; w: number; h: number; enabled: boolean }
  /** wave=1 为「返回队长页」，wave>1 为「结束本局」，fromShop 为「返回商店」 */
  back: { x: number; y: number; w: number; h: number }
  /** 招募模式：本波名额数与已点进空位的候选 */
  due?: number
  picked?: string[]
  /** 阵型页（mode='formation' 时提供）：满员自动 N 保 1，只可选中心 */
  formation?: { center: string }
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
  }[]
  buy: { x: number; y: number; w: number; h: number; enabled: boolean }
  refresh: { x: number; y: number; w: number; h: number; enabled: boolean }
  start: { x: number; y: number; w: number; h: number }
  /** 阵型页入口（满员后出现） */
  formation: { x: number; y: number; w: number; h: number } | null
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
  /** 当前 tab 在素材网格中的选中 key */
  selected: string
  /** 模板页当前模板 id */
  template: string
  templates: { id: string; x: number; y: number; w: number; h: number }[]
  /** 配方页当前 clip id 与切换 chips 命中区（单 clip 实体无 chips） */
  clip: string
  clips: { id: string; x: number; y: number; w: number; h: number }[]
  /** 解剖页结构树工作台（仅解剖 tab 且树就绪时提供；rows 只含完整可见行，
   * 点行即切换该节点显/隐，容器行的箭头区收起/展开） */
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
  /** 播放控制按钮命中区（prev/toggle/next/speed） */
  controls: Record<string, { x: number; y: number; w: number; h: number }>
  paused: boolean
  speed: number
  preview: 'idle' | 'loading' | 'ready'
  /** 已按需渲染的素材缩略图数量（feed 流，与图鉴共用缓存） */
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
  /** 已按需渲染的缩略图数量（feed 流：滚到哪渲染到哪） */
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
}

interface WarmojiResultDebug {
  win: boolean
  rows: number
  newBest: boolean
  again: { x: number; y: number; w: number; h: number }
  menu: { x: number; y: number; w: number; h: number }
}

interface WarmojiDebug {
  scene: 'menu' | 'map' | 'wiki' | 'studio' | 'settings' | 'captain' | 'promote' | 'shop' | 'arena' | 'result'
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
  /** arena：当前局地图 id */
  mapId?: string
  /** 无限地图：休眠中的敌人数 */
  dormant?: number
  /** 无限地图终波：当前缩圈半径（未开圈为 undefined） */
  zoneRadius?: number
  /** arena：队长主动技能状态（压测模式无技能） */
  skill?: { remainMs: number; beans: number; ready: boolean }
  menu?: WarmojiMenuDebug
  map?: WarmojiMapDebug
  wiki?: WarmojiWikiDebug
  studio?: WarmojiStudioDebug
  settings?: WarmojiSettingsDebug
  captain?: WarmojiCaptainDebug
  promote?: WarmojiPromoteDebug
  shop?: WarmojiShopDebug
  result?: WarmojiResultDebug
}

interface Window {
  __warmoji?: WarmojiDebug
  __game?: unknown
  __twemojiVersion?: string
  __setStress?: (on: boolean) => void
  __addCoins?: (n: number) => void
  __addXp?: (n: number) => void
  __setWave?: (n: number) => void
  __sfxStats?: () => { baked: number; played: number }
  __bgmProbe?: (
    id: 'lobby' | 'forest' | 'desert' | 'river' | 'void',
    seconds?: number,
  ) => Promise<{ rms: number; peak: number; notes: number }>
  __bgmState?: () => {
    desired: string | null
    playing: string | null
    enabled: boolean
  }
}
