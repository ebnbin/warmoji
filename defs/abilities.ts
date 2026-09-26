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
  jugglerDance: {
    trigger: 'manual',
    aim: 'self',
    shape: { kind: 'all', of: 'foes' },
    onHit: [{ kind: 'stun', durationMs: 2500 }],
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
  damage: BASE.laserBeam.damage * 0.6,
  repeat: { count: 8, spreadDeg: 360, delayMs: 60 },
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


const RING = (color: number) => ({ color, fillAlpha: 0.3, lineWidth: 4, lineAlpha: 0.9, durMs: 260 })

const shot = (emoji: string, speed: number, rotationOffsetDeg = 0) => ({ emoji, size: 0.48, radius: 0.16, speed, rotationOffsetDeg })

// 🐸 青蛙：舌头把远处的敌人拽到身边
const frogTongue = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'nearest',
  fireSfx: 'whoosh',
  range: 4.8,
  damage: 20,
  color: 0xf48fb1,
  shape: { kind: 'segment', reach: 4.5, radius: 0.35, ms: 200, beam: true },
  onHit: [{ kind: 'pull', speed: 14, gap: 0.3 }],
} satisfies AbilityDef
const frogTongue2 = { ...frogTongue, onHit: [{ kind: 'pull', speed: 14, gap: 0.3 }, { kind: 'root', durationMs: 1000 }] } satisfies AbilityDef
const frogTongue3 = { ...frogTongue, onHit: [{ kind: 'pull', speed: 14, gap: 0.3, heavy: 'self' }, { kind: 'root', durationMs: 1000 }] } satisfies AbilityDef
const frogLily = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  shape: { kind: 'world' },
  onHit: [{ kind: 'portal', distance: 6, radius: 0.9, durationMs: 6000, cdMs: 1200, color: 0x66bb6a }],
} satisfies AbilityDef

// 🦊 狐仙：迷惑，让敌人不由自主地走向你
const foxCharm = {
  trigger: 'auto',
  cooldownMs: 1300,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 18,
  knockback: 1,
  shape: { kind: 'bolt', projectile: shot('1f496', 10), lifeMs: 1600 },
  onHit: [{ kind: 'charm', durationMs: 1300 }],
} satisfies AbilityDef
const foxKiss = [
  { kind: 'if', when: { kind: 'marked', mark: 'charm' }, then: [{ kind: 'stun', durationMs: 1200 }, { kind: 'damage', amount: 0, ratio: 1 }], else: [{ kind: 'charm', durationMs: 1300 }] },
] as const
const foxCharm2 = { ...foxCharm, onHit: foxKiss } satisfies AbilityDef
const foxCharm3 = {
  ...foxCharm,
  onHit: [...foxKiss, { kind: 'deathMark', ms: 1500, then: [{ kind: 'area', radius: 2.2, then: [{ kind: 'charm', durationMs: 1000 }] }] }],
} satisfies AbilityDef
const foxClones = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'whoosh',
  shape: { kind: 'world' },
  onSelf: [
    { kind: 'clone', count: 2, lifeMs: 6000, hpRatio: 0.4, dmgRatio: 0.5, onDeath: [{ kind: 'area', radius: 2.5, then: [{ kind: 'charm', durationMs: 1500 }] }] },
    { kind: 'hide', durationMs: 1500 },
  ],
} satisfies AbilityDef

// 🤺 剑客：第三下挑飞，只对空中的敌人追斩
const fencerThrust = {
  trigger: 'auto',
  cooldownMs: 650,
  aim: 'nearest',
  fireSfx: 'whoosh',
  range: 2.6,
  damage: 20,
  knockback: 3,
  shape: { kind: 'segment', reach: 2.4, radius: 0.45, ms: 160, lungeDist: 0.5 },
} satisfies AbilityDef
const fencerGale = {
  ...fencerThrust,
  range: 5,
  damage: 18,
  knockback: 0,
  color: 0xb3e5fc,
  shape: { kind: 'segment', reach: 5, radius: 0.6, ms: 220, beam: true },
  onHit: [{ kind: 'knockup', durationMs: 750, height: 1.3 }],
} satisfies AbilityDef
const galeWall = { kind: 'barrier', shape: 'wall', length: 3, offset: 1.5, durationMs: 2000, bodies: 'none', shots: true, color: 0xb3e5fc } as const
const fencerCombo = { ...fencerThrust, cycle: [fencerThrust, fencerGale] } satisfies AbilityDef
const fencerCombo2 = { ...fencerThrust, cycle: [fencerThrust, { ...fencerGale, onSelf: [galeWall] }] } satisfies AbilityDef
const fencerCombo3 = {
  ...fencerThrust,
  cycle: [fencerThrust, { ...fencerGale, onSelf: [galeWall], onHit: [{ kind: 'knockup', durationMs: 750, height: 1.3, onLand: [{ kind: 'stun', durationMs: 700 }] }] }],
} satisfies AbilityDef
const fencerLastBreath = {
  trigger: 'manual',
  aim: 'nearest',
  range: 8,
  requires: { kind: 'airborne' },
  fireSfx: 'whoosh',
  damage: 55,
  shape: { kind: 'blink', behindDist: 0.5, strikeMs: 450 },
  onHit: [{ kind: 'knockup', durationMs: 700, height: 1.6 }],
} satisfies AbilityDef

