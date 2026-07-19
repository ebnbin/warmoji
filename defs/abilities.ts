import type {
  AreaBlastDef,
  AssassinateDef,
  BoomerangDef,
  ChainArcDef,
  HealDef,
  LaserDef,
  ProjectileDef,
  SlowAuraDef,
  SummonDef,
  SweepDef,
  ThrustDef,
  TurretDef,
} from '../src/abilities/defs'

// 创作层（不进运行时 bundle）：能力数据行。经 scripts/gen-defs.ts 校验后
// 生成 src/gen/abilities.json；展开/派生在此层合法（构建期逻辑），
// 产物必须是纯静态数据。

// 能力库（可被不同角色复用；held 缺省 = 行为主体是角色本体）
const pistol = {
  kind: 'projectile',
  name: '左轮水枪',
  icon: '🔫',
  damage: 16,
  cooldownMs: 600,
  knockback: 3,
  held: {
    emoji: '🔫',
    size: 0.75,
    restOffset: 0.45,
    // twemoji 1f52b 枪口朝左
    rotationOffsetDeg: 180,
    mountGap: 0.32,
  },
  projectile: {
    emoji: '💧',
    size: 0.45,
    radius: 0.15,
    speed: 13,
    // twemoji 1f4a7 水滴尖端朝上
    rotationOffsetDeg: 90,
  },
} satisfies ProjectileDef

export const ABILITIES = {
  tomatoThrow: {
    kind: 'projectile',
    name: '番茄连投',
    icon: '🍅',
    damage: 22,
    cooldownMs: 450,
    knockback: 3.5,
    projectile: {
      emoji: '🍅',
      size: 0.55,
      radius: 0.18,
      speed: 12,
      rotationOffsetDeg: 0,
    },
  } satisfies ProjectileDef,
  hornThrust: {
    kind: 'thrust',
    name: '独角突刺',
    icon: '⚔️',
    damage: 26,
    cooldownMs: 900,
    knockback: 9,
    reach: 1.4,
    hitRadius: 0.5,
    thrustMs: 220,
    lungeDist: 0.7,
  } satisfies ThrustDef,
  axeSweep: {
    kind: 'sweep',
    name: '巨斧横扫',
    icon: '🪓',
    damage: 30,
    cooldownMs: 1200,
    knockback: 7,
    radius: 1.5,
    arcDeg: 150,
    sweepMs: 260,
    held: {
      emoji: '🪓',
      size: 0.85,
      restOffset: 0.6,
      // twemoji 1fa93 斧刃朝左上
      rotationOffsetDeg: 135,
    },
  } satisfies SweepDef,
  pistolLeft: {
    ...pistol,
    name: '左轮水枪·左',
    held: { ...pistol.held, mountSide: -1 },
  } satisfies ProjectileDef,
  pistolRight: {
    ...pistol,
    name: '左轮水枪·右',
    held: { ...pistol.held, mountSide: 1 },
  } satisfies ProjectileDef,
  arcaneBlast: {
    kind: 'areaBlast',
    name: '奥术轰炸',
    icon: '💥',
    damage: 22,
    cooldownMs: 1300,
    knockback: 12,
    detectRange: 6,
    blastRadius: 1.3,
    color: 0x9575cd,
  } satisfies AreaBlastDef,
  laserBeam: {
    kind: 'laser',
    name: '贯穿激光',
    icon: '🔦',
    damage: 14,
    cooldownMs: 900,
    knockback: 2.5,
    range: 8,
    beamRadius: 0.22,
    color: 0xff5252,
    held: {
      emoji: '🔦',
      size: 0.75,
      restOffset: 0.45,
      // twemoji 1f526 灯头朝左下
      rotationOffsetDeg: 135,
    },
  } satisfies LaserDef,
  frostAura: {
    kind: 'slowAura',
    name: '寒气光环',
    icon: '❄️',
    radius: 3,
    slowFactor: 0.5,
    color: 0x81d4fa,
  } satisfies SlowAuraDef,
  boomerang: {
    kind: 'boomerang',
    name: '回旋镖',
    icon: '🪃',
    damage: 18,
    cooldownMs: 1200,
    knockback: 4.5,
    range: 4,
    outMs: 500,
    returnSpeed: 10,
    hitRadius: 0.5,
    spinDegPerSec: 800,
    held: {
      emoji: '🪃',
      size: 0.75,
      restOffset: 0.5,
      rotationOffsetDeg: 0,
    },
  } satisfies BoomerangDef,
  sparkleBolt: {
    kind: 'projectile',
    name: '魔尘弹',
    icon: '🪄',
    damage: 10,
    cooldownMs: 1000,
    knockback: 2,
    projectile: {
      emoji: '✨',
      size: 0.5,
      radius: 0.17,
      speed: 11,
      rotationOffsetDeg: 0,
    },
    // 变形替身：受害者顶着绵羊形象缓速游荡，失去一切伤害能力
    hex: { durationMs: 2500, morphEmoji: '🐑' },
  } satisfies ProjectileDef,
  shadowStrike: {
    kind: 'assassinate',
    name: '影袭',
    icon: '🗡️',
    damage: 85,
    cooldownMs: 3600,
    knockback: 6,
    range: 6,
    behindDist: 0.6,
    strikeMs: 400,
    held: {
      emoji: '🗡️',
      size: 0.7,
      restOffset: 0.42,
      // twemoji 1f5e1 刀尖朝左下
      rotationOffsetDeg: 135,
    },
  } satisfies AssassinateDef,
  woodTurret: {
    kind: 'turret',
    name: '林木弩塔',
    icon: '🏹',
    placeIntervalMs: 4200,
    maxTurrets: 2,
    turret: { emoji: '🏹', size: 0.95 },
    fireIntervalMs: 650,
    damage: 13,
    knockback: 2.5,
    range: 5.5,
    projectile: {
      emoji: '🪵',
      size: 0.42,
      radius: 0.15,
      speed: 11,
      rotationOffsetDeg: 0,
    },
  } satisfies TurretDef,
  beeSwarm: {
    kind: 'summon',
    name: '蜂群',
    icon: '🐝',
    count: 3,
    minion: { emoji: '🐝', size: 0.55, speed: 7.5 },
    damage: 11,
    knockback: 2,
    hitCooldownMs: 900,
  } satisfies SummonDef,
  fieldMedkit: {
    kind: 'heal',
    name: '战地医疗',
    icon: '💊',
    amount: 14,
    cooldownMs: 2400,
    range: 4,
  } satisfies HealDef,
  syringeDart: {
    kind: 'projectile',
    name: '飞针',
    icon: '💉',
    damage: 8,
    cooldownMs: 800,
    knockback: 2,
    projectile: {
      emoji: '💉',
      size: 0.48,
      radius: 0.15,
      speed: 12,
      // twemoji 1f489 针头朝左下
      rotationOffsetDeg: 135,
    },
  } satisfies ProjectileDef,
  voltArc: {
    kind: 'chainArc',
    name: '感电触须',
    icon: '⚡',
    damage: 20,
    cooldownMs: 1100,
    knockback: 2.5,
    range: 5.5,
    arcRange: 2.2,
    bounces: 2,
    decay: 0.75,
    color: 0x40c4ff,
  } satisfies ChainArcDef,
} as const

