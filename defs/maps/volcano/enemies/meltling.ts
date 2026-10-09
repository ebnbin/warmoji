import type { EnemyDef } from '../../../../legacy/types/enemies'
import { patch } from '../../../kit.ts'

const MELTLING = {
  kind: 'meltling',
  emoji: '1fae0',
  name: '熔化怪',
  element: 'fire',
  desc: '一摊半熔的东西，不怕岩浆：慢吞吞地往前淌，每隔两秒半在脚下滴一滩烫人的熔浆；打倒了也不散，化成一滩还能再淌三秒',
  size: 1.25,
  radius: 0.48,
  span: [0, 1],
  hp: 90,
  speed: 1,
  damage: 10,
  xp: 4,
  coins: 3,
  traits: ['fireproof'],
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2500,
      firstDelayMs: 500,
      aim: 'self',
      shape: { kind: 'world' },
      onHit: [{ kind: 'ground', def: patch(1, 2500, 0xff7043, undefined, 4, 400) }],
    },
  ],
  reactions: [{ on: 'lethal', to: 'self', effects: [{ kind: 'undead', ms: 3000, hpRatio: 0.5 }] }],
} satisfies EnemyDef

export default MELTLING
