import type { EnemyDef } from '../../../../legacy/types/enemies'
import { zoneLook } from '../../../kit.ts'

const HEAT_WRAITH = {
  kind: 'heatWraith',
  emoji: '1f975',
  name: '热浪鬼',
  element: 'fire',
  desc: '飘在半空的一团热浪，本身是火、点不着：身边 2.5 格热得发昏，在里面每走一格多耗 3 点体力；被它碰到就被点着，体力一下子见底；热浪里看不真切，不是范围的出手三成半打不中它',
  size: 1.3,
  radius: 0.46,
  span: [1, 2],
  hp: 46,
  stats: { dodge: 0.35 },
  speed: 1.5,
  damage: 6,
  xp: 5,
  coins: 4,
  drive: { kind: 'chase' },
  reactions: [{ on: 'touch', to: 'other', effects: [{ kind: 'exhaust' }] }],
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 0,
      firstDelayMs: 0,
      aim: 'self',
      shape: { kind: 'zone', radius: 2.5, durationMs: 0, follow: true, exertion: 3, visual: zoneLook(0xffab40) },
    },
  ],
} satisfies EnemyDef

export default HEAT_WRAITH
