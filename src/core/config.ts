// 保底可视区：横屏 1280×720，竖屏 720×1280；多余空间向两侧扩展显示更多地图
export const VIEW = { minLong: 1280, minShort: 720 } as const

// 1 单位 = 标准实体（player）的尺寸；锚定：最小视口长边容纳 20 个单位
export const UNIT = VIEW.minLong / 20

export const MAP = {
  width: 25 * UNIT,
  height: 25 * UNIT,
  // 相机滚动范围 = 地图四周外扩这一圈
  cameraMargin: 2 * UNIT,
} as const

export const PLAYER = {
  emoji: '😎',
  deadEmoji: '😵',
  size: 1 * UNIT,
  radius: 0.5 * UNIT,
  speed: 5.5 * UNIT,
  maxHp: 100,
  iframesMs: 400,
} as const

export const KNIFE = {
  emoji: '🔪',
  size: 0.65 * UNIT,
  radius: 0.3 * UNIT,
  damage: 34,
  speed: 13 * UNIT,
  cooldownMs: 900,
  volleySpreadRad: 0.2,
  maxCount: 6,
} as const

export interface EnemySpec {
  readonly kind: 'zombie' | 'ghost'
  readonly emoji: string
  readonly size: number
  readonly radius: number
  readonly hp: number
  readonly speed: number
  readonly damage: number
  readonly xp: number
}

export const ZOMBIE: EnemySpec = {
  kind: 'zombie',
  emoji: '🧟',
  size: 1 * UNIT,
  radius: 0.5 * UNIT,
  hp: 60,
  speed: 1.375 * UNIT,
  damage: 12,
  xp: 3,
}

export const GHOST: EnemySpec = {
  kind: 'ghost',
  emoji: '👻',
  size: 0.9 * UNIT,
  radius: 0.45 * UNIT,
  hp: 25,
  speed: 2.875 * UNIT,
  damage: 7,
  xp: 2,
}

export const GEM = {
  emoji: '💎',
  size: 0.5 * UNIT,
  radius: 0.25 * UNIT,
  magnetRadius: 2.25 * UNIT,
  magnetSpeed: 8 * UNIT,
} as const

export const SPAWN = {
  startIntervalMs: 1100,
  minIntervalMs: 350,
  rampSeconds: 150,
  hpGrowthPerMin: 0.5,
  ghostShareStart: 0.15,
  ghostShareMax: 0.55,
  ghostShareRampSeconds: 240,
  // 刷怪点在相机可见区边缘外的距离
  outset: 0.75 * UNIT,
  maxAlive: 120,
} as const

export const XP = { base: 8, perLevel: 6 } as const

export const HEAL_AMOUNT = 30

// 剪影描边（radius 单位 = twemoji viewBox 单位，36 格）
export const OUTLINE = { radius: 2, color: '#000000' } as const

export const OUTLINED_EMOJIS: readonly string[] = [
  PLAYER.emoji,
  PLAYER.deadEmoji,
  KNIFE.emoji,
  ZOMBIE.emoji,
  GHOST.emoji,
  GEM.emoji,
  '💀',
]
