import type { EnemyDef } from '../../../src/types/enemies'
import TREE from './tree.ts'

const SAPLING = {
  kind: 'sapling',
  drive: { kind: 'stay' },
  emoji: '1faba',
  name: '蛛卵',
  desc: '织网蛛母产下的卵，六秒内不打破就孵出小蛛、结成会缠人的蛛网',
  size: 1,
  radius: 0.4,
  span: [0, 0],
  hp: 40,
  speed: 0,
  damage: 0,
  xp: 1,
  coins: 0,
  traits: ['anchored'],
  grow: { ms: 6000, into: TREE },
} satisfies EnemyDef

export default SAPLING
