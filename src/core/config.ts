// 全部玩法数值集中在此文件，调参需求只改这里。

export const ARENA = { width: 960, height: 540 } as const

export const PLAYER = {
  emoji: '😎',
  fontSize: 40,
  radius: 20,
  speed: 220,
  maxHp: 100,
  iframesMs: 400,
} as const

export const KNIFE = {
  emoji: '🔪',
  fontSize: 26,
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
  readonly fontSize: number
  readonly radius: number
  readonly hp: number
  readonly speed: number
  readonly damage: number
  readonly xp: number
}

export const ZOMBIE: EnemySpec = {
  kind: 'zombie',
  emoji: '🧟',
  fontSize: 40,
  radius: 20,
  hp: 60,
  speed: 55,
  damage: 12,
  xp: 3,
}

export const GHOST: EnemySpec = {
  kind: 'ghost',
  emoji: '👻',
  fontSize: 36,
  radius: 18,
  hp: 25,
  speed: 115,
  damage: 7,
  xp: 2,
}

export const GEM = {
  emoji: '💎',
  fontSize: 20,
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
