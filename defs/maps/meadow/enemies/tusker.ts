import type { EnemyDef } from '../../../../src/types/enemies'

const TUSKER = {
  kind: 'tusker',
  emoji: '1f417',
  name: '野猪',
  element: 'earth',
  desc: '低头刨地蓄力，朝人直直冲出一大段，撞上就被顶开；冲完要喘口气，侧面躲得开',
  size: 1.4,
  radius: 0.52,
  span: [0, 1],
  hp: 70,
  stats: { armor: 3 },
  speed: 1,
  damage: 8,
  xp: 5,
  coins: 3,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3400,
      firstDelayMs: 1200,
      aim: 'nearest',
      range: 5,
      damage: 14,
      knockback: 4,
      fireSfx: 'charge',
      windup: { ms: 750, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 5, ms: 520, radius: 0.9 },
    },
  ],
} satisfies EnemyDef

export default TUSKER
