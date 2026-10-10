import type { EnemyDef } from '../../../../legacy/types/enemies'

const CHEETAH = {
  kind: 'cheetah',
  emoji: '1f406',
  name: '猎豹',
  desc: '远远盯上人就猛地冲出 6 格，撞上的被狠狠撞飞；跑起来身形难抓，不是范围的出手三成打不中它；冲完要喘口气，先愣在原地 1 秒，1.5 秒里移速都减半',
  size: 1.45,
  radius: 0.52,
  span: [0, 1],
  hp: 50,
  stats: { dodge: 0.3 },
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
      damage: 14,
      knockback: 4,
      fireSfx: 'charge',
      windup: { ms: 300, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 6, ms: 450, radius: 0.85 },
      // 减速从出手算起，要盖住 0.45 秒的冲刺再加冲完的 1.5 秒；愣住要等冲刺做完才开始
      reactions: [
        {
          on: 'fire',
          to: 'self',
          effects: [
            { kind: 'slow', factor: 0.5, durationMs: 1950 },
            { kind: 'after', ms: 450, then: [{ kind: 'stun', durationMs: 1000 }] },
          ],
        },
      ],
    },
  ],
} satisfies EnemyDef

export default CHEETAH
