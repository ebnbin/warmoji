import type { EnemyDef } from '../../../../legacy/types/enemies'

const MATRYOSHKA_MINI = {
  kind: 'matryoshkaMini',
  emoji: '1fa86',
  name: '小套娃',
  desc: '中套娃碎开后蹦出来的小套娃，没有壳，一碰就碎，个子矮、跑得快',
  size: 0.8,
  radius: 0.32,
  span: [0, 1],
  hp: 18,
  speed: 2,
  damage: 7,
  xp: 1,
  coins: 0,
  drive: { kind: 'chase' },
} satisfies EnemyDef

export default MATRYOSHKA_MINI
