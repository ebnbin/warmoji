import type { AbilityDef } from '../src/types/abilityDefs'

const pistol = {
  trigger: 'auto',
  cooldownMs: 600,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 16,
  knockback: 3,
  held: {
    emoji: '1f52b',
    size: 0.75,
    restOffset: 0.45,
    rotationOffsetDeg: 180,
    mountGap: 0.32,
  },
  shape: {
    kind: 'bolt',
    projectile: { emoji: '1f4a7', size: 0.45, radius: 0.15, speed: 13, rotationOffsetDeg: 90 },
    lifeMs: 2000,
  },
} satisfies AbilityDef

const woodTurretShot = {
  trigger: 'auto',
  cooldownMs: 650,
  aim: 'nearest',
  fireSfx: 'shoot',
  range: 5.5,
  damage: 13,
  knockback: 2.5,
  shape: {
    kind: 'bolt',
    projectile: { emoji: '1fab5', size: 0.42, radius: 0.15, speed: 11, rotationOffsetDeg: 0 },
    lifeMs: 2000,
  },
} satisfies AbilityDef

const BASE = {
  tomatoThrow: {
    trigger: 'auto',
    cooldownMs: 450,
    aim: 'nearest',
    fireSfx: 'shoot',
    damage: 22,
    knockback: 3.5,
    shape: {
      kind: 'bolt',
      projectile: { emoji: '1f345', size: 0.55, radius: 0.18, speed: 12, rotationOffsetDeg: 0 },
      lifeMs: 2000,
    },
  } satisfies AbilityDef,
  hornThrust: {
    trigger: 'auto',
    cooldownMs: 900,
    aim: 'nearest',
    fireSfx: 'whoosh',
    damage: 26,
    knockback: 9,
    shape: { kind: 'segment', reach: 2.2, radius: 0.6, ms: 220, lungeDist: 1.0 },
  } satisfies AbilityDef,
  axeSweep: {
    trigger: 'auto',
    cooldownMs: 1200,
    aim: 'nearest',
    fireSfx: 'whoosh',
    damage: 30,
    knockback: 7,
    held: {
      emoji: '1fa93',
      size: 0.85,
      restOffset: 0.6,
      rotationOffsetDeg: 135,
    },
    shape: { kind: 'sector', radius: 2.2, arcDeg: 150, ms: 260 },
  } satisfies AbilityDef,
  pistolLeft: {
    ...pistol,
    held: { ...pistol.held, mountSide: -1 },
  } satisfies AbilityDef,
  pistolRight: {
    ...pistol,
    held: { ...pistol.held, mountSide: 1 },
  } satisfies AbilityDef,
  arcaneBlast: {
    trigger: 'auto',
    cooldownMs: 1300,
    aim: 'nearest',
    fireSfx: 'boom',
    range: 6,
    damage: 22,
    knockback: 12,
    color: 0x9575cd,
    shape: { kind: 'disc', radius: 1.3, at: 'target' },
  } satisfies AbilityDef,
  laserBeam: {
    trigger: 'auto',
    cooldownMs: 900,
    aim: 'nearest',
    fireSfx: 'zap',
    range: 8,
    damage: 14,
    knockback: 2.5,
    color: 0xff5252,
    piercesWalls: true,
    held: {
      emoji: '1f526',
      size: 0.75,
      restOffset: 0.45,
      rotationOffsetDeg: 135,
    },
    shape: { kind: 'segment', reach: 8, radius: 0.22, ms: 0, beam: true },
  } satisfies AbilityDef,
  frostAura: {
    trigger: 'auto',
    cooldownMs: 0,
    aim: 'self',
    color: 0x81d4fa,
    shape: {
      kind: 'zone',
      radius: 3,
      durationMs: 0,
      tickMs: 500,
      follow: true,
      visual: { color: 0x81d4fa, fillAlpha: 0.08, lineAlpha: 0.35, lineWidth: 2, enterMs: 0 },
    },
    onHit: [{ kind: 'slow', factor: 0.5, durationMs: 600 }],
  } satisfies AbilityDef,
  boomerang: {
    trigger: 'auto',
    cooldownMs: 1200,
    aim: 'nearest',
    fireSfx: 'whoosh',
    damage: 18,
    knockback: 4.5,
    held: {
      emoji: '1fa83',
      size: 0.75,
      restOffset: 0.5,
      rotationOffsetDeg: 0,
    },
    shape: { kind: 'flyer', range: 4, outMs: 500, returnSpeed: 10, radius: 0.5, spinDegPerSec: 800 },
  } satisfies AbilityDef,
  sparkleBolt: {
    trigger: 'auto',
    cooldownMs: 1000,
    aim: 'nearest',
    fireSfx: 'shoot',
    damage: 10,
    knockback: 2,
    shape: {
      kind: 'bolt',
      projectile: { emoji: '2728', size: 0.5, radius: 0.17, speed: 11, rotationOffsetDeg: 0 },
      lifeMs: 2000,
    },
    onHit: [{ kind: 'morph', durationMs: 2500, morphEmoji: '1f411' }],
  } satisfies AbilityDef,
  shadowStrike: {
    trigger: 'auto',
    cooldownMs: 3600,
    aim: 'strongest',
    fireSfx: 'whoosh',
    range: 6,
    damage: 85,
    knockback: 6,
    held: {
      emoji: '1f5e1',
      size: 0.7,
      restOffset: 0.42,
      rotationOffsetDeg: 135,
    },
    shape: { kind: 'blink', behindDist: 0.6, strikeMs: 400 },
  } satisfies AbilityDef,
  woodTurret: {
    trigger: 'auto',
    cooldownMs: 4200,
    aim: 'self',
    fireSfx: 'recruit',
    shape: {
      kind: 'emplace',
      count: 1,
      maxAlive: 2,
      lifeMs: 0,
      turret: { emoji: '1f3f9', size: 0.95 },
      ability: woodTurretShot,
    },
  } satisfies AbilityDef,
  beeSwarm: {
    trigger: 'auto',
    cooldownMs: 2600,
    aim: 'self',
    damage: 5,
    knockback: 2,
    shape: {
      kind: 'summon',
      count: 3,
      minion: { emoji: '1f41d', size: 0.5, speed: 8, orbit: { radius: 0.625, spinRadPerSec: 3 } },
      lifeMs: 4000,
    },
    onHit: [{ kind: 'poison', damage: 8, tickMs: 1000, durationMs: 5000 }],
  } satisfies AbilityDef,
  fieldMedkit: {
    trigger: 'auto',
    cooldownMs: 2400,
    aim: 'self',
    fireSfx: 'upgrade',
    shape: { kind: 'disc', radius: 4, at: 'self', of: 'hurt' },
    onHit: [{ kind: 'heal', amount: 14, scope: 'lowest' }],
  } satisfies AbilityDef,
  syringeDart: {
    trigger: 'auto',
    cooldownMs: 800,
    aim: 'nearest',
    fireSfx: 'shoot',
    damage: 8,
    knockback: 2,
    shape: {
      kind: 'bolt',
      projectile: { emoji: '1f489', size: 0.48, radius: 0.15, speed: 12, rotationOffsetDeg: 135 },
      lifeMs: 2000,
    },
  } satisfies AbilityDef,
  voltArc: {
    trigger: 'auto',
    cooldownMs: 1100,
    aim: 'nearest',
    fireSfx: 'zap',
    range: 5.5,
    damage: 20,
    knockback: 2.5,
    color: 0x40c4ff,
    shape: { kind: 'chain', hops: 2, hopRange: 2.2, decay: 0.75 },
  } satisfies AbilityDef,

  rainbowRush: {
    trigger: 'manual',
    aim: 'stick',
    fireSfx: 'whoosh',
    damage: 28,
    knockback: 10,
    color: 0xff8ad8,
    shape: { kind: 'sprint', distance: 3.5, ms: 240, radius: 0.8 },
  } satisfies AbilityDef,
  bounceStomp: {
    trigger: 'manual',
    aim: 'stick',
    fireSfx: 'whoosh',
    damage: 40,
    knockback: 12,
    color: 0xffb74d,
    shape: { kind: 'leap', distance: 4, ms: 520, height: 1.6, radius: 1.8 },
  } satisfies AbilityDef,
  trollRoar: {
    trigger: 'manual',
    aim: 'self',
    fireSfx: 'over',
    color: 0xef5350,
    shape: { kind: 'disc', radius: 4.5, at: 'self' },
    onHit: [{ kind: 'taunt', durationMs: 2500 }],
    onSelf: [{ kind: 'guard', mul: 0.6, durationMs: 2500 }],
  } satisfies AbilityDef,
  shadowVeil: {
    trigger: 'manual',
    aim: 'self',
    fireSfx: 'whoosh',
    shape: { kind: 'all', of: 'allies', downed: true },
    onHit: [{ kind: 'hide', durationMs: 2200 }],
  } satisfies AbilityDef,
  beeCourt: {
    trigger: 'manual',
    aim: 'self',
    fireSfx: 'recruit',
    damage: 4,
    color: 0xffca28,
    shape: {
      kind: 'zone',
      radius: 4,
      durationMs: 5000,
      tickMs: 500,
      mend: 5,
      visual: { color: 0xffca28, fillAlpha: 0.14, lineAlpha: 0.6, lineWidth: 3, enterMs: 300 },
    },
  } satisfies AbilityDef,
  quickBuild: {
    trigger: 'manual',
    aim: 'self',
    fireSfx: 'recruit',
    shape: {
      kind: 'emplace',
      count: 3,
      spread: 1.2,
      maxAlive: 3,
      lifeMs: 8000,
      turret: { emoji: '1f3f9', size: 0.95 },
      ability: {
        trigger: 'auto',
        cooldownMs: 650,
        aim: 'nearest',
        fireSfx: 'shoot',
        range: 5.5,
        damage: 10,
        knockback: 2,
        shape: {
          kind: 'bolt',
          projectile: { emoji: '1f3f9', size: 0.5, radius: 0.16, speed: 14, rotationOffsetDeg: 45 },
          lifeMs: 1500,
        },
      },
    },
  } satisfies AbilityDef,
  sheepParty: {
    trigger: 'manual',
    aim: 'self',
    fireSfx: 'boom',
    color: 0xf48fb1,
    shape: { kind: 'disc', radius: 3, at: 'self' },
    onHit: [{ kind: 'morph', durationMs: 3000, morphEmoji: '1f411' }],
  } satisfies AbilityDef,
  emPulse: {
    trigger: 'manual',
    aim: 'self',
    fireSfx: 'boom',
    damage: 24,
    knockback: 4,
    color: 0x40c4ff,
    shape: { kind: 'disc', radius: 6, at: 'self' },
    onHit: [{ kind: 'slow', factor: 0.5, durationMs: 2500 }],
  } satisfies AbilityDef,
  jugglerDance: {
    trigger: 'manual',
    aim: 'self',
    shape: { kind: 'all', of: 'foes' },
    onHit: [{ kind: 'stun', durationMs: 2500 }],
  } satisfies AbilityDef,
  cowboyStrike: {
    trigger: 'manual',
    aim: 'nearest',
    damage: 40,
    knockback: 8,
    shape: { kind: 'drop', targets: 5, emoji: '1f4b0', size: 0.7, fromAbove: 3, dropMs: 180, staggerMs: 70 },
    onHit: [{ kind: 'coins', count: 1 }],
  } satisfies AbilityDef,
  mageLecture: {
    trigger: 'manual',
    aim: 'self',
    shape: { kind: 'all', of: 'allies', downed: true },
    onHit: [{ kind: 'buff', damageMul: 1.4, durationMs: 6000 }],
  } satisfies AbilityDef,
  robotNuke: {
    trigger: 'manual',
    aim: 'self',
    fireSfx: 'boom',
    damage: 45,
    waveScale: true,
    bossRatio: 0.4,
    shape: { kind: 'all', of: 'foes' },
  } satisfies AbilityDef,
  snowmanFreeze: {
    trigger: 'manual',
    aim: 'self',
    shape: { kind: 'world' },
    onHit: [{ kind: 'timeStop', durationMs: 8000 }],
  } satisfies AbilityDef,
  medicRally: {
    trigger: 'manual',
    aim: 'self',
    color: 0xa5d6a7,
    fxRadius: 1.25,
    shape: { kind: 'all', of: 'allies', downed: true },
    onHit: [{ kind: 'revive' }, { kind: 'healRatio', ratio: 0.35 }, { kind: 'invuln', ms: 1200 }],
  } satisfies AbilityDef,
} as const

