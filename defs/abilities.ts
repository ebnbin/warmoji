import type {
  AreaBlastDef,
  AssassinateDef,
  BoomerangDef,
  BuffDef,
  ChainArcDef,
  DanceDef,
  HealDef,
  LaserDef,
  NukeDef,
  ProjectileDef,
  RallyDef,
  SlowAuraDef,
  StrikeDef,
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

// 基础能力行的组合库（内部；档位靠 spread 基础行省重复）。
// 对外只导出末尾汇总的平级全表 ABILITIES。
const BASE = {
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

  // ── 队长主动技能的效果载荷（castNow 单发；cooldownMs 供角色自动持有
  // 时用，数值对齐技能跨波 CD）──
  holyLight: {
    kind: 'rally',
    name: '圣光降临',
    icon: '✨',
    cooldownMs: 35_000,
    healRatio: 0.5,
    invulnMs: 2000,
    // 冲击环起始半径 = 队伍环半径 + 队员判定半径（TEAM.ringRadius + MEMBER.radius）
    ringRadius: 1.25,
    color: 0xffe082,
  } satisfies RallyDef,
  goldRain: {
    kind: 'strike',
    name: '天降横财',
    icon: '💰',
    damage: 60,
    cooldownMs: 20_000,
    knockback: 10,
    targets: 8,
    coinsPerHit: 1,
    drop: { emoji: '💰', size: 0.75, fromAbove: 3, dropMs: 180, staggerMs: 60 },
  } satisfies StrikeDef,
  discoFever: {
    kind: 'dance',
    name: '全场蹦迪',
    icon: '🪩',
    cooldownMs: 30_000,
    durationMs: 3500,
  } satisfies DanceDef,
  weaknessLecture: {
    kind: 'buff',
    name: '弱点讲义',
    icon: '📖',
    cooldownMs: 30_000,
    damageMul: 1.6,
    durationMs: 8000,
  } satisfies BuffDef,
  dimensionStrike: {
    kind: 'nuke',
    name: '降维打击',
    icon: '🌠',
    damage: 70,
    cooldownMs: 45_000,
    bossRatio: 0.5,
  } satisfies NukeDef,
} as const

// ── 升级卡档位行：升级 = 换持整行 ────────────────────────────
// 每个有升级卡的角色能力两档：`2` = 一阶卡、`3` = 一阶+二阶（累积生效）。
// 展开基础行/低档行，只覆写质变字段；派生值保持表达式，调基础数值单点生效

/** 三重抛掷 */
export const tomatoThrow2 = {
  ...BASE.tomatoThrow,
  volley: { count: 3, spreadDeg: 18 },
} satisfies ProjectileDef
/** 爆浆番茄 */
export const tomatoThrow3 = {
  ...tomatoThrow2,
  splash: { radius: 0.9, ratio: 0.6 },
} satisfies ProjectileDef

/** 二连突刺 */
export const hornThrust2 = {
  ...BASE.hornThrust,
  combo: { delayMs: 170 },
} satisfies ThrustDef
/** 虹光震波 */
export const hornThrust3 = {
  ...hornThrust2,
  onHit: [
    { kind: 'blast', radius: 1.1, ratio: 0.6, knockback: 11.25, ring: { color: 0xff8ad8, fillAlpha: 0.3, lineWidth: 4, lineAlpha: 0.9, durMs: 260 } },
  ],
} satisfies ThrustDef

/** 全周横扫（整圈更慢一拍） */
export const axeSweep2 = {
  ...BASE.axeSweep,
  arcDeg: 360,
  sweepMs: Math.round(BASE.axeSweep.sweepMs * 1.35),
} satisfies SweepDef
/** 震慑余波 */
export const axeSweep3 = {
  ...axeSweep2,
  onHit: [{ kind: 'slow', factor: 0.55, durationMs: 1200 }],
} satisfies SweepDef

/** 贯穿弹 */
export const pistolLeft2 = { ...BASE.pistolLeft, pierce: 2 } satisfies ProjectileDef
export const pistolRight2 = { ...BASE.pistolRight, pierce: 2 } satisfies ProjectileDef
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
  ...BASE.arcaneBlast,
  burn: { radius: 1.4, durationMs: 3000, tickMs: 400, damage: 3, color: 0xff7043, fillAlpha: 0.18, lineAlpha: 0.55, enterMs: 200 },
} satisfies AreaBlastDef
/** 连锁轰炸 */
export const arcaneBlast3 = {
  ...arcaneBlast2,
  echo: { delayMs: 250, ratio: 0.75 },
} satisfies AreaBlastDef

/** 双子回旋 */
export const boomerang2 = { ...BASE.boomerang, twin: true } satisfies BoomerangDef
/** 磁力巨镖（镖体与判定同步 ×1.4） */
export const boomerang3 = {
  ...boomerang2,
  hitRadius: BASE.boomerang.hitRadius * 1.4,
  held: { ...BASE.boomerang.held, size: BASE.boomerang.held.size * 1.4 },
  coinMagnetRadius: 1.6,
} satisfies BoomerangDef

