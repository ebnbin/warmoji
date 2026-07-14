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

import { ITEMS } from './items'
import type {
  AreaBlastSpec,
  BoomerangSpec,
  LaserSpec,
  ProjectileSpec,
  SlowAuraSpec,
  SweepSpec,
  ThrustSpec,
  WeaponSpec,
} from './weapons'

// 武器库（可被不同角色复用；held 缺省 = 行为主体是角色本体）
const pistol = {
  kind: 'projectile',
  name: '左轮水枪',
  icon: '🔫',
  damage: 16,
  cooldownMs: 600,
  held: {
    emoji: '🔫',
    size: 0.55 * UNIT,
    restOffset: 0.45 * UNIT,
    // twemoji 1f52b 枪口朝左
    rotationOffsetRad: Math.PI,
    mountGap: 0.32 * UNIT,
  },
  projectile: {
    emoji: '💧',
    size: 0.35 * UNIT,
    radius: 0.15 * UNIT,
    speed: 13 * UNIT,
    // twemoji 1f4a7 水滴尖端朝上
    rotationOffsetRad: Math.PI / 2,
  },
} satisfies ProjectileSpec

export const WEAPONS = {
  tomatoThrow: {
    kind: 'projectile',
    name: '番茄连投',
    icon: '🍅',
    damage: 22,
    cooldownMs: 450,
    projectile: {
      emoji: '🍅',
      size: 0.4 * UNIT,
      radius: 0.18 * UNIT,
      speed: 12 * UNIT,
      rotationOffsetRad: 0,
    },
  } satisfies ProjectileSpec,
  hornThrust: {
    kind: 'thrust',
    name: '独角突刺',
    icon: '⚔️',
    damage: 26,
    cooldownMs: 900,
    reach: 1.4 * UNIT,
    hitRadius: 0.5 * UNIT,
    thrustMs: 220,
    lungeDist: 0.7 * UNIT,
  } satisfies ThrustSpec,
  axeSweep: {
    kind: 'sweep',
    name: '巨斧横扫',
    icon: '🪓',
    damage: 30,
    cooldownMs: 1200,
    radius: 1.5 * UNIT,
    arcRad: (150 * Math.PI) / 180,
    sweepMs: 260,
    held: {
      emoji: '🪓',
      size: 0.65 * UNIT,
      restOffset: 0.6 * UNIT,
      // twemoji 1fa93 斧刃朝左上
      rotationOffsetRad: (3 * Math.PI) / 4,
    },
  } satisfies SweepSpec,
  pistolLeft: {
    ...pistol,
    name: '左轮水枪·左',
    held: { ...pistol.held, mountSide: -1 },
  } satisfies ProjectileSpec,
  pistolRight: {
    ...pistol,
    name: '左轮水枪·右',
    held: { ...pistol.held, mountSide: 1 },
  } satisfies ProjectileSpec,
  arcaneBlast: {
    kind: 'areaBlast',
    name: '奥术轰炸',
    icon: '💥',
    damage: 22,
    cooldownMs: 1300,
    detectRange: 6 * UNIT,
    blastRadius: 1.3 * UNIT,
    color: 0x9575cd,
  } satisfies AreaBlastSpec,
  laserBeam: {
    kind: 'laser',
    name: '贯穿激光',
    icon: '🔦',
    damage: 14,
    cooldownMs: 900,
    range: 8 * UNIT,
    beamRadius: 0.22 * UNIT,
    color: 0xff5252,
    held: {
      emoji: '🔦',
      size: 0.55 * UNIT,
      restOffset: 0.45 * UNIT,
      // twemoji 1f526 灯头朝左下
      rotationOffsetRad: (3 * Math.PI) / 4,
    },
  } satisfies LaserSpec,
  frostAura: {
    kind: 'slowAura',
    name: '寒气光环',
    icon: '❄️',
    radius: 3 * UNIT,
    slowFactor: 0.5,
    color: 0x81d4fa,
  } satisfies SlowAuraSpec,
  boomerang: {
    kind: 'boomerang',
    name: '回旋镖',
    icon: '🪃',
    damage: 18,
    cooldownMs: 1200,
    range: 4 * UNIT,
    outMs: 500,
    returnSpeed: 10 * UNIT,
    hitRadius: 0.5 * UNIT,
    spinRadPerSec: 14,
    held: {
      emoji: '🪃',
      size: 0.55 * UNIT,
      restOffset: 0.5 * UNIT,
      rotationOffsetRad: 0,
    },
  } satisfies BoomerangSpec,
} as const

