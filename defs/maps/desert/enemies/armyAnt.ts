import type { EnemyDef } from '../../../../legacy/types/enemies'

const ARMY_ANT = {
  kind: 'armyAnt',
  emoji: '1f41c',
  name: '行军蚁',
  element: 'poison',
  desc: '贴着沙面爬得飞快，个子小，平射的子弹容易从它头上飞过去；咬一口叠一层蚁酸毒，中了毒什么回复都不管用；本身不会中毒，身子脆，成群挤在一起，点着一只能烧一片',
  size: 0.85,
  radius: 0.3,
  span: [0, 0],
  hp: 32,
  speed: 2.2,
  damage: 5,
  xp: 2,
  coins: 1,
  drive: { kind: 'chase' },
} satisfies EnemyDef

export default ARMY_ANT
