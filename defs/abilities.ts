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
  TimeStopDef,
  TurretDef,
} from '../src/types/abilityDefs'

const pistol = {
  kind: 'projectile',
  damage: 16,
  cooldownMs: 600,
  knockback: 3,
  lifeMs: 2000,
  held: {
    emoji: '1f52b',
    size: 0.75,
    restOffset: 0.45,
    // twemoji 1f52b 枪口朝左
    rotationOffsetDeg: 180,
    mountGap: 0.32,
  },
  projectile: {
    emoji: '1f4a7',
    size: 0.45,
    radius: 0.15,
    speed: 13,
    // twemoji 1f4a7 水滴尖端朝上
    rotationOffsetDeg: 90,
  },
} satisfies ProjectileDef

const BASE = {
  tomatoThrow: {
    kind: 'projectile',
    damage: 22,
    cooldownMs: 450,
    knockback: 3.5,
    lifeMs: 2000,
    projectile: {
      emoji: '1f345',
      size: 0.55,
      radius: 0.18,
      speed: 12,
      rotationOffsetDeg: 0,
    },
  } satisfies ProjectileDef,
  hornThrust: {
    kind: 'thrust',
    damage: 26,
    cooldownMs: 900,
    knockback: 9,
    reach: 2.2,
    hitRadius: 0.6,
    thrustMs: 220,
    lungeDist: 1.0,
  } satisfies ThrustDef,
  axeSweep: {
    kind: 'sweep',
    damage: 30,
    cooldownMs: 1200,
    knockback: 7,
    radius: 2.2,
    arcDeg: 150,
    sweepMs: 260,
    held: {
      emoji: '1fa93',
      size: 0.85,
      restOffset: 0.6,
      // twemoji 1fa93 斧刃朝左上
      rotationOffsetDeg: 135,
    },
  } satisfies SweepDef,
  pistolLeft: {
    ...pistol,
    held: { ...pistol.held, mountSide: -1 },
  } satisfies ProjectileDef,
  pistolRight: {
    ...pistol,
    held: { ...pistol.held, mountSide: 1 },
  } satisfies ProjectileDef,
  arcaneBlast: {
    kind: 'areaBlast',
    damage: 22,
    cooldownMs: 1300,
    knockback: 12,
    detectRange: 6,
    blastRadius: 1.3,
    color: 0x9575cd,
  } satisfies AreaBlastDef,
  laserBeam: {
    kind: 'laser',
    damage: 14,
    cooldownMs: 900,
    knockback: 2.5,
    range: 8,
    beamRadius: 0.22,
    color: 0xff5252,
    piercesWalls: true,
    held: {
      emoji: '1f526',
      size: 0.75,
      restOffset: 0.45,
      // twemoji 1f526 灯头朝左下
      rotationOffsetDeg: 135,
    },
  } satisfies LaserDef,
  frostAura: {
    kind: 'slowAura',
    radius: 3,
    slowFactor: 0.5,
    color: 0x81d4fa,
  } satisfies SlowAuraDef,
  boomerang: {
    kind: 'boomerang',
    damage: 18,
    cooldownMs: 1200,
    knockback: 4.5,
    range: 4,
    outMs: 500,
    returnSpeed: 10,
    hitRadius: 0.5,
    spinDegPerSec: 800,
    held: {
      emoji: '1fa83',
      size: 0.75,
      restOffset: 0.5,
      rotationOffsetDeg: 0,
    },
  } satisfies BoomerangDef,
  sparkleBolt: {
    kind: 'projectile',
    damage: 10,
    cooldownMs: 1000,
    knockback: 2,
    lifeMs: 2000,
    projectile: {
      emoji: '2728',
      size: 0.5,
      radius: 0.17,
      speed: 11,
      rotationOffsetDeg: 0,
    },
    onHit: [{ kind: 'morph', durationMs: 2500, morphEmoji: '1f411' }],
  } satisfies ProjectileDef,
  shadowStrike: {
    kind: 'assassinate',
    damage: 85,
    cooldownMs: 3600,
    knockback: 6,
    range: 6,
    behindDist: 0.6,
    strikeMs: 400,
    held: {
      emoji: '1f5e1',
      size: 0.7,
      restOffset: 0.42,
      // twemoji 1f5e1 刀尖朝左下
      rotationOffsetDeg: 135,
    },
  } satisfies AssassinateDef,
  woodTurret: {
    kind: 'turret',
    placeIntervalMs: 4200,
    maxTurrets: 2,
    turret: { emoji: '1f3f9', size: 0.95 },
    fireIntervalMs: 650,
    damage: 13,
    knockback: 2.5,
    range: 5.5,
    lifeMs: 2000,
    projectile: {
      emoji: '1fab5',
      size: 0.42,
      radius: 0.15,
      speed: 11,
      rotationOffsetDeg: 0,
    },
  } satisfies TurretDef,
  beeSwarm: {
    kind: 'summon',
    count: 3,
    minion: { emoji: '1f41d', size: 0.5, speed: 8 },
    damage: 5,
    knockback: 2,
    intervalMs: 2600,
    lifeMs: 4000,
    onHit: [{ kind: 'poison', damage: 8, tickMs: 1000, durationMs: 5000 }],
  } satisfies SummonDef,
  fieldMedkit: {
    kind: 'heal',
    amount: 14,
    cooldownMs: 2400,
    range: 4,
  } satisfies HealDef,
  syringeDart: {
    kind: 'projectile',
    damage: 8,
    cooldownMs: 800,
    knockback: 2,
    lifeMs: 2000,
    projectile: {
      emoji: '1f489',
      size: 0.48,
      radius: 0.15,
      speed: 12,
      // twemoji 1f489 针头朝左下
      rotationOffsetDeg: 135,
    },
  } satisfies ProjectileDef,
  voltArc: {
    kind: 'chainArc',
    damage: 20,
    cooldownMs: 1100,
    knockback: 2.5,
    range: 5.5,
    arcRange: 2.2,
    bounces: 2,
    decay: 0.75,
    color: 0x40c4ff,
  } satisfies ChainArcDef,

  // ── 队长主动技能载荷 ──
  holyLight: {
    kind: 'rally',
    cooldownMs: 35_000,
    healRatio: 0.5,
    invulnMs: 2000,
    // = TEAM.ringRadius + MEMBER.radius
    ringRadius: 1.25,
    color: 0xffe082,
  } satisfies RallyDef,
  goldRain: {
    kind: 'strike',
    damage: 60,
    cooldownMs: 20_000,
    knockback: 10,
    targets: 8,
    coinsPerHit: 1,
    drop: { emoji: '1f4b0', size: 0.75, fromAbove: 3, dropMs: 180, staggerMs: 60 },
  } satisfies StrikeDef,
  discoFever: {
    kind: 'dance',
    cooldownMs: 30_000,
    durationMs: 3500,
  } satisfies DanceDef,
  weaknessLecture: {
    kind: 'buff',
    cooldownMs: 30_000,
    damageMul: 1.6,
    durationMs: 8000,
  } satisfies BuffDef,
  dimensionStrike: {
    kind: 'nuke',
    damage: 70,
    cooldownMs: 45_000,
    bossRatio: 0.5,
  } satisfies NukeDef,
  timeFreeze: {
    kind: 'timeStop',
    cooldownMs: 45_000,
    durationMs: 15_000,
  } satisfies TimeStopDef,
} as const