// 角色花名册：角色 → 武器为单向绑定（角色配装固定；武器可被复用）
export interface CharacterSpec {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly weapons: readonly WeaponSpec[]
}

export const CHARACTERS = {
  juggler: {
    emoji: '🤹',
    name: '杂耍演员',
    desc: '向最近的敌人连续抛掷番茄',
    weapons: [WEAPONS.tomatoThrow],
  },
  unicorn: {
    emoji: '🦄',
    name: '独角兽',
    desc: '独角向前突刺，穿透沿途敌人',
    weapons: [WEAPONS.hornThrust],
  },
  troll: {
    emoji: '🧌',
    name: '巨魔',
    desc: '挥舞巨斧，横扫身前扇形范围',
    weapons: [WEAPONS.axeSweep],
  },
  cowboy: {
    emoji: '🤠',
    name: '牛仔',
    desc: '左右双枪齐发，射出高速水弹',
    weapons: [WEAPONS.pistolLeft, WEAPONS.pistolRight],
  },
  mage: {
    emoji: '🧙',
    name: '法师',
    desc: '在远处敌人脚下引爆奥术轰炸',
    weapons: [WEAPONS.arcaneBlast],
  },
  kangaroo: {
    emoji: '🦘',
    name: '袋鼠',
    desc: '掷出回旋镖，去程回程皆可伤敌',
    weapons: [WEAPONS.boomerang],
  },
  robot: {
    emoji: '🤖',
    name: '机器人',
    desc: '手持激光器，灼穿一条直线上的所有敌人',
    weapons: [WEAPONS.laserBeam],
  },
  snowman: {
    emoji: '⛄',
    name: '雪人',
    desc: '以队伍中心散发寒气，持续减速范围内的敌人',
    weapons: [WEAPONS.frostAura],
  },
} as const satisfies Record<string, CharacterSpec>

export type CharacterId = keyof typeof CHARACTERS
export const ROSTER_IDS = Object.keys(CHARACTERS) as readonly CharacterId[]

// 队长：不登场、无实体的团队增益提供者（emotion 表情形象）。
// 能力先直接建模为字段，需要通用效果系统时再抽象；出战人数由队长决定。
export interface CaptainSpec {
  readonly emoji: string
  readonly name: string
  readonly desc: string
  readonly teamSize: number
  /** 每次进商店全员复活并恢复满血（默认规则：存活者血量保留、阵亡者 30% 血复活） */
  readonly reviveInShop: boolean
  /** 每次进商店的免费道具刷新次数 */
  readonly freeRefreshes: number
}

export const CAPTAINS = {
  angel: {
    emoji: '😇',
    name: '天使',
    desc: '每次进入商店，全体队员复活并恢复满血',
    teamSize: 5,
    reviveInShop: true,
    freeRefreshes: 0,
  },
  moneybags: {
    emoji: '🤑',
    name: '财迷',
    desc: '每次进入商店，前 3 次道具刷新免费',
    teamSize: 5,
    reviveInShop: false,
    freeRefreshes: 3,
  },
  party: {
    emoji: '🥳',
    name: '派对之星',
    desc: '气氛组拉满，可以招募 6 名队员出战',
    teamSize: 6,
    reviveInShop: false,
    freeRefreshes: 0,
  },
} as const satisfies Record<string, CaptainSpec>

export type CaptainId = keyof typeof CAPTAINS
export const CAPTAIN_IDS = Object.keys(CAPTAINS) as readonly CaptainId[]

