import type { EnemyDef } from '../../../../legacy/types/enemies'

const STAR_RAM = {
  kind: 'starRam',
  emoji: '1f40f',
  name: '白羊星灵',
  desc: '白羊座里跑出来的星灵：低头蓄力半秒，朝人直直撞出 6 格，是实打实的物理，被顶中的人远远飞出去，冻住的当场撞碎，离黑洞近时尤其要命，挡路的墙也撞得开；冲出去时低着头，正面来的出手全被犄角挡下，要从侧面或背后打；蓄力时就定了方向，侧身躲得开',
  size: 1.4,
  radius: 0.52,
  span: [0, 1],
  hp: 120,
  speed: 1.5,
  damage: 12,
  xp: 4,
  coins: 3,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 4000,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 6,
      damage: 20,
      knockback: 5,
      breach: 2,
      fireSfx: 'charge',
      windup: { ms: 500, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 6, ms: 550, radius: 0.7 },
      reactions: [{ on: 'cast', to: 'self', effects: [{ kind: 'frontGuard', arcDeg: 120, durationMs: 700 }] }],
    },
  ],
} satisfies EnemyDef

export default STAR_RAM