const tomatoThrow2 = {
  ...BASE.tomatoThrow,
  repeat: { count: 3, spreadDeg: 18 },
} satisfies AbilityDef
const tomatoThrow3 = {
  ...tomatoThrow2,
  onHit: [
    { kind: 'blast', radius: 0.9, ratio: 0.6, knockback: 0, ring: { color: 0xef5350, fillAlpha: 0.25, lineWidth: 3, lineAlpha: 0.8, durMs: 220 } },
  ],
} satisfies AbilityDef

const hornThrust2 = {
  ...BASE.hornThrust,
  repeat: { count: 2, delayMs: 170, reaim: 'nearest' },
} satisfies AbilityDef
const hornThrust3 = {
  ...hornThrust2,
  onHit: [
    { kind: 'blast', radius: 1.1, ratio: 0.6, knockback: 11.25, ring: { color: 0xff8ad8, fillAlpha: 0.3, lineWidth: 4, lineAlpha: 0.9, durMs: 260 } },
  ],
} satisfies AbilityDef

const axeSweep2 = {
  ...BASE.axeSweep,
  shape: { ...BASE.axeSweep.shape, arcDeg: 360, ms: Math.round(BASE.axeSweep.shape.ms * 1.35) },
} satisfies AbilityDef
const axeSweep3 = {
  ...axeSweep2,
  onHit: [{ kind: 'slow', factor: 0.55, durationMs: 1200 }],
} satisfies AbilityDef

