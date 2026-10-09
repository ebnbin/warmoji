import type { EnemyDef } from '../../../../legacy/types/enemies'

const MIST_SPIRIT = {
  kind: 'mistSpirit',
  emoji: '1f636_200d_1f32b_fe0f',
  name: '雪雾灵',
  element: 'water',
  desc: '裹在一团雪雾里飘过来；身周 2.5 格的雾一直跟着它，雾里的怪只挨得到同样站在雾里的出手，雾外打进来的都打不着',
  size: 1.3,
  radius: 0.48,
  span: [1, 2],
  hp: 70,
  speed: 1.3,
  damage: 9,
  xp: 4,
  coins: 2,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 0,
      firstDelayMs: 0,
      aim: 'self',
      shape: { kind: 'zone', radius: 2.5, durationMs: 0, follow: true, mist: true, visual: { color: 0xeceff1, fillAlpha: 0.35, lineAlpha: 0.3, lineWidth: 2, enterMs: 400 } },
    },
  ],
} satisfies EnemyDef

export default MIST_SPIRIT
