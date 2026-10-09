import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'
import REACTOR_PYLON from './reactorPylon.ts'

const aura = (color: number) => ({ kind: 'zone', radius: 4, durationMs: 0, tickMs: 500, follow: true, visual: { color, fillAlpha: 0.1, lineAlpha: 0.5, lineWidth: 2, enterMs: 300 } }) as const

const radiation = {
  trigger: 'auto',
  cooldownMs: 0,
  firstDelayMs: 0,
  aim: 'self',
  element: 'poison',
  damage: 4,
  shape: aura(0xc6ff00),
} satisfies AbilityDef

const heat = {
  trigger: 'auto',
  cooldownMs: 0,
  firstDelayMs: 0,
  aim: 'self',
  damage: 5,
  shape: aura(0xff7043),
} satisfies AbilityDef

const arc = {
  trigger: 'auto',
  cooldownMs: 2400,
  firstDelayMs: 1500,
  aim: 'nearest',
  range: 7,
  damage: 15,
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
  element: 'physical',
  damage: 40,
  knockback: 4,
  fireSfx: 'boom',
  color: 0xffeb3b,
  when: { kind: 'foesNear', who: 'self', radius: 5, atLeast: 1 },
  windup: { ms: 1200, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'disc', radius: 5, at: 'self' },
} satisfies AbilityDef

const shielding = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 20000,
  firstDelayMs: 800,
  aim: 'self',
  fireSfx: 'recruit',
  shape: { kind: 'world' },
  onHit: [{ kind: 'summon', of: { unit: REACTOR_PYLON, spread: 5 }, count: 3 }],
} satisfies AbilityDef

const sweep = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 4000,
  firstDelayMs: 1000,
  aim: 'nearest',
  range: 8,
  damage: 11,
  fireSfx: 'ignite',
  color: 0xff5252,
  shape: { kind: 'segment', reach: 8, radius: 0.3, ms: 0, beam: true },
  repeat: { count: 8, spreadDeg: 360, delayMs: 70 },
} satisfies AbilityDef

const meltdown = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 7000,
  firstDelayMs: 2000,
  aim: 'nearest',
  range: 10,
  damage: 14,
  fireSfx: 'erupt',
  shape: { kind: 'drop', targets: 5, look: { emoji: '2604', size: 1.1 }, fromAbove: 4, dropMs: 700, staggerMs: 150 },
  onHit: [{ kind: 'ground', def: patch(1.6, 4000, 0xff7043, undefined, 6, 500) }],
} satisfies AbilityDef

const REACTOR = {
  kind: 'reactor',
  role: 'boss',
  emoji: '2622',
  name: '失控核心',
  element: 'thunder',
  desc: '失控的反应堆核心，挪得很慢：一登场就在身边立起 3 根屏蔽柱，只要还有一根立着就打不动它，每 20 秒再立 3 根；身周 4 格冒着辐射，是一团毒云，每半秒烫一下、中一层毒，待在里面什么回复都不管用，队伍的火打进毒云就炸开，炸的是云里的它和屏蔽柱；电弧在队伍里连跳 4 次，每一下都打断出手；隔一阵蓄力 1.2 秒，把 5 格内的人炸开，蓄力时一打断就炸不出来；血掉到一半就熔毁，变成火元素、点不着、出手更快，当场再立 2 根屏蔽柱：辐射烧成热浪，每半秒烫一下、把人点着，电弧换成绕身扫一圈的 8 道 8 格长的火激光，还往队员头上落下熔渣，落地处烧 4 秒；护甲厚，中毒照掉',
  size: 3.4,
  radius: 1.1,
  span: [0, 6],
  hp: 7200,
  stats: { armor: 6, exertion: 0 },
  speed: 0.9,
  damage: 16,
  xp: 60,
  coins: 60,
  traits: ['anchored', 'wary'],
  guardedBy: 'reactorPylon',
  drive: { kind: 'chase' },
  abilities: [radiation, arc, overload, shielding],
  phases: [
    {
      below: 0.5,
      name: '熔毁',
      element: 'fire',
      abilities: [heat, sweep, overload, meltdown, shielding],
      stats: { mul: { cooldown: 0.8 } },
      effects: [{ kind: 'summon', of: { unit: REACTOR_PYLON, spread: 5 }, count: 2 }],
    },
  ],
} satisfies EnemyDef

export default REACTOR
