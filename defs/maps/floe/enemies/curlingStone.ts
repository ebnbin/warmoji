import type { EnemyDef } from '../../../../src/types/enemies'

const CURLING_STONE = {
  kind: 'curlingStone',
  emoji: '1f94c',
  name: '冰壶',
  element: 'ice',
  desc: '沉甸甸的冰壶，个子矮、护甲厚、挪得慢；蓄力 0.6 秒后贴着冰面长长地滑出 8 格，撞上的人被撞飞老远，一不留神就被撞下冰缘',
  size: 1.1,
  radius: 0.48,
  span: [0, 0],
  hp: 160,
  stats: { armor: 8 },
  speed: 0.9,
  damage: 10,
  xp: 6,
  coins: 4,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 4000,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 8,
      damage: 14,
      knockback: 6,
      fireSfx: 'charge',
      windup: { ms: 600, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 8, ms: 1200, radius: 0.85 },
    },
  ],
} satisfies EnemyDef

export default CURLING_STONE
