import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { EnemyDef } from '../../../../src/types/enemies'
import { patch } from '../../../kit.ts'

const radiation = {
  trigger: 'auto',
  cooldownMs: 0,
  firstDelayMs: 0,
  aim: 'self',
  damage: 6,
  shape: { kind: 'zone', radius: 4, durationMs: 0, tickMs: 500, follow: true, visual: { color: 0xc6ff00, fillAlpha: 0.1, lineAlpha: 0.5, lineWidth: 2, enterMs: 300 } },
} satisfies AbilityDef

const arc = {
  trigger: 'auto',
  cooldownMs: 2400,
  firstDelayMs: 1500,
  aim: 'nearest',
  range: 7,
  damage: 20,
  fireSfx: 'zap',
  color: 0xffd54f,
  shape: { kind: 'chain', hops: 4, hopRange: 3, decay: 0.8 },
} satisfies AbilityDef

const overload = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 10000,
  firstDelayMs: 5000,
  aim: 'self',
  damage: 40,
  knockback: 4,
  fireSfx: 'boom',
  color: 0xffeb3b,
  when: { kind: 'foesNear', who: 'self', radius: 5, atLeast: 1 },
  windup: { ms: 1200, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'disc', radius: 5, at: 'self' },
} satisfies AbilityDef

const meltdown = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 7000,
  firstDelayMs: 2000,
  aim: 'nearest',
  range: 10,
  damage: 18,
  fireSfx: 'erupt',
  shape: { kind: 'drop', targets: 5, look: { emoji: '2604', size: 1.1 }, fromAbove: 4, dropMs: 700, staggerMs: 150 },
  onHit: [{ kind: 'ground', def: patch(1.6, 4000, 0xff7043, undefined, 8, 500) }],
} satisfies AbilityDef

const REACTOR = {
  kind: 'reactor',
  role: 'boss',
  emoji: '2622',
  name: '失控核心',
  element: 'thunder',
  desc: '失控的反应堆核心，挪得很慢：身周 4 格一直冒着辐射，每半秒烫一下；电弧在队伍里连跳 4 次；隔一阵蓄力 1.2 秒，把 5 格内的人炸开；血掉到一半就熔毁，变成火元素、出手更快，还往队员头上落下熔渣，落地处烧 4 秒',
  size: 3.4,
  radius: 1.1,
  span: [0, 6],
  hp: 8000,
  stats: { armor: 6, exertion: 0 },
  speed: 0.9,
  damage: 20,
  xp: 60,
  coins: 60,
  traits: ['anchored', 'wary'],
  drive: { kind: 'chase' },
  abilities: [radiation, arc, overload],
  phases: [{ below: 0.5, name: '熔毁', element: 'fire', abilities: [radiation, arc, overload, meltdown], stats: { mul: { cooldown: 0.8 } } }],
} satisfies EnemyDef

export default REACTOR
