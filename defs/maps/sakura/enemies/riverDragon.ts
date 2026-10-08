import type { AbilityDef } from '../../../../src/types/abilityDefs'
import type { EnemyDef } from '../../../../src/types/enemies'
import { patch } from '../../../kit.ts'

const breath = {
  trigger: 'auto',
  cooldownMs: 3200,
  firstDelayMs: 1500,
  aim: 'nearest',
  range: 7,
  damage: 20,
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
  damage: 8,
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
  damage: 16,
  fireSfx: 'zap',
  shape: { kind: 'drop', targets: 5, look: { emoji: '26a1', size: 1 }, fromAbove: 4, dropMs: 600, staggerMs: 150 },
  onHit: [{ kind: 'stun', durationMs: 500 }],
} satisfies AbilityDef

const RIVER_DRAGON = {
  kind: 'riverDragon',
  role: 'boss',
  emoji: '1f409',
  name: '水龙',
  element: 'water',
  desc: '溪里的水龙，溪水冲不动它：喷出一道 7 格长的水息；在最近的两个人脚下卷起漩涡，把人往中心拖、一直绞着打；回身一甩尾扫开一大片。血掉到六成招来雷云，自己变成雷元素，还往最近的五个人头上各劈一道雷，劈中的麻一下；血掉到两成半下起倾盆大雨，出手间隔缩短到四分之三',
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
    { below: 0.6, name: '雷云', element: 'thunder', abilities: [breath, whirlpool, tail, thunder] },
    { below: 0.25, name: '倾盆', stats: { mul: { cooldown: 0.75 } } },
  ],
} satisfies EnemyDef

export default RIVER_DRAGON