// 🦥 树懒：时间差——延时炸弹与倒带
const slothFuse = { kind: 'fuse', ms: 2500, then: [{ kind: 'blast', radius: 1.6, ratio: 4, knockback: 6, ring: RING(0xffb74d) }] } as const
const slothBomb = {
  trigger: 'auto',
  cooldownMs: 1700,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 8,
  knockback: 1,
  shape: { kind: 'bolt', projectile: shot('23f0', 8), lifeMs: 1800 },
  onHit: [slothFuse],
} satisfies AbilityDef
const slothBomb2 = {
  ...slothBomb,
  onHit: [{ kind: 'if', when: { kind: 'marked', mark: 'fuse' }, then: [{ kind: 'detonate', mark: 'fuse' }], else: [slothFuse] }],
} satisfies AbilityDef
const slothBomb3 = {
  ...slothBomb,
  onHit: [{ kind: 'if', when: { kind: 'marked', mark: 'fuse' }, then: [{ kind: 'detonate', mark: 'fuse' }], else: [{ ...slothFuse, jump: true }] }],
} satisfies AbilityDef
const slothRewind = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'whoosh',
  shape: { kind: 'world' },
  onSelf: [{ kind: 'rewind', ms: 3000 }, { kind: 'cleanse' }],
} satisfies AbilityDef

// 🐈‍⬛ 黑猫：影子，同时在两个地方出手
const catPaw = {
  trigger: 'auto',
  cooldownMs: 750,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 14,
  knockback: 1.5,
  mirror: true,
  shape: { kind: 'bolt', projectile: shot('1f43e', 12), lifeMs: 1500 },
} satisfies AbilityDef
const catBind = { kind: 'stack', max: 2, durationMs: 800, then: [{ kind: 'root', durationMs: 1200 }] } as const
const catPaw2 = { ...catPaw, onHit: [catBind] } satisfies AbilityDef
const catPaw3 = {
  ...catPaw,
  onHit: [catBind],
  onKill: [{ kind: 'shadow', lifeMs: 3000, max: 3, dash: 0, taunt: { radius: 2.5, ms: 1500 } }],
} satisfies AbilityDef
const catShade = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  shape: { kind: 'world' },
  onHit: [{ kind: 'shadow', lifeMs: 5000, max: 2, dash: 4 }],
  recast: { windowMs: 4000, ability: { trigger: 'manual', aim: 'self', fireSfx: 'whoosh', shape: { kind: 'world' }, onHit: [{ kind: 'shadowSwap' }] } },
} satisfies AbilityDef

// 🦍 怒猩：怒气越攒越凶，满了重锤；濒死不倒
const gorillaSlam = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  fireSfx: 'whoosh',
  range: 2.2,
  damage: 28,
  knockback: 5,
  shape: { kind: 'sector', radius: 2.1, arcDeg: 140, ms: 240 },
  boost: { at: 100, spend: 100, damageMul: 2, onHit: [{ kind: 'knockup', durationMs: 600, height: 1.2 }] },
} satisfies AbilityDef
const gorillaSlam2 = {
  ...gorillaSlam,
  boost: { at: 100, spend: 100, damageMul: 2, onHit: [{ kind: 'knockup', durationMs: 600, height: 1.2 }, { kind: 'shove', distance: 2, ms: 220, onWall: [{ kind: 'stun', durationMs: 1000 }] }] },
} satisfies AbilityDef
const gorillaSlam3 = { ...gorillaSlam2, onKill: [{ kind: 'gain', amount: 35 }] } satisfies AbilityDef
const gorillaRage = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'over',
  shape: { kind: 'world' },
  onSelf: [{ kind: 'undying', durationMs: 5000 }, { kind: 'gain', amount: 100 }, { kind: 'buff', speedMul: 1.25, durationMs: 5000 }],
} satisfies AbilityDef

