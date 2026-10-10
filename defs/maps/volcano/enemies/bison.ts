import type { EnemyDef } from '../../../../legacy/types/enemies'

const BISON = {
  kind: 'bison',
  emoji: '1f9ac',
  name: '野牛',
  desc: '一身厚毛的野牛，刀砍箭射都要先过这层毛，火烧、中毒这类持续伤害却挡不住：追上来刨蹄蓄力半秒，低头直冲六格，撞上的被顶飞老远，冻住的一撞就碎；冲的方向起步时就定了，侧身躲得开，蓄力时挨一下雷就冲不出去',
  size: 1.6,
  radius: 0.6,
  hp: 125,
  stats: { armor: 6 },
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
      damage: 17,
      knockback: 4.5,
      fireSfx: 'charge',
      windup: { ms: 500, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 6, ms: 550, radius: 1 },
    },
  ],
} satisfies EnemyDef

export default BISON
