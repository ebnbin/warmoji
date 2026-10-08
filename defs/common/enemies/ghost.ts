import type { EnemyDef } from '../../../src/types/enemies'

const GHOST = {
  kind: 'ghost',
  drive: { kind: 'chase' },
  emoji: '1f47b',
  name: '幽灵',
  traits: ['phases'],
  desc: '飘得很快的追击者，血薄，能穿墙直取队伍，死亡时治疗周围同伴',
  size: 1.2,
  radius: 0.45,
  span: [1, 2],
  hp: 15,
  stats: { dodge: 0.4, exertion: 0 },
  speed: 2.875,
  damage: 5,
  xp: 2,
  coins: 2,
  reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'heal', amount: 12, scope: 'all', range: 3 }] }],
} satisfies EnemyDef

export default GHOST
