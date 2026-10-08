import type { EnemyDef } from '../../../../src/types/enemies'

const BISON = {
  kind: 'bison',
  emoji: '1f9ac',
  name: '野牛',
  element: 'earth',
  desc: '一身厚毛的野牛，皮糙肉厚：追上来刨蹄蓄力半秒，低头直冲六格，撞上的被顶飞老远；冲的方向起步时就定了，侧身躲得开',
  size: 1.6,
  radius: 0.6,
  hp: 140,
  stats: { armor: 4 },
  speed: 1.2,
  damage: 11,
  xp: 6,
  coins: 4,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 4000,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 6,
      damage: 16,
      knockback: 4,
      fireSfx: 'charge',
      windup: { ms: 500, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 6, ms: 550, radius: 1 },
    },
  ],
} satisfies EnemyDef

export default BISON