// 🕵 侦探：同一目标攒够三条证据才结案
const caseClosed = [{ kind: 'stun', durationMs: 1200 }, { kind: 'reveal', durationMs: 5000 }, { kind: 'damage', amount: 0, ratio: 2.5 }] as const
const detectiveLens = {
  trigger: 'auto',
  cooldownMs: 850,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 12,
  knockback: 1,
  shape: { kind: 'bolt', projectile: shot('1f50d', 11), lifeMs: 1800 },
  onHit: [{ kind: 'stack', max: 3, durationMs: 4000, then: caseClosed }],
} satisfies AbilityDef
const detectiveLens2 = {
  ...detectiveLens,
  onHit: [{ kind: 'stack', max: 3, durationMs: 4000, then: [...caseClosed, { kind: 'deathMark', ms: 3000, then: [{ kind: 'refresh', what: 'skill', ms: 3000 }] }] }],
} satisfies AbilityDef
const detectiveLens3 = {
  ...detectiveLens,
  onHit: [
    {
      kind: 'stack',
      max: 3,
      durationMs: 4000,
      then: [...caseClosed, { kind: 'deathMark', ms: 3000, then: [{ kind: 'refresh', what: 'skill', ms: 3000 }] }, { kind: 'area', radius: 2.2, then: [{ kind: 'stun', durationMs: 800 }] }],
    },
  ],
} satisfies AbilityDef
const detectiveWarrant = {
  trigger: 'manual',
  aim: 'strongest',
  range: 9,
  fireSfx: 'zap',
  color: 0xffd54f,
  shape: { kind: 'disc', radius: 0.6, at: 'target' },
  onHit: [{ kind: 'deathMark', ms: 6000, then: [{ kind: 'refresh', what: 'skill', who: 'team' }] }, { kind: 'reveal', durationMs: 6000 }, { kind: 'guard', mul: 1.3, durationMs: 6000 }],
} satisfies AbilityDef

// 🦅 猎鹰：抓起敌人砸向另一个敌人
const eagleSlam = [{ kind: 'damage', amount: 0, ratio: 1 }, { kind: 'blast', radius: 1.4, ratio: 1.2, knockback: 6, ring: RING(0xa1887f) }] as const
const eagleGrab = {
  trigger: 'auto',
  cooldownMs: 1700,
  aim: 'nearest',
  fireSfx: 'whoosh',
  range: 2.2,
  damage: 16,
  shape: { kind: 'segment', reach: 1.9, radius: 0.5, ms: 200, lungeDist: 1.2 },
  onHit: [{ kind: 'throw', to: 'foe', distance: 5, ms: 520, height: 1.8, onLand: eagleSlam }],
} satisfies AbilityDef
const eagleGrab2 = {
  ...eagleGrab,
  onHit: [{ kind: 'throw', to: 'foe', distance: 5, ms: 520, height: 1.8, onLand: [...eagleSlam, { kind: 'stun', durationMs: 1000 }] }],
} satisfies AbilityDef
const eagleGrab3 = {
  ...eagleGrab,
  onHit: [
    { kind: 'throw', to: 'foe', distance: 5, ms: 520, height: 1.8, onLand: [...eagleSlam, { kind: 'stun', durationMs: 1000 }, { kind: 'area', radius: 1.6, then: [{ kind: 'knockup', durationMs: 500, height: 1 }] }] },
  ],
} satisfies AbilityDef
const eagleDive = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  damage: 40,
  knockback: 8,
  color: 0x8d6e63,
  shape: { kind: 'leap', distance: 3, ms: 480, height: 2.2, radius: 1.6 },
  hold: { maxMs: 1500, reachMul: 2.4, damageMul: 2 },
  onHit: [{ kind: 'knockup', durationMs: 500, height: 1 }],
} satisfies AbilityDef

// 🐻 拳王熊：左右开弓，把挨的打存起来还回去
const bearLeft = {
  trigger: 'auto',
  cooldownMs: 520,
  aim: 'nearest',
  fireSfx: 'whoosh',
  range: 1.9,
  damage: 16,
  knockback: 2,
  shape: { kind: 'sector', radius: 1.7, arcDeg: 100, ms: 160 },
} satisfies AbilityDef
const bearRight = { ...bearLeft, damage: 20, knockback: 7 } satisfies AbilityDef
const bearEmpower = { kind: 'empower', hits: 1, then: [{ kind: 'stun', durationMs: 700 }] } as const
const bearHooks = { ...bearLeft, cycle: [bearRight] } satisfies AbilityDef
const bearHooks2 = { ...bearLeft, cycle: [{ ...bearRight, onSelf: [bearEmpower] }] } satisfies AbilityDef
const bearHooks3 = { ...bearLeft, onHit: [{ kind: 'pull', speed: 10, gap: 0.2 }], cycle: [{ ...bearRight, onSelf: [bearEmpower] }] } satisfies AbilityDef
const bearGrit = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'over',
  shape: { kind: 'world' },
  onSelf: [
    { kind: 'store', ms: 2500, ratio: 1.6, then: [{ kind: 'blast', radius: 3, ratio: 1, knockback: 10, ring: RING(0xff7043) }] },
    { kind: 'guard', mul: 0.5, durationMs: 2500 },
  ],
} satisfies AbilityDef

