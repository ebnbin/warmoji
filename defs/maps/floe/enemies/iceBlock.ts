import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const ICE_BLOCK = {
  kind: 'iceBlock',
  emoji: '1f9ca',
  name: '浮冰怪',
  element: 'ice',
  desc: '一块会走的浮冰，本身是冰，冻不住、推下海也冻不死；护甲厚，每一下直接打上去都被挡掉近三成，持续伤害不吃护甲；撞人生疼，撞一下冷一层。每 2 秒在脚下留一片 5 秒的光冰，踩上去几乎抓不住地、挨一下就滑出老远，站在上面每 1.5 秒冷一层',
  size: 1.3,
  radius: 0.52,
  hp: 180,
  stats: { armor: 6 },
  speed: 1,
  damage: 10,
  xp: 6,
  coins: 4,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2000,
      firstDelayMs: 0,
      aim: 'self',
      shape: { kind: 'world' },
      onHit: [{ kind: 'ground', def: { ...patch(1.6, 5000, 0xb3e5fc, undefined, 0, 1500), traction: 0.2 } }],
    },
  ],
} satisfies EnemyDef

export default ICE_BLOCK
