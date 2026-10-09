import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const flameSweep = {
  trigger: 'auto',
  cooldownMs: 2000,
  firstDelayMs: 1000,
  aim: 'nearest',
  range: 3,
  damage: 24,
  knockback: 2.5,
  color: 0xff5722,
  fireSfx: 'whoosh',
  windup: { ms: 500, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'sector', radius: 3, arcDeg: 160, ms: 220 },
  onHit: [{ kind: 'poison', damage: 0, ratio: 0.1, tickMs: 500, durationMs: 3000 }],
} satisfies AbilityDef

const hellfire = {
  trigger: 'auto',
  cooldownMs: 7000,
  firstDelayMs: 3000,
  aim: 'nearest',
  range: 10,
  damage: 18,
  fireSfx: 'ignite',
  shape: { kind: 'drop', targets: 4, look: { emoji: '1f525', size: 1.2 }, fromAbove: 4, dropMs: 700, staggerMs: 200 },
  onHit: [{ kind: 'ground', def: patch(1.4, 3000, 0xff5722, undefined, 4, 500) }],
} satisfies AbilityDef

const flameCharge = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 8000,
  firstDelayMs: 5000,
  aim: 'nearest',
  range: 8,
  damage: 28,
  knockback: 5,
  fireSfx: 'charge',
  windup: { ms: 800, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'sprint', distance: 7, ms: 700, radius: 1.5 },
} satisfies AbilityDef

const darkSweep = { ...flameSweep, color: 0x7e57c2, onHit: [{ kind: 'disarm', durationMs: 800 }] } satisfies AbilityDef

const soulChain = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 9000,
  firstDelayMs: 1500,
  aim: 'nearest',
  range: 6,
  color: 0x7e57c2,
  fireSfx: 'zap',
  windup: { ms: 400, lockAt: 'end', telegraph: 'blink' },
  shape: { kind: 'disc', radius: 0.6, at: 'target' },
  onHit: [{ kind: 'tether', ms: 2500, range: 6, onHold: [{ kind: 'stun', durationMs: 1500 }, { kind: 'damage', amount: 30 }], color: 0x7e57c2 }],
} satisfies AbilityDef

const DEMON_LORD = {
  kind: 'demonLord',
  role: 'boss',
  emoji: '1f47f',
  name: '炎魔',
  element: 'fire',
  desc: '火山深处爬出来的炎魔，不怕岩浆：炎剑一扫大半圈，砍中的身上烧起来；往最近的四名队员头上各砸一团地狱火，落处烧三秒；隔一阵挺剑冲锋。血掉到一半就魔化、出手更快：横扫改成让人致盲，地狱火换成魂链——拴住最近的一人，两秒半内没跑到它六格外就晕倒，再挨一记重击',
  size: 3.4,
  radius: 1.1,
  span: [0, 6],
  hp: 4200,
  stats: { armor: 6, exertion: 0 },
  speed: 1.2,
  damage: 20,
  xp: 40,
  coins: 40,
  traits: ['fireproof', 'anchored', 'wary'],
  drive: { kind: 'chase' },
  abilities: [flameSweep, hellfire, flameCharge],
  phases: [{ below: 0.5, name: '魔化', abilities: [darkSweep, soulChain, flameCharge], stats: { mul: { cooldown: 0.85 } } }],
} satisfies EnemyDef

export default DEMON_LORD