// 🧛 伯爵：以血为代价
const vampBlade = {
  trigger: 'auto',
  cooldownMs: 700,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 20,
  knockback: 1.5,
  hpCost: 3,
  shape: { kind: 'bolt', projectile: shot('1fa78', 12), lifeMs: 1600 },
  onHit: [{ kind: 'caster', then: [{ kind: 'heal', amount: 5 }] }],
} satisfies AbilityDef
const vampMark = { kind: 'if', when: { kind: 'hpBelow', ratio: 0.35 }, then: [{ kind: 'deathMark', ms: 2000, then: [{ kind: 'raise', lifeMs: 8000, hpRatio: 0.4 }] }] } as const
const vampBlade2 = { ...vampBlade, onHit: [{ kind: 'caster', then: [{ kind: 'heal', amount: 5 }] }, vampMark] } satisfies AbilityDef
const vampBlade3 = {
  ...vampBlade,
  onHit: [{ kind: 'caster', then: [{ kind: 'heal', amount: 5 }, { kind: 'if', when: { kind: 'hpBelow', ratio: 0.5 }, then: [{ kind: 'heal', amount: 5 }] }] }, vampMark],
} satisfies AbilityDef
const vampRaise = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'boom',
  color: 0xb71c1c,
  damage: 25,
  hpCost: 20,
  shape: { kind: 'disc', radius: 4.5, at: 'self' },
  onHit: [{ kind: 'deathMark', ms: 5000, then: [{ kind: 'raise', lifeMs: 12000, hpRatio: 0.6 }] }],
} satisfies AbilityDef

// 🧞 灯神：火从神灯里出来，灯在哪火就从哪来
const genieFlame = {
  trigger: 'auto',
  cooldownMs: 900,
  aim: 'nearest',
  fireSfx: 'shoot',
  range: 7,
  damage: 16,
  knockback: 2,
  anchor: { emoji: '1fa94', size: 0.7, mode: 'orbit', distance: 1.8 },
  shape: { kind: 'bolt', projectile: shot('1f525', 10), lifeMs: 1800 },
} satisfies AbilityDef
const genieFlame2 = { ...genieFlame, anchor: { emoji: '1fa94', size: 0.7, mode: 'trail', distance: 0 } } satisfies AbilityDef
const genieFlame3 = { ...genieFlame, anchor: { emoji: '1fa94', size: 0.7, mode: 'ally', distance: 1 } } satisfies AbilityDef
const genieWish = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  color: 0xb388ff,
  shape: { kind: 'all', of: 'allies' },
  onHit: [{ kind: 'spellShield', count: 3, durationMs: 8000 }],
} satisfies AbilityDef

// 🦜 鹦鹉：学舌，借敌人的招来用
const parrotMimic = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 14,
  knockback: 1,
  shape: { kind: 'bolt', projectile: shot('1f3b5', 11), lifeMs: 1800 },
  onHit: [{ kind: 'steal', ms: 6000, cooldownMs: 1400 }],
} satisfies AbilityDef
const parrotMimic2 = { ...parrotMimic, onHit: [{ kind: 'steal', ms: 6000, cooldownMs: 1400 }, { kind: 'silence', durationMs: 2000 }] } satisfies AbilityDef
const parrotMimic3 = { ...parrotMimic2, repeat: { everyN: 3, count: 2, delayMs: 250, reaim: 'nearest' } } satisfies AbilityDef
const parrotChatter = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'zap',
  color: 0x81c784,
  damage: 20,
  shape: { kind: 'disc', radius: 4, at: 'self' },
  onHit: [{ kind: 'silence', durationMs: 3500 }, { kind: 'interrupt' }],
} satisfies AbilityDef

// 🐼 熊猫：能量打连环掌，太极卸力反制
const pandaPalm = {
  trigger: 'auto',
  cooldownMs: 380,
  aim: 'nearest',
  fireSfx: 'whoosh',
  range: 1.9,
  damage: 16,
  knockback: 2,
  cost: 10,
  shape: { kind: 'segment', reach: 1.7, radius: 0.5, ms: 140, lungeDist: 0.4 },
} satisfies AbilityDef
const pandaPalm2 = { ...pandaPalm, onHit: [{ kind: 'shove', distance: 1.2, ms: 160 }] } satisfies AbilityDef
const pandaPalm3 = { ...pandaPalm, onHit: [{ kind: 'shove', distance: 1.2, ms: 160 }, { kind: 'interrupt' }] } satisfies AbilityDef
const pandaTaiji = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  shape: { kind: 'world' },
  onSelf: [{ kind: 'parry', durationMs: 1600, then: [{ kind: 'stun', durationMs: 1200 }, { kind: 'damage', amount: 30 }] }, { kind: 'gain', amount: 50 }],
} satisfies AbilityDef

