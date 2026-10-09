import type { EnemyDef } from '../../../../legacy/types/enemies'
import MATRYOSHKA_MINI from './matryoshkaMini.ts'

const MATRYOSHKA_MID = {
  kind: 'matryoshkaMid',
  emoji: '1fa86',
  name: '中套娃',
  desc: '套娃碎开后走出来的中套娃，壳薄一些（护甲 5），再打碎又裂成两个小套娃',
  size: 1.1,
  radius: 0.45,
  hp: 34,
  stats: { armor: 5 },
  speed: 1.3,
  damage: 10,
  xp: 1,
  coins: 0,
  drive: { kind: 'chase' },
  reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'split', into: MATRYOSHKA_MINI, count: 2 }] }],
} satisfies EnemyDef

export default MATRYOSHKA_MID
