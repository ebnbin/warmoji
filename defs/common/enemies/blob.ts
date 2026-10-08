import type { EnemyDef } from '../../../src/types/enemies'
import BLOBLING from './blobling.ts'

const BLOB = {
  kind: 'blob',
  drive: { kind: 'chase' },
  emoji: '1f9a0',
  name: '细菌',
  desc: '被击破时一分为二，裂成两只小细菌',
  size: 1.55,
  radius: 0.55,
  hp: 70,
  speed: 1.2,
  damage: 6,
  xp: 4,
  coins: 3,
  reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'split', into: BLOBLING, count: 2 }] }],
} satisfies EnemyDef

export default BLOB
