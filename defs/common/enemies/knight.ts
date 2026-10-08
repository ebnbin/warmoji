import type { EnemyDef } from '../../../src/types/enemies'

const KNIGHT = {
  kind: 'knight',
  drive: { kind: 'chase' },
  emoji: '1f43a',
  name: '狼骑',
  desc: '先打狼再打人：座狼替骑手扛下前面的伤害，骑着狼时会蓄力冲锋撞人；狼倒了，恶鬼骑手就下来慢步挥棒',
  size: 1.45,
  radius: 0.52,
  span: [0, 3],
  hp: 70,
  stats: { exertion: 0 },
  speed: 2.2,
  damage: 9,
  xp: 7,
  coins: 5,
  mount: { hp: 60, form: 0 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3200,
      firstDelayMs: 1200,
      aim: 'nearest',
      range: 5,
      windup: { ms: 500, lockAt: 'end', telegraph: 'shake' },
      fireSfx: 'whoosh',
      damage: 12,
      knockback: 6,
      shape: { kind: 'sprint', distance: 4, ms: 400, radius: 0.6 },
    },
  ],
  forms: [
    {
      emoji: '1f479',
      name: '恶鬼',
      span: [0, 2],
      stats: { add: { exertion: 1.4 }, mul: { moveSpeed: 0.55 } },
      abilities: [
        {
          trigger: 'auto',
          cooldownMs: 1400,
          firstDelayMs: 400,
          aim: 'nearest',
          range: 1.9,
          damage: 12,
          knockback: 4,
          fireSfx: 'whoosh',
          shape: { kind: 'sector', radius: 1.8, arcDeg: 120, ms: 220 },
        },
      ],
    },
  ],
} satisfies EnemyDef

export default KNIGHT
