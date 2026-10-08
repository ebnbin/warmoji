import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { EnemyDef } from '../../../../src/types/enemies'
import { shot } from '../../../kit.ts'

const cards = {
  trigger: 'auto',
  cooldownMs: 2200,
  firstDelayMs: 1000,
  aim: 'nearest',
  range: 9,
  damage: 15,
  fireSfx: 'shoot',
  shape: { kind: 'bolt', projectile: shot('1f3b4', 8, 0.55), lifeMs: 1400 },
  repeat: { count: 5, spreadDeg: 50 },
} satisfies AbilityDef

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
      then: [{ kind: 'swap' }, { kind: 'status', status: 'exposed', ms: 3000, value: 1.25 }],
    },
  ],
} satisfies AbilityDef

const surprise = {
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

const JOKER = {
  kind: 'joker',
  role: 'boss',
  emoji: '1f0cf',
  name: '鬼牌',
  desc: '一副牌里谁也管不住的那张：一甩就是一扇五张飞牌；和最近的队员换个位置，换过去的人 3 秒内受到的伤害 ×1.25；惊喜盒从天而降，把人弹上天；血掉到六成翻成红鬼牌、带上火，三成翻成黑鬼牌、带上冰，出手更快',
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
  abilities: [cards, shuffle, surprise],
  phases: [
    { below: 0.6, name: '红鬼牌', element: 'fire' },
    { below: 0.3, name: '黑鬼牌', element: 'ice', stats: { mul: { cooldown: 0.75 } } },
  ],
} satisfies EnemyDef

export default JOKER
