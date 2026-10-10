import type { AbilityDef } from '../../../../legacy/types/abilityDefs'
import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

// 进了雷云身子就变成雷，每一招都写明元素，免得水息、漩涡跟着带电
const breath = {
  trigger: 'auto',
  cooldownMs: 3200,
  firstDelayMs: 1500,
  aim: 'nearest',
  range: 7,
  damage: 16,
  element: 'water',
  fireSfx: 'splash',
  color: 0x4fc3f7,
  windup: { ms: 600, lockAt: 'start', telegraph: 'shake' },
  shape: { kind: 'segment', reach: 7, radius: 0.3, ms: 300, beam: true },
} satisfies AbilityDef

const whirlpool = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 8000,
  firstDelayMs: 4000,
  aim: 'nearest',
  range: 9,
  damage: 6,
  element: 'water',
  fireSfx: 'gurgle',
  shape: { kind: 'drop', targets: 2, look: { emoji: '1f300', size: 1.4 }, fromAbove: 3, dropMs: 700, staggerMs: 250 },
  onHit: [{ kind: 'ground', def: { ...patch(2.2, 4000, 0x29b6f6, undefined, 4, 500), pull: 2 } }],
} satisfies AbilityDef

const tail = {
  trigger: 'auto',
  cooldownMs: 2600,
  firstDelayMs: 2200,
  aim: 'nearest',
  range: 3.2,
  damage: 18,
  knockback: 4,
  element: 'physical',
  fireSfx: 'whoosh',
  windup: { ms: 400, lockAt: 'end', telegraph: 'shake' },
  shape: { kind: 'sector', radius: 3.2, arcDeg: 200, ms: 260 },
} satisfies AbilityDef

const thunder = {
  trigger: 'auto',
  class: 'skill',
  cooldownMs: 7000,
  firstDelayMs: 1500,
  aim: 'nearest',
  range: 10,
  damage: 13,
  element: 'thunder',
  fireSfx: 'zap',
  shape: { kind: 'drop', targets: 5, look: { emoji: '26a1', size: 1 }, fromAbove: 4, dropMs: 600, staggerMs: 150 },
} satisfies AbilityDef

const CLOUD = { add: { thorns: 8 } } as const

const RIVER_DRAGON = {
  kind: 'riverDragon',
  role: 'boss',
  emoji: '1f409',
  name: '水龙',
  element: 'water',
  desc: '溪里的水龙，溪水冲不动它：喷出一道 7 格长的水息，在最近的两个人脚下卷起漩涡，把人往中心拖、一直绞着打，水息和漩涡打中的都被浇湿；回身一甩尾扫开一大片，这一下是物理，冻住的挨了就碎。本身一直是湿的，点不着火，一冰就冻住。血掉到六成招来雷云，自己变成雷元素：往最近的五个人头上各劈一道雷，劈中的出手被打断，电流再跳给身边的另一个，湿着的人连成一片一起挨；近身打它的反挨一下电，最好离远了打。血掉到两成半下起倾盆大雨，12 格内的人全被淋湿 5 秒，出手间隔缩短到四分之三',
  size: 3.5,
  radius: 1.12,
  span: [0, 6],
  hp: 4400,
  stats: { armor: 4, exertion: 0 },
  speed: 1.3,
  damage: 19,
  xp: 60,
  coins: 60,
  traits: ['anchored', 'wary', 'swims'],
  drive: { kind: 'chase' },
  abilities: [breath, whirlpool, tail],
  phases: [
    { below: 0.6, name: '雷云', element: 'thunder', abilities: [breath, whirlpool, tail, thunder], stats: CLOUD },
    {
      below: 0.25,
      name: '倾盆',
      stats: { ...CLOUD, mul: { cooldown: 0.75 } },
      effects: [{ kind: 'to', who: { side: 'foes', radius: 12 }, then: [{ kind: 'status', status: 'wet', ms: 5000 }] }],
    },
  ],
} satisfies EnemyDef

export default RIVER_DRAGON