// ── 升级档位行：后缀 2 = 一阶卡，3 = 一阶 + 二阶累积 ──

const tomatoThrow2 = {
  ...BASE.tomatoThrow,
  volley: { count: 3, spreadDeg: 18 },
} satisfies ProjectileDef
const tomatoThrow3 = {
  ...tomatoThrow2,
  onHit: [
    { kind: 'blast', radius: 0.9, ratio: 0.6, knockback: 0, ring: { color: 0xef5350, fillAlpha: 0.25, lineWidth: 3, lineAlpha: 0.8, durMs: 220 } },
  ],
} satisfies ProjectileDef

const hornThrust2 = {
  ...BASE.hornThrust,
  combo: { delayMs: 170 },
} satisfies ThrustDef
const hornThrust3 = {
  ...hornThrust2,
  onHit: [
    { kind: 'blast', radius: 1.1, ratio: 0.6, knockback: 11.25, ring: { color: 0xff8ad8, fillAlpha: 0.3, lineWidth: 4, lineAlpha: 0.9, durMs: 260 } },
  ],
} satisfies ThrustDef

const axeSweep2 = {
  ...BASE.axeSweep,
  arcDeg: 360,
  sweepMs: Math.round(BASE.axeSweep.sweepMs * 1.35),
} satisfies SweepDef
const axeSweep3 = {
  ...axeSweep2,
  onHit: [{ kind: 'slow', factor: 0.55, durationMs: 1200 }],
} satisfies SweepDef

