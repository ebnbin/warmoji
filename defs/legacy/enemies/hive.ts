import type { EnemyDef } from '../../../src/types/enemies'
import LARVA from './larva.ts'

const HIVE = {
  kind: 'hive',
  drive: { kind: 'stay' },
  emoji: '1f5d1',
  name: '垃圾桶',
  desc: '原地不动的垃圾桶，每隔几秒飞出苍蝇，不拆掉就一直刷',
  size: 1.5,
  radius: 0.6,
  span: [0, 1],
  hp: 105,
  stats: { armor: 5 },
  speed: 0,
  damage: 4,
  xp: 8,
  coins: 6,
  traits: ['anchored'],
  spawner: { into: LARVA, intervalMs: 4000, count: 2, maxAlive: 6, firstDelayMs: 2000 },
} satisfies EnemyDef

export default HIVE