const pistolLeft2 = { ...BASE.pistolLeft, shape: { ...pistol.shape, pierce: 2 } } satisfies AbilityDef
const pistolRight2 = { ...BASE.pistolRight, shape: { ...pistol.shape, pierce: 2 } } satisfies AbilityDef
const pistolLeft3 = {
  ...pistolLeft2,
  repeat: { everyN: 4, count: 5, spreadDeg: 32 },
} satisfies AbilityDef
const pistolRight3 = {
  ...pistolRight2,
  repeat: { everyN: 4, count: 5, spreadDeg: 32 },
} satisfies AbilityDef

const arcaneBlast2 = {
  ...BASE.arcaneBlast,
  onHit: [
    { kind: 'ground', def: { radius: 1.4, durationMs: 3000, tickMs: 400, damage: 3, color: 0xff7043, fillAlpha: 0.18, lineAlpha: 0.55, enterMs: 200 } },
  ],
} satisfies AbilityDef
const arcaneBlast3 = {
  ...arcaneBlast2,
  repeat: { count: 2, delayMs: 250, ratio: 0.75, reaim: 'random' },
} satisfies AbilityDef

const boomerang2 = { ...BASE.boomerang, repeat: { count: 2, spreadDeg: 360 } } satisfies AbilityDef
const boomerang3 = {
  ...boomerang2,
  shape: { ...BASE.boomerang.shape, radius: BASE.boomerang.shape.radius * 1.4, coinMagnetRadius: 1.6 },
  held: { ...BASE.boomerang.held, size: BASE.boomerang.held.size * 1.4 },
} satisfies AbilityDef

