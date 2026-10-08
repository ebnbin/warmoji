import type { EnemyDef } from '../../../src/types/enemies'

const RAT = {
  kind: 'rat',
  drive: { kind: 'coinThief' },
  emoji: '1f400',
  name: '偷币鼠',
  desc: '专偷地上的金币，击杀可全额讨回并有利息',
  size: 1.05,
  radius: 0.4,
  span: [0, 0],
  hp: 22,
  stats: { dodge: 0.25, maxStamina: 50, staminaRegen: 80, exertion: 1.2 },
  speed: 3.2,
  damage: 3,
  xp: 3,
  coins: 2,
} satisfies EnemyDef

export default RAT
