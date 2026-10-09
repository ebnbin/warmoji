import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const flameSweep = {
  trigger: 'auto',
  cooldownMs: 2000,
  firstDelayMs: 1000,
  aim: 'nearest',
  range: 3,
  damage: 20,
  knockback: 2.5,
  color: 0xff5722,
  fireSfx: 'whoosh',
  windup: { ms: 500, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'sector', radius: 3, arcDeg: 160, ms: 220 },
} satisfies AbilityDef

const hellfire = {
  trigger: 'auto',
  cooldownMs: 7000,
  firstDelayMs: 3000,
  aim: 'nearest',
  range: 10,
  damage: 15,
  fireSfx: 'ignite',
  shape: { kind: 'drop', targets: 4, look: { emoji: '1f525', size: 1.2 }, fromAbove: 4, dropMs: 700, staggerMs: 200 },
  onHit: [{ kind: 'ground', def: patch(1.4, 3000, 0xff5722, undefined, 4, 500) }],
} satisfies AbilityDef

const swordCharge = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 8000,
  firstDelayMs: 5000,
  aim: 'nearest',
  range: 8,
  element: 'physical',
  damage: 28,
  knockback: 5,
  fireSfx: 'charge',
  windup: { ms: 800, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'sprint', distance: 7, ms: 700, radius: 1.5 },
} satisfies AbilityDef

const thunderSweep = { ...flameSweep, color: 0xffd54f, fireSfx: 'zap' } satisfies AbilityDef

const thunderChain = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 9000,
  firstDelayMs: 1500,
  aim: 'nearest',
  range: 6,
  color: 0xffd54f,
  fireSfx: 'zap',
  windup: { ms: 400, lockAt: 'end', telegraph: 'blink' },
  shape: { kind: 'disc', radius: 0.6, at: 'target' },
  onHit: [{ kind: 'tether', ms: 2500, range: 6, onHold: [{ kind: 'stun', durationMs: 1500 }, { kind: 'damage', amount: 26 }], color: 0xffd54f }],
} satisfies AbilityDef

const DEMON_LORD = {
  kind: 'demonLord',
  role: 'boss',
  emoji: '1f47f',
  name: '炎魔',
  element: 'fire',
  desc: '火山深处爬出来的炎魔，一身是火，点不着、不怕岩浆，甲也厚：炎剑一扫大半圈，砍中的着火，挤在一起的一个传一个；往最近的四名队员头上各砸一团地狱火，落处烧三秒；隔一阵挺剑冲锋，这一下是实打实的硬撞。血掉到一半，身上的火熄了，换成一身雷、出手更快：横扫改成雷，砍中的蓄力被打断，电流还跳到身边另一人身上，湿的连成一片；地狱火换成雷链——拴住最近的一人，两秒半内没跑到它六格外就被劈晕 1.5 秒，再挨一记重的；换成雷以后它点得着、也怕岩浆了',
  size: 3.4,
  radius: 1.1,
  span: [0, 6],
  hp: 4200,
  stats: { armor: 6, exertion: 0 },
  speed: 1.2,
  damage: 20,
  xp: 40,
  coins: 40,
  traits: ['anchored', 'wary'],
  drive: { kind: 'chase' },
  abilities: [flameSweep, hellfire, swordCharge],
  phases: [{ below: 0.5, name: '雷霆', element: 'thunder', abilities: [thunderSweep, thunderChain, swordCharge], stats: { mul: { cooldown: 0.85 } } }],
} satisfies EnemyDef

export default DEMON_LORD