/** 双联光束 */
export const laserBeam2 = { ...BASE.laserBeam, backBeam: true } satisfies LaserDef
/** 全域扫射 */
export const laserBeam3 = {
  ...laserBeam2,
  radial: { beams: 8, ratio: 0.6, stepMs: 60 },
} satisfies LaserDef

/** 冻伤 */
export const frostAura2 = { ...BASE.frostAura, dps: 6 } satisfies SlowAuraDef
/** 凛冬降临 */
export const frostAura3 = {
  ...frostAura2,
  freeze: { intervalMs: 5000, durationMs: 700 },
} satisfies SlowAuraDef

/** 持久变形（带贯穿） */
export const sparkleBolt2 = {
  ...BASE.sparkleBolt,
  pierce: 1,
  hex: { ...BASE.sparkleBolt.hex, durationMs: 4000 },
} satisfies ProjectileDef
/** 脆弱诅咒 */
export const sparkleBolt3 = {
  ...sparkleBolt2,
  hex: { ...sparkleBolt2.hex, vulnMul: 1.4 },
} satisfies ProjectileDef

/** 连环刃（击退取主斩 0.6×） */
export const shadowStrike2 = {
  ...BASE.shadowStrike,
  onHit: [{ kind: 'blast', radius: 1.0, ratio: 0.6, knockback: 3.6 }],
} satisfies AssassinateDef
/** 处决 */
export const shadowStrike3 = {
  ...shadowStrike2,
  execute: { hpRatio: 0.35, mul: 2 },
} satisfies AssassinateDef

/** 扩建工地 */
export const woodTurret2 = {
  ...BASE.woodTurret,
  maxTurrets: BASE.woodTurret.maxTurrets + 1,
} satisfies TurretDef
/** 三连弩 */
export const woodTurret3 = {
  ...woodTurret2,
  burst: { count: 3, spreadDeg: 17 },
} satisfies TurretDef

/** 扩巢 */
export const beeSwarm2 = {
  ...BASE.beeSwarm,
  count: BASE.beeSwarm.count + 1,
} satisfies SummonDef
/** 麻痹毒素 */
export const beeSwarm3 = {
  ...beeSwarm2,
  onHit: [{ kind: 'slow', factor: 0.55, durationMs: 1200 }],
} satisfies SummonDef

/** 群体处方 */
export const fieldMedkit2 = { ...BASE.fieldMedkit, aoe: { ratio: 0.6 } } satisfies HealDef
/** 电击起搏 */
export const fieldMedkit3 = {
  ...fieldMedkit2,
  defib: { reviveCutMs: 2000 },
} satisfies HealDef

/** 超导传递 */
export const voltArc2 = { ...BASE.voltArc, bounces: 4 } satisfies ChainArcDef
/** 过载爆裂（击退取本体 0.6×） */
export const voltArc3 = {
  ...voltArc2,
  onHit: [
    { kind: 'blast', radius: 0.9, ratio: 0.6, knockback: 1.5, ring: { color: 0x40c4ff, fillAlpha: 0.25, lineWidth: 3, lineAlpha: 0.9, durMs: 240 } },
  ],
} satisfies ChainArcDef

// 能力全表：基础行与档位行一律平级——不同档位就是不同的武器，各自独立成行。
// 运行时（abilities/registry）、图鉴、gen 都消费这张表；上面的 BASE 与档位 const
// 只是书写用的组合库，产物在此汇成一张扁平表（档位紧随其基础武器）。
export const ABILITIES = {
  tomatoThrow: BASE.tomatoThrow,
  tomatoThrow2,
  tomatoThrow3,
  hornThrust: BASE.hornThrust,
  hornThrust2,
  hornThrust3,
  axeSweep: BASE.axeSweep,
  axeSweep2,
  axeSweep3,
  pistolLeft: BASE.pistolLeft,
  pistolLeft2,
  pistolLeft3,
  pistolRight: BASE.pistolRight,
  pistolRight2,
  pistolRight3,
  arcaneBlast: BASE.arcaneBlast,
  arcaneBlast2,
  arcaneBlast3,
  laserBeam: BASE.laserBeam,
  laserBeam2,
  laserBeam3,
  frostAura: BASE.frostAura,
  frostAura2,
  frostAura3,
  boomerang: BASE.boomerang,
  boomerang2,
  boomerang3,
  sparkleBolt: BASE.sparkleBolt,
  sparkleBolt2,
  sparkleBolt3,
  shadowStrike: BASE.shadowStrike,
  shadowStrike2,
  shadowStrike3,
  woodTurret: BASE.woodTurret,
  woodTurret2,
  woodTurret3,
  beeSwarm: BASE.beeSwarm,
  beeSwarm2,
  beeSwarm3,
  fieldMedkit: BASE.fieldMedkit,
  fieldMedkit2,
  fieldMedkit3,
  syringeDart: BASE.syringeDart,
  voltArc: BASE.voltArc,
  voltArc2,
  voltArc3,
  holyLight: BASE.holyLight,
  goldRain: BASE.goldRain,
  discoFever: BASE.discoFever,
  weaknessLecture: BASE.weaknessLecture,
  dimensionStrike: BASE.dimensionStrike,
} as const

