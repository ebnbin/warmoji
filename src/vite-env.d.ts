/// <reference types="vite/client" />

declare const __BUILD_HASH__: string
declare const __BUILD_TIME__: string

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
  /** 聚焦角色的专属等级（1/2/3）与累计经验 */
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
    /** 该角色专属等级（1/2/3） */
    level: number
  }[]
  buy: { x: number; y: number; w: number; h: number; enabled: boolean }
  refresh: { x: number; y: number; w: number; h: number; enabled: boolean }
  start: { x: number; y: number; w: number; h: number }
  /** 阵型页入口（满员后出现） */
  formation: { x: number; y: number; w: number; h: number } | null
}

interface WarmojiCardsDebug {
  /** 待抽次数（含当前这次） */
  remaining: number
  /** 已持团队卡（cardId → 等级），供验证选卡生效 */
  owned: Record<string, number>
  /** 当前三选一的候选卡：id + 现等级/上限 + 稀有度 + 命中矩形 */
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

interface WarmojiFieldDebug {
  /** 地面待拾的拾取（不磁吸，需走位拾取） */
  pickups: { id: string; polarity: 'buff' | 'debuff'; x: number; y: number }[]
  /** 已激活的限时效果（拾取后短时生效） */
  active: { id: string; polarity: 'buff' | 'debuff'; remainMs: number }[]
  /** 在场携带者数（带极性光环的敌人） */
  carriers: number
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
  test: { x: number; y: number; on: boolean }
}

interface WarmojiResultDebug {
  win: boolean
  rows: number
  newBest: boolean
  again: { x: number; y: number; w: number; h: number }
  menu: { x: number; y: number; w: number; h: number }
}

interface WarmojiDebug {
  scene: 'menu' | 'map' | 'wiki' | 'studio' | 'settings' | 'captain' | 'promote' | 'cards' | 'shop' | 'arena' | 'result'
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
  /** arena：队长主动技能状态（纯 CD 门槛） */
  skill?: { remainMs: number; ready: boolean }
  /** arena：战场拾取（地面待拾 + 已激活效果 + 携带者数） */
  field?: WarmojiFieldDebug
  menu?: WarmojiMenuDebug
  map?: WarmojiMapDebug
  wiki?: WarmojiWikiDebug
  studio?: WarmojiStudioDebug
  settings?: WarmojiSettingsDebug
  captain?: WarmojiCaptainDebug
  promote?: WarmojiPromoteDebug
  cards?: WarmojiCardsDebug
  shop?: WarmojiShopDebug
  result?: WarmojiResultDebug
}

interface Window {
  __warmoji?: WarmojiDebug
  __game?: unknown
  __setLab?: (kinds: string[], mapId?: string) => void
  __labTeam?: (ids: string[], mapId?: string) => void
  __ecsLabRoster?: (ids: string[]) => void
  __ecsSpawnEnemy?: (kind: string, dxU?: number, dyU?: number, elite?: boolean) => void
  __ecsNearestEnemySize?: () => number
  __ecsHurtEnemy?: (dmg?: number, kb?: number) => void
  __ecsSlowEnemy?: (factor?: number, durMs?: number) => void
  __ecsPoisonEnemy?: (dmg?: number, tickMs?: number, durMs?: number) => void
  __ecsNearestEnemyHp?: () => number
  __ecsNearestEnemyState?: () => number
  __ecsMorphEnemy?: (durMs?: number, vulnMul?: number) => void
  __ecsNearestEnemyMorphed?: () => boolean
  __ecsGroundZones?: () => number
  __ecsSpawnCoinsAt?: (dxU?: number, dyU?: number, count?: number) => void
  __ecsMaxEaten?: () => number
  __ecsSettleWave?: () => number
  __ecsStress?: (count?: number, kind?: string) => void
  __ecsBossDown?: () => boolean
  __ecsMemberAtkSlowed?: () => boolean
  __ecsDancing?: () => boolean
  __ecsDropField?: (id: string, dxU?: number, dyU?: number) => void
  __ecsTimeStop?: (durMs?: number) => void
  __ecsWorldTimeScale?: () => number
  __addCoins?: (n: number) => void
  __addXp?: (n: number) => void
  __addMemberItem?: (itemId: string, slot?: number, count?: number) => void
  __setWave?: (n: number) => void
  __spawnEnemy?: (kind: string, dxU?: number, dyU?: number) => void
  __spawnArmedEnemy?: (abilityId: string, dxU?: number, dyU?: number) => void
  __dropCoins?: (n: number, dxU?: number, dyU?: number) => void
  __spawnCarrier?: (polarity?: 'buff' | 'debuff', id?: string) => void
  __spawnFieldPickup?: (polarity?: 'buff' | 'debuff', id?: string, dxU?: number, dyU?: number) => void
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