const laserBeam2 = { ...BASE.laserBeam, repeat: { count: 2, spreadDeg: 360 } } satisfies AbilityDef
const laserBeam3 = {
  ...BASE.laserBeam,
  repeat: { count: 8, spreadDeg: 360, delayMs: 60, ratio: 0.6 },
} satisfies AbilityDef

const frostAura2 = { ...BASE.frostAura, damage: 3 } satisfies AbilityDef
const frostAura3 = {
  ...frostAura2,
  shape: { ...BASE.frostAura.shape, pulse: { intervalMs: 5000, onHit: [{ kind: 'slow', factor: 0, durationMs: 700 }] } },
} satisfies AbilityDef

const sparkleBolt2 = {
  ...BASE.sparkleBolt,
  shape: { ...BASE.sparkleBolt.shape, pierce: 1 },
  onHit: [{ kind: 'morph', durationMs: 4000, morphEmoji: '1f411' }],
} satisfies AbilityDef
const sparkleBolt3 = {
  ...sparkleBolt2,
  onHit: [{ kind: 'morph', durationMs: 4000, morphEmoji: '1f411', vulnMul: 1.4 }],
} satisfies AbilityDef

const shadowStrike2 = {
  ...BASE.shadowStrike,
  onHit: [{ kind: 'blast', radius: 1.0, ratio: 0.6, knockback: 3.6 }],
} satisfies AbilityDef
const shadowStrike3 = {
  ...shadowStrike2,
  shape: { ...BASE.shadowStrike.shape, execute: { hpRatio: 0.35, mul: 2 } },
} satisfies AbilityDef

