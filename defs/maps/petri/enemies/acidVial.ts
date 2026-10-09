import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const ACID = 0xc0ca33
const BURN = [{ kind: 'status', status: 'exposed', ms: 600, value: 1.15 }] as const

const ACID_VIAL = {
  kind: 'acidVial',
  emoji: '1f9ea',
  name: '酸液瓶',
  element: 'fire',
  desc: '离人远远地朝最近的人泼酸液：砸中的挨一下，落点留下一摊 1.4 格的酸池，站在里面每 0.4 秒掉一次血、挨打更疼，4 秒才干；打碎时自己也洒一圈 2 格的酸',
  size: 1.2,
  radius: 0.44,
  hp: 110,
  speed: 1.3,
  damage: 10,
  xp: 6,
  coins: 4,
  drive: { kind: 'standoff', standoffDist: 4 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2600,
      firstDelayMs: 1200,
      aim: 'nearest',
      range: 6.5,
      damage: 14,
      fireSfx: 'splash',
      shape: { kind: 'drop', targets: 1, look: { emoji: '2697', size: 0.7 }, fromAbove: 3, dropMs: 700, staggerMs: 0 },
      onHit: [{ kind: 'ground', def: patch(1.4, 4000, ACID, BURN, 4) }],
    },
  ],
  reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'ground', def: patch(2, 4000, ACID, BURN, 4) }] }],
} satisfies EnemyDef

export default ACID_VIAL
