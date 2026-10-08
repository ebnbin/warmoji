import type { EnemyDef } from '../../../../src/types/enemies'

const ARMY_ANT = {
  kind: 'armyAnt',
  emoji: '1f41c',
  name: '行军蚁',
  element: 'earth',
  desc: '贴着沙面爬得飞快，个子小，平射的子弹容易从它头上飞过去；被它咬一口沾上蚁酸，2 秒里每半秒疼一下',
  size: 0.85,
  radius: 0.3,
  span: [0, 0],
  hp: 32,
  speed: 2.2,
  damage: 6,
  xp: 2,
  coins: 1,
  drive: { kind: 'chase' },
  reactions: [{ on: 'touch', to: 'other', effects: [{ kind: 'poison', damage: 2, tickMs: 500, durationMs: 2000 }] }],
} satisfies EnemyDef

export default ARMY_ANT
