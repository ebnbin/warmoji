import type { EnemyDef } from '../../../../legacy/types/enemies'

const COMMUTER = {
  kind: 'commuter',
  emoji: '1f9d1_200d_1f4bc',
  name: '上班族',
  element: 'fire',
  desc: '赶着上班火急火燎，眼里只有队长，一路冒着火小跑直冲过去；挤过人群时碰到谁就把谁点着、撞开 2 格，挤在一起的一个烧一个；本身点不着',
  size: 1.35,
  radius: 0.5,
  hp: 90,
  speed: 2.4,
  damage: 8,
  xp: 3,
  coins: 2,
  drive: { kind: 'chase', at: 'leader' },
  reactions: [{ on: 'touch', to: 'other', effects: [{ kind: 'shove', distance: 2, ms: 250 }] }],
} satisfies EnemyDef

export default COMMUTER