const woodTurret2 = {
  ...BASE.woodTurret,
  shape: { ...BASE.woodTurret.shape, maxAlive: BASE.woodTurret.shape.maxAlive + 1 },
} satisfies AbilityDef
const woodTurret3 = {
  ...woodTurret2,
  shape: { ...woodTurret2.shape, ability: { ...woodTurretShot, repeat: { count: 3, spreadDeg: 17 } } },
} satisfies AbilityDef

const beeSwarm2 = {
  ...BASE.beeSwarm,
  shape: { ...BASE.beeSwarm.shape, count: BASE.beeSwarm.shape.count + 1 },
} satisfies AbilityDef
const beeSwarm3 = {
  ...beeSwarm2,
  onHit: [
    { kind: 'poison', damage: 13, tickMs: 1000, durationMs: 5000 },
    { kind: 'slow', factor: 0.55, durationMs: 1200 },
  ],
} satisfies AbilityDef

const fieldMedkit2 = { ...BASE.fieldMedkit, onHit: [{ kind: 'heal', amount: 14, scope: 'all', ratio: 0.6 }] } satisfies AbilityDef
const fieldMedkit3 = {
  ...fieldMedkit2,
  onHit: [{ kind: 'reviveCut', ms: 2000 }, { kind: 'heal', amount: 14, scope: 'all', ratio: 0.6 }],
} satisfies AbilityDef

const voltArc2 = { ...BASE.voltArc, shape: { ...BASE.voltArc.shape, hops: 4 } } satisfies AbilityDef
const voltArc3 = {
  ...voltArc2,
  onHit: [
    { kind: 'blast', radius: 0.9, ratio: 0.6, knockback: 1.5, ring: { color: 0x40c4ff, fillAlpha: 0.25, lineWidth: 3, lineAlpha: 0.9, durMs: 240 } },
  ],
} satisfies AbilityDef

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
  rainbowRush: BASE.rainbowRush,
  bounceStomp: BASE.bounceStomp,
  trollRoar: BASE.trollRoar,
  shadowVeil: BASE.shadowVeil,
  beeCourt: BASE.beeCourt,
  quickBuild: BASE.quickBuild,
  sheepParty: BASE.sheepParty,
  emPulse: BASE.emPulse,
  jugglerDance: BASE.jugglerDance,
  cowboyStrike: BASE.cowboyStrike,
  mageLecture: BASE.mageLecture,
  robotNuke: BASE.robotNuke,
  snowmanFreeze: BASE.snowmanFreeze,
  medicRally: BASE.medicRally,
} as const
