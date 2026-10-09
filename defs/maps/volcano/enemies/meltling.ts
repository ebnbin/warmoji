import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const MELTLING = {
  kind: 'meltling',
  emoji: '1fae0',
  name: '熔化怪',
  element: 'ice',
  desc: '喷气孔边的积雪被热气蒸化成的一摊雪泥，冻不住，却一点就着：慢吞吞地往前淌，碰到的人冷一层；每隔两秒半在脚下滴一滩冰冷的雪泥，站在里面的人每 0.7 秒冷一层，冷满三层冻住；打倒了也不散，化成一滩还能再淌三秒',
  size: 1.25,
  radius: 0.48,
  span: [0, 1],
  hp: 90,
  speed: 1,
  damage: 8,
  xp: 4,
  coins: 3,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2500,
      firstDelayMs: 500,
      aim: 'self',
      shape: { kind: 'world' },
      onHit: [{ kind: 'ground', def: patch(1.1, 2500, 0xb3e5fc, undefined, 3, 700) }],
    },
  ],
  reactions: [{ on: 'lethal', to: 'self', effects: [{ kind: 'undead', ms: 3000, hpRatio: 0.5 }] }],
} satisfies EnemyDef

export default MELTLING