// ── 升级卡档位行：升级 = 换持整行 ────────────────────────────
// 每个有升级卡的角色能力两档：`2` = 一阶卡、`3` = 一阶+二阶（累积生效）。
// 展开基础行/低档行，只覆写质变字段；派生值保持表达式，调基础数值单点生效

/** 三重抛掷 */
export const tomatoThrow2 = {
  ...ABILITIES.tomatoThrow,
  volley: { count: 3, spreadDeg: 18 },
} satisfies ProjectileDef
/** 爆浆番茄 */
export const tomatoThrow3 = {
  ...tomatoThrow2,
  splash: { radius: 0.9, ratio: 0.6 },
} satisfies ProjectileDef

/** 二连突刺 */
export const hornThrust2 = {
  ...ABILITIES.hornThrust,
  combo: { delayMs: 170 },
} satisfies ThrustDef
/** 虹光震波 */
export const hornThrust3 = {
  ...hornThrust2,
  tipBurst: { radius: 1.1, ratio: 0.6, knockback: 11.25, color: 0xff8ad8 },
} satisfies ThrustDef

/** 全周横扫（整圈更慢一拍） */
export const axeSweep2 = {
  ...ABILITIES.axeSweep,
  arcDeg: 360,
  sweepMs: Math.round(ABILITIES.axeSweep.sweepMs * 1.35),
} satisfies SweepDef
/** 震慑余波 */
export const axeSweep3 = {
  ...axeSweep2,
  slowOnHit: { factor: 0.55, durationMs: 1200 },
} satisfies SweepDef

