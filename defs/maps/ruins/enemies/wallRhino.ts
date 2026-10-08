import type { EnemyDef } from '../../../../src/types/enemies'

const WALL_RHINO = {
  kind: 'wallRhino',
  emoji: '1f98f',
  name: '破墙犀',
  element: 'earth',
  desc: '看见人就低头蓄力，笔直冲出 7 格，冲过人也停不下来，挡路的墙一路撞穿，撞上的人被顶飞；冲完要喘口气，侧面躲得开',
  size: 1.8,
  radius: 0.68,
  hp: 180,
  stats: { armor: 6 },
  speed: 1.1,
  damage: 10,
  xp: 8,
  coins: 5,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 5000,
      firstDelayMs: 2000,
      aim: 'nearest',
      range: 7,
      damage: 16,
      knockback: 5,
      breach: 10,
      fireSfx: 'charge',
      windup: { ms: 600, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 7, ms: 800, radius: 1 },
    },
  ],
} satisfies EnemyDef

export default WALL_RHINO
