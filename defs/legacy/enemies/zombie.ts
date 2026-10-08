import type { EnemyDef } from '../../../src/types/enemies'

const ZOMBIE = {
  kind: 'zombie',
  drive: { kind: 'chase' },
  emoji: '1f9df',
  name: '僵尸',
  desc: '缓慢但成群，最基础的追击者',
  size: 1.35,
  radius: 0.5,
  hp: 60,
  speed: 1.375,
  damage: 8,
  xp: 3,
  coins: 2,
} satisfies EnemyDef

export default ZOMBIE