/** 贯穿弹 */
export const pistolLeft2 = { ...ABILITIES.pistolLeft, pierce: 2 } satisfies ProjectileDef
export const pistolRight2 = { ...ABILITIES.pistolRight, pierce: 2 } satisfies ProjectileDef
/** 左轮风暴 */
export const pistolLeft3 = {
  ...pistolLeft2,
  everyN: { n: 4, count: 5, spreadDeg: 32 },
} satisfies ProjectileDef
export const pistolRight3 = {
  ...pistolRight2,
  everyN: { n: 4, count: 5, spreadDeg: 32 },
} satisfies ProjectileDef

/** 余烬秘火 */
export const arcaneBlast2 = {
  ...ABILITIES.arcaneBlast,
  burn: { radius: 1.4, durationMs: 3000, tickMs: 400, damage: 3, color: 0xff7043, fillAlpha: 0.18, lineAlpha: 0.55, enterMs: 200 },
} satisfies AreaBlastDef
/** 连锁轰炸 */
export const arcaneBlast3 = {
  ...arcaneBlast2,
  echo: { delayMs: 250, ratio: 0.75 },
} satisfies AreaBlastDef

/** 双子回旋 */
export const boomerang2 = { ...ABILITIES.boomerang, twin: true } satisfies BoomerangDef
/** 磁力巨镖（镖体与判定同步 ×1.4） */
export const boomerang3 = {
  ...boomerang2,
  hitRadius: ABILITIES.boomerang.hitRadius * 1.4,
  held: { ...ABILITIES.boomerang.held, size: ABILITIES.boomerang.held.size * 1.4 },
  coinMagnetRadius: 1.6,
} satisfies BoomerangDef

/** 双联光束 */
export const laserBeam2 = { ...ABILITIES.laserBeam, backBeam: true } satisfies LaserDef
/** 全域扫射 */
export const laserBeam3 = {
  ...laserBeam2,
  radial: { beams: 8, ratio: 0.6, stepMs: 60 },
} satisfies LaserDef

/** 冻伤 */
export const frostAura2 = { ...ABILITIES.frostAura, dps: 6 } satisfies SlowAuraDef
/** 凛冬降临 */
export const frostAura3 = {
  ...frostAura2,
  freeze: { intervalMs: 5000, durationMs: 700 },
} satisfies SlowAuraDef

/** 持久变形（带贯穿） */
export const sparkleBolt2 = {
  ...ABILITIES.sparkleBolt,
  pierce: 1,
  hex: { ...ABILITIES.sparkleBolt.hex, durationMs: 4000 },
} satisfies ProjectileDef
/** 脆弱诅咒 */
export const sparkleBolt3 = {
  ...sparkleBolt2,
  hex: { ...sparkleBolt2.hex, vulnMul: 1.4 },
} satisfies ProjectileDef

/** 连环刃 */
export const shadowStrike2 = {
  ...ABILITIES.shadowStrike,
  cleave: { radius: 1.0, ratio: 0.6 },
} satisfies AssassinateDef
/** 处决 */
export const shadowStrike3 = {
  ...shadowStrike2,
  execute: { hpRatio: 0.35, mul: 2 },
} satisfies AssassinateDef

/** 扩建工地 */
export const woodTurret2 = {
  ...ABILITIES.woodTurret,
  maxTurrets: ABILITIES.woodTurret.maxTurrets + 1,
} satisfies TurretDef
/** 三连弩 */
export const woodTurret3 = {
  ...woodTurret2,
  burst: { count: 3, spreadDeg: 17 },
} satisfies TurretDef

/** 扩巢 */
export const beeSwarm2 = {
  ...ABILITIES.beeSwarm,
  count: ABILITIES.beeSwarm.count + 1,
} satisfies SummonDef
/** 麻痹毒素 */
export const beeSwarm3 = {
  ...beeSwarm2,
  sting: { slowFactor: 0.55, slowMs: 1200 },
} satisfies SummonDef

/** 群体处方 */
export const fieldMedkit2 = { ...ABILITIES.fieldMedkit, aoe: { ratio: 0.6 } } satisfies HealDef
/** 电击起搏 */
export const fieldMedkit3 = {
  ...fieldMedkit2,
  defib: { reviveCutMs: 2000 },
} satisfies HealDef

/** 超导传递 */
export const voltArc2 = { ...ABILITIES.voltArc, bounces: 4 } satisfies ChainArcDef
/** 过载爆裂 */
export const voltArc3 = {
  ...voltArc2,
  burstEnd: { radius: 0.9, ratio: 0.6 },
} satisfies ChainArcDef

