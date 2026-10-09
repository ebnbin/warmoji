import type { EnemyDef } from '../../../../legacy/types/enemies'

const CHEETAH = {
  kind: 'cheetah',
  emoji: '1f406',
  name: '猎豹',
  element: 'fire',
  desc: '远远盯上人就猛地冲出 6 格，撞上的被顶开；冲完要喘口气，1.5 秒里移速减半',
  size: 1.45,
  radius: 0.52,
  span: [0, 1],
  hp: 50,
  speed: 1.6,
  damage: 7,
  xp: 4,
  coins: 3,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 4000,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 6.5,
      damage: 13,
      knockback: 2,
      fireSfx: 'charge',
      windup: { ms: 300, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 6, ms: 450, radius: 0.85 },
      // 减速从出手算起，要盖住 0.45 秒的冲刺再加冲完的 1.5 秒
      reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'slow', factor: 0.5, durationMs: 1950 }] }],
    },
  ],
} satisfies EnemyDef

export default CHEETAH
