import type { EnemyDef } from '../../../../legacy/types/enemies'

const PLAGUE_RAT = {
  kind: 'plagueRat',
  emoji: '1f400',
  name: '瘟鼠',
  element: 'poison',
  desc: '成群窜过来的老鼠，又小又快，本身带毒、毒不倒它；被它碰一下就中一层毒，碰得越多叠得越深，中了毒什么回复都不管用；个子矮，平射的子弹容易从它头上飞过去',
  size: 0.95,
  radius: 0.36,
  span: [0, 0],
  hp: 44,
  speed: 2.6,
  damage: 6,
  xp: 2,
  coins: 1,
  drive: { kind: 'chase' },
} satisfies EnemyDef

export default PLAGUE_RAT
