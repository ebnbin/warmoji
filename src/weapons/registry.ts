import { UNIT } from '../lib/units'
import type {
  AreaBlastSpec,
  AssassinateSpec,
  BoomerangSpec,
  ChainArcSpec,
  HealSpec,
  LaserSpec,
  ProjectileSpec,
  SlowAuraSpec,
  SummonSpec,
  SweepSpec,
  ThrustSpec,
  TurretSpec,
} from './spec'

// 击退：命中冲量按指数衰减（时间常数 tauMs），实际位移 ≈ 冲量 × tauMs/1000；
// 多次命中冲量叠加但合速度不超过 maxSpeed。
// 衰减的语义 = 敌人自身动力在抵抗；致死一击则失去动力：尸体以不衰减的
// 击退速度匀速飞出 deathSlideMs 后消失（位移 = 冲量 × deathSlideMs/1000）
export const KNOCKBACK = { tauMs: 100, maxSpeed: 1300, deathSlideMs: 300 } as const

// 武器库（可被不同角色复用；held 缺省 = 行为主体是角色本体）
const pistol = {
  kind: 'projectile',
  name: '左轮水枪',
  icon: '🔫',
  damage: 16,
  cooldownMs: 600,
  knockback: 3 * UNIT,
  held: {
    emoji: '🔫',
    size: 0.75 * UNIT,
    restOffset: 0.45 * UNIT,
    // twemoji 1f52b 枪口朝左
    rotationOffsetRad: Math.PI,
    mountGap: 0.32 * UNIT,
  },
  projectile: {
    emoji: '💧',
    size: 0.45 * UNIT,
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
    knockback: 3.5 * UNIT,
    projectile: {
      emoji: '🍅',
      size: 0.55 * UNIT,
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
    knockback: 9 * UNIT,
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
    knockback: 7 * UNIT,
    radius: 1.5 * UNIT,
    arcRad: (150 * Math.PI) / 180,
    sweepMs: 260,
    held: {
      emoji: '🪓',
      size: 0.85 * UNIT,
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
    knockback: 12 * UNIT,
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
    knockback: 2.5 * UNIT,
    range: 8 * UNIT,
    beamRadius: 0.22 * UNIT,
    color: 0xff5252,
    held: {
      emoji: '🔦',
      size: 0.75 * UNIT,
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
    knockback: 4.5 * UNIT,
    range: 4 * UNIT,
    outMs: 500,
    returnSpeed: 10 * UNIT,
    hitRadius: 0.5 * UNIT,
    spinRadPerSec: 14,
    held: {
      emoji: '🪃',
      size: 0.75 * UNIT,
      restOffset: 0.5 * UNIT,
      rotationOffsetRad: 0,
    },
  } satisfies BoomerangSpec,
  sparkleBolt: {
    kind: 'projectile',
    name: '魔尘弹',
    icon: '🪄',
    damage: 10,
    cooldownMs: 1000,
    knockback: 2 * UNIT,
    projectile: {
      emoji: '✨',
      size: 0.5 * UNIT,
      radius: 0.17 * UNIT,
      speed: 11 * UNIT,
      rotationOffsetRad: 0,
    },
    // 变形替身：受害者顶着绵羊形象缓速游荡，失去一切伤害能力
    hex: { durationMs: 2500, morphEmoji: '🐑' },
  } satisfies ProjectileSpec,
  shadowStrike: {
    kind: 'assassinate',
    name: '影袭',
    icon: '🗡️',
    damage: 85,
    cooldownMs: 3600,
    knockback: 6 * UNIT,
    range: 6 * UNIT,
    behindDist: 0.6 * UNIT,
    strikeMs: 400,
    held: {
      emoji: '🗡️',
      size: 0.7 * UNIT,
      restOffset: 0.42 * UNIT,
      // twemoji 1f5e1 刀尖朝左下
      rotationOffsetRad: (3 * Math.PI) / 4,
    },
  } satisfies AssassinateSpec,
  woodTurret: {
    kind: 'turret',
    name: '林木弩塔',
    icon: '🏹',
    placeIntervalMs: 4200,
    maxTurrets: 2,
    turret: { emoji: '🏹', size: 0.95 * UNIT },
    fireIntervalMs: 650,
    damage: 13,
    knockback: 2.5 * UNIT,
    range: 5.5 * UNIT,
    projectile: {
      emoji: '🪵',
      size: 0.42 * UNIT,
      radius: 0.15 * UNIT,
      speed: 11 * UNIT,
      rotationOffsetRad: 0,
    },
  } satisfies TurretSpec,
  beeSwarm: {
    kind: 'summon',
    name: '蜂群',
    icon: '🐝',
    count: 3,
    minion: { emoji: '🐝', size: 0.55 * UNIT, speed: 7.5 * UNIT },
    damage: 11,
    knockback: 2 * UNIT,
    hitCooldownMs: 900,
  } satisfies SummonSpec,
  fieldMedkit: {
    kind: 'heal',
    name: '战地医疗',
    icon: '💊',
    amount: 14,
    cooldownMs: 2400,
    range: 4 * UNIT,
  } satisfies HealSpec,
  syringeDart: {
    kind: 'projectile',
    name: '飞针',
    icon: '💉',
    damage: 8,
    cooldownMs: 800,
    knockback: 2 * UNIT,
    projectile: {
      emoji: '💉',
      size: 0.48 * UNIT,
      radius: 0.15 * UNIT,
      speed: 12 * UNIT,
      // twemoji 1f489 针头朝左下
      rotationOffsetRad: (3 * Math.PI) / 4,
    },
  } satisfies ProjectileSpec,
  voltArc: {
    kind: 'chainArc',
    name: '感电触须',
    icon: '⚡',
    damage: 20,
    cooldownMs: 1100,
    knockback: 2.5 * UNIT,
    range: 5.5 * UNIT,
    arcRange: 2.2 * UNIT,
    bounces: 2,
    decay: 0.75,
    color: 0x40c4ff,
  } satisfies ChainArcSpec,
} as const

// 武器索敌上限：超出此距离的敌人不作为开火/瞄准目标。12 单位略大于
// 屏幕中心到角落（≈11.5U），可见敌必打、屏外远敌不追——索敌逻辑必须
// 有界（无限地图防御）。激光用自身更短的 range 门槛，不受此值影响
export const ACQUIRE = { range: 12 * UNIT } as const
