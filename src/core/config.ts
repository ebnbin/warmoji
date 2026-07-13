// 保底可视区：横屏 1280×720，竖屏 720×1280；多余空间向两侧扩展为真实战场
export const VIEW = { minLong: 1280, minShort: 720 } as const

export const PLAYER = {
  emoji: '😎',
  size: 40,
  radius: 20,
  speed: 220,
  maxHp: 100,
  iframesMs: 400,
} as const

export const KNIFE = {
  emoji: '🔪',
  size: 26,
  radius: 12,
  damage: 34,
  speed: 520,
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
  size: 40,
  radius: 20,
  hp: 60,
  speed: 55,
  damage: 12,
  xp: 3,
}

export const GHOST: EnemySpec = {
  kind: 'ghost',
  emoji: '👻',
  size: 36,
  radius: 18,
  hp: 25,
  speed: 115,
  damage: 7,
  xp: 2,
}

export const GEM = {
  emoji: '💎',
  size: 20,
  radius: 10,
  magnetRadius: 90,
  magnetSpeed: 320,
} as const

export const SPAWN = {
  startIntervalMs: 1100,
  minIntervalMs: 350,
  rampSeconds: 150,
  hpGrowthPerMin: 0.5,
  ghostShareStart: 0.15,
  ghostShareMax: 0.55,
  ghostShareRampSeconds: 240,
  edgeMargin: 30,
  maxAlive: 120,
} as const

export const XP = { base: 8, perLevel: 6 } as const

export const HEAL_AMOUNT = 30
