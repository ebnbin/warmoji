import type { EnemyDef } from '../../../../src/types/enemies'
import { patch } from '../../../kit.ts'

const ICE_BLOCK = {
  kind: 'iceBlock',
  emoji: '1f9ca',
  name: '浮冰怪',
  element: 'ice',
  desc: '一块会走的浮冰，皮糙肉厚、撞人生疼；每 2 秒在脚下留一片 5 秒的光冰，踩上去几乎抓不住地，挨一下就滑出老远',
  size: 1.3,
  radius: 0.52,
  hp: 180,
  stats: { armor: 6 },
  speed: 1,
  damage: 12,
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
      onHit: [{ kind: 'ground', def: { ...patch(1.6, 5000, 0xb3e5fc), traction: 0.2 } }],
    },
  ],
} satisfies EnemyDef

export default ICE_BLOCK