// 🐿 松鼠：弹匣打空换弹，翻滚攒着次数用
const chipAcorn = {
  trigger: 'auto',
  cooldownMs: 180,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 11,
  knockback: 1,
  shape: { kind: 'bolt', projectile: shot('1f330', 13), lifeMs: 1400 },
  ammo: { count: 6, reloadMs: 1700 },
} satisfies AbilityDef
const chipAcorn2 = { ...chipAcorn, onKill: [{ kind: 'refresh', what: 'skill' }] } satisfies AbilityDef
const chipAcorn3 = {
  ...chipAcorn2,
  shape: { ...chipAcorn.shape, pierce: 1 },
  ammo: { count: 6, reloadMs: 1700, last: [{ kind: 'stun', durationMs: 600 }] },
} satisfies AbilityDef
const chipRoll = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  charges: 3,
  shape: { kind: 'sprint', distance: 3, ms: 200 },
  onSelf: [{ kind: 'invuln', ms: 250 }],
} satisfies AbilityDef

// 💂 卫兵：把敌人按在墙上
const guardShield = { emoji: '1f6e1', size: 0.7, restOffset: 0.45, rotationOffsetDeg: 0 } as const
const guardStun = [{ kind: 'stun', durationMs: 1400 }, { kind: 'damage', amount: 0, ratio: 0.8 }] as const
const guardBash = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  fireSfx: 'whoosh',
  range: 1.9,
  damage: 24,
  held: guardShield,
  shape: { kind: 'segment', reach: 1.6, radius: 0.6, ms: 180, lungeDist: 0.4 },
  onHit: [{ kind: 'shove', distance: 2.4, ms: 260, onWall: guardStun }],
} satisfies AbilityDef
const guardBash2 = { ...guardBash, onHit: [{ kind: 'shove', distance: 2.4, ms: 260, onWall: guardStun }, { kind: 'grounded', durationMs: 2500 }] } satisfies AbilityDef
const guardBash3 = {
  ...guardBash,
  onHit: [
    { kind: 'shove', distance: 2.4, ms: 260, onWall: [...guardStun, { kind: 'barrier', shape: 'ring', length: 1.3, durationMs: 2000, bodies: 'all', shots: false, color: 0x8d6e63 }] },
    { kind: 'grounded', durationMs: 2500 },
  ],
} satisfies AbilityDef
const guardWall = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'boom',
  shape: { kind: 'world' },
  onHit: [{ kind: 'barrier', shape: 'wall', length: 6, offset: 2.5, durationMs: 5000, bodies: 'foes', shots: true, color: 0x8d6e63 }],
} satisfies AbilityDef

// 🦚 孔雀：羽毛射出去落在地上，再一齐收回来
const feather = {
  trigger: 'auto',
  cooldownMs: 280,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 9,
  knockback: 0.5,
  shape: { kind: 'bolt', projectile: { emoji: '1fab6', size: 0.5, radius: 0.16, speed: 14, rotationOffsetDeg: 45, linger: 5000 }, lifeMs: 420, pierce: 1 },
} satisfies AbilityDef
const featherRecall = { trigger: 'auto', cooldownMs: 280, aim: 'self', fireSfx: 'whoosh', shape: { kind: 'world' }, onHit: [{ kind: 'recall', speed: 20 }] } satisfies AbilityDef
const featherPin = { kind: 'stack', max: 3, durationMs: 1500, then: [{ kind: 'root', durationMs: 1500 }] } as const
const feather2 = { ...feather, onHit: [featherPin] } satisfies AbilityDef
const feather3 = { ...feather, onHit: [featherPin, { kind: 'pull', speed: 8, gap: 1 }] } satisfies AbilityDef
const peacockPlumes = { ...feather, cycle: [feather, feather, feather, featherRecall] } satisfies AbilityDef
const peacockPlumes2 = { ...feather2, cycle: [feather2, feather2, feather2, featherRecall] } satisfies AbilityDef
const peacockPlumes3 = { ...feather3, cycle: [feather3, feather3, feather3, featherRecall] } satisfies AbilityDef
const peacockFan = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  shape: { kind: 'world' },
  onHit: [{ kind: 'barrier', shape: 'wall', length: 4.5, offset: 1.6, durationMs: 3500, bodies: 'none', shots: true, color: 0x26a69a }],
} satisfies AbilityDef

