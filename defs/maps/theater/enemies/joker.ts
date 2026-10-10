import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch, shot } from '../../../kit.ts'

const cards = {
  trigger: 'auto',
  cooldownMs: 2200,
  firstDelayMs: 1000,
  aim: 'nearest',
  range: 9,
  damage: 12,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1f3b4', 8, 0.55), lifeMs: 1400 },
  repeat: { count: 5, spreadDeg: 50 },
} satisfies AbilityDef

const blackCards = { ...cards, damage: 15, element: 'physical' } satisfies AbilityDef

const shuffle = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 7000,
  firstDelayMs: 4000,
  aim: 'nearest',
  range: 8,
  fireSfx: 'warp',
  shape: { kind: 'world' },
  onHit: [
    {
      kind: 'to',
      who: { side: 'foes', radius: 8, sort: 'nearest', count: 1 },
      then: [{ kind: 'swap' }],
    },
  ],
} satisfies AbilityDef

const box = {
  trigger: 'auto',
  cooldownMs: 6000,
  firstDelayMs: 2500,
  aim: 'nearest',
  range: 9,
  damage: 20,
  fireSfx: 'boom',
  shape: { kind: 'drop', targets: 3, look: { emoji: '1f381', size: 1 }, fromAbove: 4, dropMs: 700, staggerMs: 200 },
  onHit: [{ kind: 'knockup', durationMs: 600, height: 1.2 }],
} satisfies AbilityDef

const redBox = { ...box, element: 'physical' } satisfies AbilityDef

const blackBox = { ...box, damage: 14, onHit: [...box.onHit, { kind: 'ground', def: patch(1.5, 3000, 0x80deea, undefined, 0, 500) }] } satisfies AbilityDef

const JOKER = {
  kind: 'joker',
  role: 'boss',
  emoji: '1f0cf',
  name: '鬼牌',
  element: 'fire',
  desc: '一副牌里谁也管不住的那张：一甩就是一扇五张飞牌；和最近的队员换个位置；惊喜盒从天而降，把人弹上天。开场是红鬼牌，本身是火、点不着：飞牌把人点着，挤在一起的会互相引燃，惊喜盒是物理；血掉到四成翻成黑鬼牌，本身是冰、冻不住，出手更快：惊喜盒带冰，砸中的冷一层，落处留一片 3 秒的霜，站在上面越来越冷、冻住，飞牌改成物理，打在冻住的身上伤害翻倍',
  size: 3.3,
  radius: 1.1,
  span: [0, 6],
  hp: 7200,
  stats: { armor: 4, exertion: 0 },
  speed: 1.3,
  damage: 20,
  xp: 60,
  coins: 60,
  traits: ['anchored', 'wary'],
  drive: { kind: 'chase' },
  abilities: [cards, shuffle, redBox],
  phases: [{ below: 0.4, name: '黑鬼牌', element: 'ice', abilities: [blackCards, shuffle, blackBox], stats: { mul: { cooldown: 0.75 } } }],
} satisfies EnemyDef

export default JOKER
