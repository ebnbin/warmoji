import type { EnemyDef } from '../../../../legacy/types/enemies'
import BONE_MAN from './boneMan.ts'

const TOMBSTONE = {
  kind: 'tombstone',
  emoji: '1faa6',
  name: '墓碑',
  desc: '院子里冒出来的墓碑，自己一动不动也推不动，石头护甲极厚，燃烧和中毒却不吃护甲；每 6 秒从坟里爬出两个骷髅兵，场上最多四个；不推倒它就一直往外爬',
  size: 1.4,
  radius: 0.55,
  span: [0, 1],
  hp: 140,
  stats: { armor: 12 },
  speed: 0,
  damage: 0,
  xp: 7,
  coins: 5,
  traits: ['anchored'],
  drive: { kind: 'stay' },
  spawner: { into: BONE_MAN, intervalMs: 6000, count: 2, maxAlive: 4, firstDelayMs: 2000 },
} satisfies EnemyDef

export default TOMBSTONE
