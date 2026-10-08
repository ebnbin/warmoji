import type { EnemyDef } from '../../../src/types/enemies'

const BLOBLING = {
  kind: 'blobling',
  drive: { kind: 'chase' },
  emoji: '1f9a0',
  name: '小细菌',
  desc: '细菌分裂出的迷你体，快而脆',
  size: 0.75,
  radius: 0.28,
  span: [0, 0],
  hp: 15,
  stats: { dodge: 0.15, maxStamina: 40, staminaRegen: 60, exertion: 1.2 },
  speed: 2.6,
  damage: 4,
  xp: 1,
  coins: 0,
} satisfies EnemyDef

export default BLOBLING