// 队伍：玩家操控队伍中心点，角色环状固定槽位随行；除此之外角色是完全独立的单位。
// 队长与出战阵容由队长页/组队页选择并持久化（core/selection.ts）。
export const TEAM = {
  ringRadius: 0.8 * UNIT,
  moveSpeed: 5.5 * UNIT,
  reviveMs: 10_000,
} as const

export const MEMBER = {
  size: 0.9 * UNIT,
  radius: 0.45 * UNIT,
  maxHp: 100,
  // 波次制要求整波存活，受击间隔放宽让「蹭到怪」是磨损而非速死
  iframesMs: 700,
} as const

// 波次制：一波战斗固定时长 → 商店 → 下一波；上一波阵亡者下波以低血量复活
export const WAVE = {
  durationMs: 30_000,
  reviveHpRatio: 0.3,
} as const

export interface EnemySpec {
  readonly kind: 'zombie' | 'ghost'
  readonly emoji: string
  readonly size: number
  readonly radius: number
  readonly hp: number
  readonly speed: number
  readonly damage: number
  // 经验击杀即得；金币落地需拾取（波次结束未拾取的消失）
  readonly xp: number
  readonly coins: number
}

export const ZOMBIE: EnemySpec = {
  kind: 'zombie',
  emoji: '🧟',
  size: 1 * UNIT,
  radius: 0.5 * UNIT,
  hp: 60,
  speed: 1.375 * UNIT,
  damage: 8,
  xp: 3,
  coins: 1,
}

export const GHOST: EnemySpec = {
  kind: 'ghost',
  emoji: '👻',
  size: 0.9 * UNIT,
  radius: 0.45 * UNIT,
  hp: 25,
  speed: 2.875 * UNIT,
  damage: 5,
  xp: 2,
  coins: 1,
}

// 金币拾取是团队能力：磁吸与入账都以队伍中心为基点（拾取范围类道具挂队长）
export const COIN = {
  emoji: '🪙',
  size: 0.45 * UNIT,
  radius: 0.22 * UNIT,
  magnetRadius: 2.25 * UNIT,
  magnetSpeed: 8 * UNIT,
  collectRadius: 0.5 * UNIT,
} as const

// 刷怪节奏（波次制）：第 1 波基础火力可稳过，随跨波累计战斗时长持续加压，
// 后期压力超出基础火力，由商店成长补差
export const SPAWN = {
  startIntervalMs: 450,
  minIntervalMs: 80,
  rampSeconds: 300,
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

// 商店：每个上架位可付费重新随机（队长可提供免费次数）
export const SHOP = { refreshPrice: 2 } as const

// 角色受击时的相机震动
export const HIT_SHAKE = { durationMs: 60, intensity: 0.0012 } as const

// 剪影描边（radius 单位 = twemoji viewBox 单位，36 格）
export const OUTLINE = { radius: 2, color: '#000000' } as const

const roster: readonly CharacterSpec[] = Object.values(CHARACTERS)

export const OUTLINED_EMOJIS: readonly string[] = [
  ...roster.map((c) => c.emoji),
  ...Object.values<CaptainSpec>(CAPTAINS).map((c) => c.emoji),
  ...roster.flatMap((c) =>
    c.weapons.flatMap((w) => [
      ...('held' in w && w.held ? [w.held.emoji] : []),
      ...(w.kind === 'projectile' ? [w.projectile.emoji] : []),
    ]),
  ),
  ZOMBIE.emoji,
  GHOST.emoji,
  COIN.emoji,
  '💀',
]

// 启动时预载的 emoji（含 UI 图标）；其余全集按需加载（ui/emoji.ts ensureEmoji）
export const PRELOAD_EMOJIS: readonly string[] = [
  ...OUTLINED_EMOJIS,
  // 属性面板的武器/基础组图标 + 商店道具图标
  ...roster.flatMap((c) => c.weapons.map((w) => w.icon)),
  ...Object.values<{ emoji: string }>(ITEMS).map((i) => i.emoji),
  SPAWN.markEmoji,
  '⚔️',
  '🏆',
  '⚡',
  '👟',
  '❤️',
  '🔧',
  '✅',
  '⏸️',
  '👑',
]