// 🐨 考拉：让敌人睡着，让队友抱住你
const koalaLeaf = {
  trigger: 'auto',
  cooldownMs: 1200,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 14,
  shape: { kind: 'bolt', projectile: shot('1f343', 9), lifeMs: 2000 },
  onHit: [{ kind: 'sleep', durationMs: 3000, wakeMul: 2 }],
} satisfies AbilityDef
const drowsy = { radius: 1.5, durationMs: 2500, damage: 0, color: 0xa5d6a7, fillAlpha: 0.22, lineAlpha: 0.55, enterMs: 200 } as const
const koalaLeaf2 = {
  ...koalaLeaf,
  onHit: [{ kind: 'sleep', durationMs: 3000, wakeMul: 2 }, { kind: 'ground', def: { ...drowsy, tickMs: 600, effects: [{ kind: 'sleep', durationMs: 1200, wakeMul: 1.5 }] } }],
} satisfies AbilityDef
const koalaLeaf3 = {
  ...koalaLeaf,
  onHit: [
    { kind: 'sleep', durationMs: 3000, wakeMul: 2 },
    { kind: 'ground', def: { ...drowsy, durationMs: 3000, tickMs: 0, dwell: { ms: 1000, effects: [{ kind: 'sleep', durationMs: 2500, wakeMul: 2 }] }, onExpire: [{ kind: 'slow', factor: 0.5, durationMs: 1500 }] } },
  ],
} satisfies AbilityDef
const koalaHug = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  shape: { kind: 'all', of: 'allies' },
  onHit: [{ kind: 'attach', ms: 4000 }],
  onSelf: [{ kind: 'unstoppable', durationMs: 4000 }, { kind: 'guard', mul: 0.6, durationMs: 4000 }],
} satisfies AbilityDef

// 🐙 章鱼：墨汁里谁也看不清
const inkPuddle = { kind: 'ground', def: { radius: 1.4, durationMs: 3000, tickMs: 500, damage: 0, color: 0x37474f, fillAlpha: 0.3, lineAlpha: 0.5, enterMs: 200, effects: [{ kind: 'disarm', durationMs: 700 }] } } as const
const octoInk = {
  trigger: 'auto',
  cooldownMs: 1000,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 18,
  knockback: 1,
  shape: { kind: 'bolt', projectile: shot('26ab', 10), lifeMs: 1800 },
  onHit: [{ kind: 'disarm', durationMs: 1600 }],
} satisfies AbilityDef
const octoInk2 = { ...octoInk, onHit: [{ kind: 'disarm', durationMs: 1600 }, inkPuddle] } satisfies AbilityDef
const octoInk3 = {
  ...octoInk,
  onHit: [{ kind: 'if', when: { kind: 'marked', mark: 'disarm' }, then: [{ kind: 'root', durationMs: 1000 }], else: [{ kind: 'disarm', durationMs: 1600 }] }, inkPuddle],
} satisfies AbilityDef
const octoMist = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'whoosh',
  color: 0x263238,
  shape: { kind: 'zone', radius: 3.5, durationMs: 5000, tickMs: 500, mist: true, visual: { color: 0x263238, fillAlpha: 0.35, lineAlpha: 0.7, lineWidth: 3, enterMs: 300 } },
  onHit: [{ kind: 'disarm', durationMs: 700 }],
} satisfies AbilityDef

// 🐧 企鹅：冰面打滑，站久了会冻住
const icePatch = { radius: 1.7, durationMs: 4000, tickMs: 0, damage: 0, color: 0xb3e5fc, fillAlpha: 0.3, lineAlpha: 0.6, enterMs: 150, traction: 0.12 } as const
const penguinIce = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 18,
  knockback: 3,
  shape: { kind: 'bolt', projectile: shot('1f9ca', 10), lifeMs: 1800 },
  onHit: [{ kind: 'ground', def: icePatch }],
} satisfies AbilityDef
const penguinIce2 = { ...penguinIce, onHit: [{ kind: 'ground', def: { ...icePatch, dwell: { ms: 1500, effects: [{ kind: 'stun', durationMs: 1500 }] } } }] } satisfies AbilityDef
const penguinIce3 = { ...penguinIce, onHit: [{ kind: 'ground', def: { ...icePatch, pull: 1.2, dwell: { ms: 1500, effects: [{ kind: 'stun', durationMs: 1500 }] } } }] } satisfies AbilityDef
const penguinSlide = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  damage: 24,
  knockback: 8,
  color: 0x81d4fa,
  shape: { kind: 'sprint', distance: 6, ms: 600, radius: 0.8 },
  onSelf: [{ kind: 'cleanse' }, { kind: 'unstoppable', durationMs: 700 }],
} satisfies AbilityDef

