import type { EnemyDef } from '../../../../src/types/enemies'
import SPORE from './spore.ts'

const MOLD = {
  kind: 'mold',
  emoji: '1f344',
  name: '霉菌',
  element: 'wood',
  desc: '长在原地不动，也不碰人；每 5 秒长大一圈，一直长到原来的 1.8 倍；每 5 秒放出两个孢子，最多同时 6 个，不除掉就一直放',
  size: 1.3,
  radius: 0.5,
  span: [0, 1],
  hp: 200,
  stats: { armor: 4 },
  speed: 0,
  damage: 0,
  xp: 8,
  coins: 6,
  traits: ['anchored'],
  drive: { kind: 'stay' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 5000,
      firstDelayMs: 5000,
      aim: 'self',
      fireSfx: 'creak',
      shape: { kind: 'world' },
      reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'grow', mul: 1.15, max: 1.8 }] }],
    },
  ],
  spawner: { into: SPORE, intervalMs: 5000, count: 2, maxAlive: 6, firstDelayMs: 2500 },
} satisfies EnemyDef

export default MOLD
