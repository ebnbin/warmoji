import type { EnemyDef } from '../../../../src/types/enemies'
import MATRYOSHKA_MID from './matryoshkaMid.ts'

const MATRYOSHKA = {
  kind: 'matryoshka',
  emoji: '1fa86',
  name: '套娃',
  element: 'wood',
  desc: '又慢又结实的套娃，打碎了裂成两个中套娃，中套娃再裂成两个小套娃，越打越多',
  size: 1.4,
  radius: 0.6,
  hp: 170,
  stats: { armor: 4 },
  speed: 0.9,
  damage: 14,
  xp: 6,
  coins: 5,
  drive: { kind: 'chase' },
  reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'split', into: MATRYOSHKA_MID, count: 2 }] }],
} satisfies EnemyDef

export default MATRYOSHKA
