import type { EnemyDef } from '../../../../legacy/types/enemies'

const TRASH_FLY = {
  kind: 'trashFly',
  emoji: '1fab0',
  name: '绿头蝇',
  desc: '微笑海报后头飞出来的绿头蝇，绕着海报 2.5 格嗡嗡打转，有人走进海报 6 格内就扑上去；海报被撕掉后永久暴走，移速 ×1.7、伤害 ×2.5',
  size: 0.7,
  radius: 0.26,
  span: [2, 3],
  hp: 16,
  stats: { dodge: 0.4, exertion: 0 },
  speed: 2.8,
  damage: 4,
  xp: 1,
  coins: 0,
  drive: { kind: 'orbit', around: 'nest', radius: 2.5, aggroRange: 6 },
  reactions: [{ on: 'anchorLost', to: 'self', effects: [{ kind: 'buff', speedMul: 1.7, damageMul: 2.5 }] }],
} satisfies EnemyDef

export default TRASH_FLY
