import type { EnemyDef } from '../../../../src/types/enemies'

const COMMUTER = {
  kind: 'commuter',
  emoji: '1f9d1_200d_1f4bc',
  name: '上班族',
  desc: '赶着上班，眼里只有队长，一路小跑直冲过去；挤过人群时把碰到的人撞开 2 格',
  size: 1.35,
  radius: 0.5,
  hp: 90,
  speed: 2.4,
  damage: 11,
  xp: 3,
  coins: 2,
  drive: { kind: 'chase', at: 'leader' },
  reactions: [{ on: 'touch', to: 'other', effects: [{ kind: 'shove', distance: 2, ms: 250 }] }],
} satisfies EnemyDef

export default COMMUTER