const pistolLeft2 = { ...BASE.pistolLeft, pierce: 2 } satisfies ProjectileDef
const pistolRight2 = { ...BASE.pistolRight, pierce: 2 } satisfies ProjectileDef
const pistolLeft3 = {
  ...pistolLeft2,
  everyN: { n: 4, count: 5, spreadDeg: 32 },
} satisfies ProjectileDef
const pistolRight3 = {
  ...pistolRight2,
  everyN: { n: 4, count: 5, spreadDeg: 32 },
} satisfies ProjectileDef

const arcaneBlast2 = {
  ...BASE.arcaneBlast,
  onHit: [
    { kind: 'ground', def: { radius: 1.4, durationMs: 3000, tickMs: 400, damage: 3, color: 0xff7043, fillAlpha: 0.18, lineAlpha: 0.55, enterMs: 200 } },
  ],
} satisfies AreaBlastDef
const arcaneBlast3 = {
  ...arcaneBlast2,
  echo: { delayMs: 250, ratio: 0.75 },
} satisfies AreaBlastDef

const boomerang2 = { ...BASE.boomerang, twin: true } satisfies BoomerangDef
const boomerang3 = {
  ...boomerang2,
  hitRadius: BASE.boomerang.hitRadius * 1.4,
  held: { ...BASE.boomerang.held, size: BASE.boomerang.held.size * 1.4 },
  coinMagnetRadius: 1.6,
} satisfies BoomerangDef

const laserBeam2 = { ...BASE.laserBeam, backBeam: true } satisfies LaserDef
const laserBeam3 = {
  ...laserBeam2,
  radial: { beams: 8, ratio: 0.6, stepMs: 60 },
} satisfies LaserDef

const frostAura2 = { ...BASE.frostAura, dps: 6 } satisfies SlowAuraDef
const frostAura3 = {
  ...frostAura2,
  freeze: { intervalMs: 5000, durationMs: 700 },
} satisfies SlowAuraDef

const sparkleBolt2 = {
  ...BASE.sparkleBolt,
  pierce: 1,
  onHit: [{ kind: 'morph', durationMs: 4000, morphEmoji: '1f411' }],
} satisfies ProjectileDef
const sparkleBolt3 = {
  ...sparkleBolt2,
  onHit: [{ kind: 'morph', durationMs: 4000, morphEmoji: '1f411', vulnMul: 1.4 }],
} satisfies ProjectileDef

const shadowStrike2 = {
  ...BASE.shadowStrike,
  // knockback = 主斩击退 × 0.6
  onHit: [{ kind: 'blast', radius: 1.0, ratio: 0.6, knockback: 3.6 }],
} satisfies AssassinateDef
const shadowStrike3 = {
  ...shadowStrike2,
  execute: { hpRatio: 0.35, mul: 2 },
} satisfies AssassinateDef

const woodTurret2 = {
  ...BASE.woodTurret,
  maxTurrets: BASE.woodTurret.maxTurrets + 1,
} satisfies TurretDef
const woodTurret3 = {
  ...woodTurret2,
  burst: { count: 3, spreadDeg: 17 },
} satisfies TurretDef

const beeSwarm2 = {
  ...BASE.beeSwarm,
  count: BASE.beeSwarm.count + 1,
} satisfies SummonDef
const beeSwarm3 = {
  ...beeSwarm2,
  onHit: [
    { kind: 'poison', damage: 13, tickMs: 1000, durationMs: 5000 },
    { kind: 'slow', factor: 0.55, durationMs: 1200 },
  ],
} satisfies SummonDef

const fieldMedkit2 = { ...BASE.fieldMedkit, aoe: { ratio: 0.6 } } satisfies HealDef
const fieldMedkit3 = {
  ...fieldMedkit2,
  defib: { reviveCutMs: 2000 },
} satisfies HealDef

const voltArc2 = { ...BASE.voltArc, bounces: 4 } satisfies ChainArcDef
const voltArc3 = {
  ...voltArc2,
  // knockback = 本体击退 × 0.6
  onHit: [
    { kind: 'blast', radius: 0.9, ratio: 0.6, knockback: 1.5, ring: { color: 0x40c4ff, fillAlpha: 0.25, lineWidth: 3, lineAlpha: 0.9, durMs: 240 } },
  ],
} satisfies ChainArcDef

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
  timeFreeze: BASE.timeFreeze,
} as const

