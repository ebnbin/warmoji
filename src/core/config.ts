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

import type { ProjectileSpec, ThrustSpec } from './weapons'

// 武器库：突刺型=群体伤害（每次突刺范围内每敌一次），发射型=子弹单体
export const WEAPONS = {
  thrustKnife: {
    kind: 'thrust',
    emoji: '🔪',
    size: 0.6 * UNIT,
    restOffset: 0.55 * UNIT,
    damage: 30,
    cooldownMs: 1100,
    reach: 1.6 * UNIT,
    hitRadius: 0.55 * UNIT,
    thrustMs: 200,
    // twemoji 1f52a 原始刀刃朝向 +45°（右下）
    rotationOffsetRad: -Math.PI / 4,
  } satisfies ThrustSpec,
  pistol: {
    kind: 'projectile',
    emoji: '🔫',
    size: 0.55 * UNIT,
    restOffset: 0.5 * UNIT,
    damage: 24,
    cooldownMs: 500,
    // twemoji 1f52b 枪口朝左
    rotationOffsetRad: Math.PI,
    flipWhenLeft: false,
    projectile: {
      emoji: '💧',
      size: 0.35 * UNIT,
      radius: 0.15 * UNIT,
      speed: 13 * UNIT,
      // twemoji 1f4a7 水滴尖端朝上
      rotationOffsetRad: Math.PI / 2,
    },
  } satisfies ProjectileSpec,
} as const

// 队伍 = 1 队长（无实体，提供全队被动，能力后续设计）+ 5 角色（真正参战）。
// 玩家操控队伍中心点，角色环状固定槽位随行；除此之外角色是完全独立的单位。
// 角色与武器松耦合：0..n 把（🤠 双持验证多武器通路）。
export const TEAM = {
  size: 5,
  // 紧凑阵型：相邻间距略小于角色体宽，允许少量重叠
  ringRadius: 0.7 * UNIT,
  moveSpeed: 5.5 * UNIT,
  reviveMs: 10_000,
  captainEmoji: '👑',
  members: [
    { emoji: '😎', weapons: [WEAPONS.pistol] },
    { emoji: '🥷', weapons: [WEAPONS.thrustKnife] },
    { emoji: '🧙', weapons: [WEAPONS.pistol] },
    { emoji: '🤠', weapons: [WEAPONS.thrustKnife, WEAPONS.pistol] },
    { emoji: '👽', weapons: [WEAPONS.thrustKnife] },
  ],
} as const

export const MEMBER = {
  size: 0.9 * UNIT,
  radius: 0.45 * UNIT,
  maxHp: 100,
  iframesMs: 400,
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

// 刷怪节奏按 5 人火力校准（约为单人时代的 5 倍）
export const SPAWN = {
  startIntervalMs: 220,
  minIntervalMs: 70,
  rampSeconds: 150,
  hpGrowthPerMin: 0.5,
  ghostShareStart: 0.15,
  ghostShareMax: 0.55,
  ghostShareRampSeconds: 240,
  maxAlive: 400,
  // 地图内随机刷怪：先显示预告标记再落地
  telegraphMs: 900,
  markEmoji: '⚠️',
  markSize: 0.75 * UNIT,
  minPlayerDist: 3 * UNIT,
  edgeInset: 0.5 * UNIT,
} as const

// 压力测试模式（🔧 面板开关）：拉高负载且保证测得下去
export const STRESS = {
  maxHp: 10_000_000,
  spawnIntervalMs: 80,
  spawnBatch: 5,
  maxAlive: 800,
  // 所有武器冷却乘数（0.1 = 十倍攻速）
  cooldownMul: 0.1,
} as const

export const XP = { base: 8, perLevel: 6 } as const

export const HEAL_AMOUNT = 30

// 剪影描边（radius 单位 = twemoji viewBox 单位，36 格）
export const OUTLINE = { radius: 2, color: '#000000' } as const

export const OUTLINED_EMOJIS: readonly string[] = [
  ...TEAM.members.map((m) => m.emoji),
  WEAPONS.thrustKnife.emoji,
  WEAPONS.pistol.emoji,
  WEAPONS.pistol.projectile.emoji,
  ZOMBIE.emoji,
  GHOST.emoji,
  GEM.emoji,
  '💀',
]

// 启动时预载的 emoji（含 UI 图标）；其余全集按需加载（ui/emoji.ts ensureEmoji）
export const PRELOAD_EMOJIS: readonly string[] = [
  ...OUTLINED_EMOJIS,
  SPAWN.markEmoji,
  '⚔️',
  '🏆',
  '⚡',
  '👟',
  '❤️',
  '🔧',
]