// 🐛 毛毛虫：吃够了就羽化
const caterSilk = {
  trigger: 'auto',
  cooldownMs: 1100,
  aim: 'nearest',
  fireSfx: 'shoot',
  damage: 11,
  knockback: 0.5,
  shape: { kind: 'bolt', projectile: shot('1f9f5', 10), lifeMs: 1800 },
  onHit: [{ kind: 'slow', factor: 0.6, durationMs: 1500 }],
} satisfies AbilityDef
const silkBind = { kind: 'stack', max: 2, durationMs: 3000, then: [{ kind: 'root', durationMs: 1500 }] } as const
const caterSilk2 = { ...caterSilk, onHit: [{ kind: 'slow', factor: 0.6, durationMs: 1500 }, silkBind] } satisfies AbilityDef
const caterSilk3 = { ...caterSilk2, onKill: [{ kind: 'grow', mul: 1.04, max: 1.35 }] } satisfies AbilityDef
const caterCocoon = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'upgrade',
  damage: 30,
  shape: { kind: 'world' },
  onSelf: [
    { kind: 'stasis', durationMs: 2500 },
    { kind: 'healRatio', ratio: 0.35 },
    { kind: 'fuse', ms: 2500, then: [{ kind: 'blast', radius: 2.6, ratio: 1.5, knockback: 12, ring: RING(0xc5e1a5) }] },
  ],
} satisfies AbilityDef

// 🐲 小龙：喷火攒热量，过热就得歇；化成巨龙
const dragonBreath = {
  trigger: 'auto',
  cooldownMs: 300,
  aim: 'nearest',
  fireSfx: 'whoosh',
  range: 2.8,
  damage: 9,
  knockback: 1,
  gain: 11,
  color: 0xff7043,
  shape: { kind: 'segment', reach: 2.8, radius: 0.5, ms: 180, beam: true },
} satisfies AbilityDef
const burn = { kind: 'ground', def: { radius: 1.1, durationMs: 2000, tickMs: 400, damage: 5, color: 0xff7043, fillAlpha: 0.22, lineAlpha: 0.5, enterMs: 150 } } as const
const dragonBreath2 = { ...dragonBreath, boost: { at: 70, spend: 0, damageMul: 1.6, onHit: [burn] } } satisfies AbilityDef
const dragonBreath3 = { ...dragonBreath2, onKill: [{ kind: 'gain', amount: -40 }] } satisfies AbilityDef
const dragonForm = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'boom',
  shape: { kind: 'world' },
  onSelf: [{ kind: 'form', to: 0, ms: 8000 }, { kind: 'gain', amount: -100 }],
} satisfies AbilityDef

// 🤡 小丑：满地惊喜盒，一瓶药让敌人自相残杀
const surpriseBox = { radius: 1, durationMs: 15000, tickMs: 0, damage: 22, color: 0xff80ab, fillAlpha: 0.2, lineAlpha: 0.7, enterMs: 200, trap: true } as const
const clownBox = {
  trigger: 'auto',
  cooldownMs: 2600,
  aim: 'self',
  fireSfx: 'recruit',
  shape: { kind: 'world' },
  onHit: [{ kind: 'ground', def: { ...surpriseBox, effects: [{ kind: 'fear', durationMs: 1600 }] } }],
} satisfies AbilityDef
const clownBox2 = { ...clownBox, onHit: [{ kind: 'ground', def: { ...surpriseBox, effects: [{ kind: 'fear', durationMs: 1600 }, { kind: 'knockup', durationMs: 600, height: 1.2 }] } }] } satisfies AbilityDef
const clownBox3 = {
  ...clownBox,
  onHit: [
    {
      kind: 'ground',
      def: {
        ...surpriseBox,
        effects: [
          { kind: 'fear', durationMs: 1600 },
          { kind: 'knockup', durationMs: 600, height: 1.2 },
          { kind: 'ground', def: { radius: 1.8, durationMs: 2500, tickMs: 500, damage: 0, color: 0xce93d8, fillAlpha: 0.22, lineAlpha: 0.5, enterMs: 200, effects: [{ kind: 'berserk', durationMs: 700 }] } },
        ],
      },
    },
  ],
} satisfies AbilityDef
const clownPotion = {
  trigger: 'manual',
  aim: 'nearest',
  range: 7,
  fireSfx: 'boom',
  color: 0xce93d8,
  shape: { kind: 'disc', radius: 2.6, at: 'target' },
  onHit: [{ kind: 'berserk', durationMs: 3500 }],
} satisfies AbilityDef

