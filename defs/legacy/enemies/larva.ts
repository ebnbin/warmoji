import type { EnemyDef } from '../../../src/types/enemies'

const LARVA = {
  kind: 'larva',
  drive: { kind: 'orbit', radius: 2.5, aggroRange: 6 },
  reactions: [{ on: 'anchorLost', to: 'self', effects: [{ kind: 'buff', speedMul: 1.7, damageMul: 2.5 }] }],
  emoji: '1fab0',
  name: '苍蝇',
  desc: '绕着垃圾桶嗡嗡盘旋，玩家逼近垃圾桶就扑上来；垃圾桶被拆后暴走直扑玩家',
  size: 0.7,
  radius: 0.26,
  span: [2, 3],
  hp: 7,
  stats: { dodge: 0.4, exertion: 0 },
  speed: 2.8,
  damage: 3,
  xp: 1,
  coins: 0,
} satisfies EnemyDef

export default LARVA
