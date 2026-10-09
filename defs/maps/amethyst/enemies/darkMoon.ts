import type { EnemyDef } from '../../../../legacy/types/enemies'
import { zoneLook } from '../../../kit.ts'

const DARK_MOON = {
  kind: 'darkMoon',
  emoji: '1f31a',
  name: '黑月',
  element: 'dark',
  desc: '飘在高处的一轮黑月，总和人隔着四五格；身周 3 格罩着一片跟着它走的暗影，暗影里每过 1 秒，里面的人就被晃得致盲 0.8 秒，出不了手',
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
      shape: {
        kind: 'zone',
        radius: 3,
        durationMs: 0,
        follow: true,
        pulse: { intervalMs: 1000, onHit: [{ kind: 'disarm', durationMs: 800 }] },
        visual: zoneLook(0x5e35b1),
      },
    },
  ],
} satisfies EnemyDef

export default DARK_MOON
