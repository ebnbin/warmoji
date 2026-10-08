import type { EnemyDef } from '../../../../src/types/enemies'
import CAVE_BAT from './caveBat.ts'

const COFFIN = {
  kind: 'coffin',
  emoji: '26b0',
  name: '棺材',
  element: 'dark',
  desc: '立在暗处的一口棺材，一动不动也推不走；每 7 秒棺盖一开飞出 2 只洞蝠，最多同时 4 只，不拆掉就一直飞',
  size: 1.5,
  radius: 0.55,
  hp: 170,
  stats: { armor: 8 },
  speed: 0,
  damage: 0,
  xp: 7,
  coins: 5,
  traits: ['anchored'],
  drive: { kind: 'stay' },
  spawner: { into: CAVE_BAT, intervalMs: 7000, count: 2, maxAlive: 4, firstDelayMs: 2500 },
} satisfies EnemyDef

export default COFFIN
