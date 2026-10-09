import type { EnemyDef } from '../../../../legacy/types/enemies'

const PLAGUE_RAT = {
  kind: 'plagueRat',
  emoji: '1f400',
  name: '瘟鼠',
  element: 'wood',
  desc: '成群窜过来的老鼠，又小又快，被它碰到就染上瘟病，3 秒里一阵阵掉血；个子矮，平射的子弹容易从它头上飞过去',
  size: 0.95,
  radius: 0.36,
  span: [0, 0],
  hp: 44,
  speed: 2.6,
  damage: 7,
  xp: 2,
  coins: 1,
  drive: { kind: 'chase' },
  reactions: [{ on: 'touch', to: 'other', effects: [{ kind: 'poison', damage: 2, tickMs: 500, durationMs: 3000 }] }],
} satisfies EnemyDef

export default PLAGUE_RAT
