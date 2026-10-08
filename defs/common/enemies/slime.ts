import type { EnemyDef } from '../../../src/types/enemies'

const SLIME = {
  kind: 'slime',
  drive: { kind: 'chase' },
  emoji: '1fab1',
  name: '黏液虫',
  desc: '缓慢肉盾，蹭到的队员会被黏液糊住，攻速大降数秒',
  size: 1.3,
  radius: 0.5,
  span: [0, 0],
  hp: 45,
  stats: { armor: 3 },
  speed: 1.1,
  damage: 5,
  xp: 4,
  coins: 3,
  reactions: [{ on: 'touch', to: 'other', effects: [{ kind: 'attackSlow', mul: 1.6, durationMs: 3000 }] }],
} satisfies EnemyDef

export default SLIME
