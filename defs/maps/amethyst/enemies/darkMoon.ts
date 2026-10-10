import type { EnemyDef } from '../../../../legacy/types/enemies'
import { zoneLook } from '../../../kit.ts'

const DARK_MOON = {
  kind: 'darkMoon',
  emoji: '1f31a',
  name: '黑月',
  element: 'ice',
  desc: '飘在高处的一轮黑月，总和人隔着四五格，本身是冰，冻不住；身周 3 格罩着一片跟着它走的寒影，里面的人每秒叠一层寒冷、越走越慢，待满 3 秒就冻住 1.5 秒，身上湿的一进来当场冻住；它自己不伤人，冰冻不住它，得靠火、刀或毒',
  size: 1.5,
  radius: 0.55,
  span: [2, 3],
  hp: 120,
  speed: 1,
  damage: 0,
  xp: 6,
  coins: 4,
  drive: { kind: 'standoff', standoffDist: 4.5 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 0,
      firstDelayMs: 0,
      aim: 'self',
      shape: { kind: 'zone', radius: 3, durationMs: 0, tickMs: 1000, follow: true, visual: zoneLook(0x80deea) },
    },
  ],
} satisfies EnemyDef

export default DARK_MOON
