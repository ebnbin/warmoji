import type { EnemyDef } from '../../../../legacy/types/enemies'

const GUST_SPIRIT = {
  kind: 'gustSpirit',
  emoji: '1f32c',
  name: '阵风精',
  element: 'thunder',
  desc: '飘在半空的阵风精，看见九格内有人就隔着三格悬着；鼓起腮帮子蓄力 0.6 秒，朝面前吹一口 4 格远的风，把人吹开 4 格，吹出冰缘就掉进海里',
  size: 1.4,
  radius: 0.5,
  span: [1, 2],
  hp: 90,
  speed: 1.6,
  damage: 7,
  xp: 6,
  coins: 4,
  drive: { kind: 'standoff', standoffDist: 3 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 4500,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 4,
      damage: 9,
      fireSfx: 'gust',
      windup: { ms: 600, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sector', radius: 4, arcDeg: 70, ms: 250 },
      onHit: [{ kind: 'shove', distance: 4, ms: 400 }],
    },
  ],
} satisfies EnemyDef

export default GUST_SPIRIT