// 改写的主动技能
const mageGate = {
  trigger: 'manual',
  aim: 'stick',
  fireSfx: 'whoosh',
  shape: { kind: 'world' },
  onHit: [{ kind: 'warp', distance: 6, allies: true }, { kind: 'area', radius: 2.5, then: [{ kind: 'slow', factor: 0.4, durationMs: 1500 }] }],
} satisfies AbilityDef
const jellyNet = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'zap',
  color: 0x40c4ff,
  damage: 10,
  shape: { kind: 'disc', radius: 5, at: 'self' },
  onHit: [
    { kind: 'tether', ms: 2000, range: 6.5, onHold: [{ kind: 'stun', durationMs: 1500 }, { kind: 'damage', amount: 30 }], onBreak: [{ kind: 'slow', factor: 0.5, durationMs: 1500 }], color: 0x40c4ff },
  ],
} satisfies AbilityDef
const robotMirror = {
  trigger: 'manual',
  aim: 'self',
  fireSfx: 'zap',
  shape: { kind: 'world' },
  onHit: [{ kind: 'barrier', shape: 'ring', length: 2.4, durationMs: 5000, bodies: 'none', shots: true, reflect: true, follow: true, color: 0x80deea }],
} satisfies AbilityDef
const beeHoney = {
  trigger: 'manual',
  aim: 'nearest',
  range: 7,
  fireSfx: 'recruit',
  color: 0xffca28,
  shape: { kind: 'disc', radius: 3, at: 'target' },
  onHit: [
    {
      kind: 'ground',
      def: {
        radius: 3,
        durationMs: 3000,
        tickMs: 500,
        damage: 4,
        color: 0xffca28,
        fillAlpha: 0.25,
        lineAlpha: 0.7,
        enterMs: 250,
        effects: [{ kind: 'slow', factor: 0.55, durationMs: 600 }],
        onExpire: [{ kind: 'root', durationMs: 2200 }],
      },
    },
  ],
} satisfies AbilityDef
const cowboyLasso = {
  trigger: 'manual',
  aim: 'nearest',
  range: 6.5,
  fireSfx: 'whoosh',
  damage: 20,
  color: 0xa1887f,
  shape: { kind: 'segment', reach: 6.5, radius: 0.45, ms: 220, beam: true },
  onHit: [{ kind: 'drag', ms: 2500 }],
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
  quickBuild: BASE.quickBuild,
  sheepParty: BASE.sheepParty,
  jugglerDance: BASE.jugglerDance,
  snowmanFreeze: BASE.snowmanFreeze,
  medicRally: BASE.medicRally,
  frogTongue,
  frogTongue2,
  frogTongue3,
  frogLily,
  foxCharm,
  foxCharm2,
  foxCharm3,
  foxClones,
  fencerCombo,
  fencerCombo2,
  fencerCombo3,
  fencerLastBreath,
  slothBomb,
  slothBomb2,
  slothBomb3,
  slothRewind,
  catPaw,
  catPaw2,
  catPaw3,
  catShade,
  gorillaSlam,
  gorillaSlam2,
  gorillaSlam3,
  gorillaRage,
  detectiveLens,
  detectiveLens2,
  detectiveLens3,
  detectiveWarrant,
  eagleGrab,
  eagleGrab2,
  eagleGrab3,
  eagleDive,
  bearHooks,
  bearHooks2,
  bearHooks3,
  bearGrit,
  vampBlade,
  vampBlade2,
  vampBlade3,
  vampRaise,
  genieFlame,
  genieFlame2,
  genieFlame3,
  genieWish,
  parrotMimic,
  parrotMimic2,
  parrotMimic3,
  parrotChatter,
  pandaPalm,
  pandaPalm2,
  pandaPalm3,
  pandaTaiji,
  chipAcorn,
  chipAcorn2,
  chipAcorn3,
  chipRoll,
  guardBash,
  guardBash2,
  guardBash3,
  guardWall,
  peacockPlumes,
  peacockPlumes2,
  peacockPlumes3,
  peacockFan,
  koalaLeaf,
  koalaLeaf2,
  koalaLeaf3,
  koalaHug,
  octoInk,
  octoInk2,
  octoInk3,
  octoMist,
  penguinIce,
  penguinIce2,
  penguinIce3,
  penguinSlide,
  caterSilk,
  caterSilk2,
  caterSilk3,
  caterCocoon,
  dragonBreath,
  dragonBreath2,
  dragonBreath3,
  dragonForm,
  clownBox,
  clownBox2,
  clownBox3,
  clownPotion,
  mageGate,
  jellyNet,
  robotMirror,
  beeHoney,
  cowboyLasso,
} as const
