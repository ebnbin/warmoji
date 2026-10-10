import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const ACID = 0xc0ca33
const pool = (radius: number) => patch(radius, 4000, ACID, undefined, 4, 500)

const ACID_VIAL = {
  kind: 'acidVial',
  emoji: '1f9ea',
  name: '酸液瓶',
  element: 'fire',
  desc: '本身是火，点不着：离人远远地朝最近的人泼一瓶滚烫的酸，砸中的挨一下、烧起来，烧着的每跳一下还会烧到贴着的同伴；落点留下一摊 1.4 格的酸池，4 秒才干，站在里面每半秒挨一下、一直烧着；砸中站在毒云里的人，毒云当场爆燃；瓶身脆，打碎时自己也洒一圈 2 格的酸池',
  size: 1.2,
  radius: 0.44,
  hp: 95,
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
      damage: 11,
      fireSfx: 'splash',
      shape: { kind: 'drop', targets: 1, look: { emoji: '2697', size: 0.7 }, fromAbove: 3, dropMs: 700, staggerMs: 0 },
      onHit: [{ kind: 'ground', def: pool(1.4) }],
    },
  ],
  reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'ground', def: pool(2) }] }],
} satisfies EnemyDef

export default ACID_VIAL
