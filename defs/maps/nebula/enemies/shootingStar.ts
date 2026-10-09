import type { EnemyDef } from '../../../../legacy/types/enemies'

const SHOOTING_STAR = {
  kind: 'shootingStar',
  emoji: '1f320',
  name: '流星',
  element: 'ice',
  desc: '被流星甩进空腔的冰碎片，飘在半空飞得飞快；顿一下就朝人俯冲 5 格，撞上的人减速 40% 1.5 秒',
  size: 1.2,
  radius: 0.45,
  span: [1, 2],
  hp: 72,
  speed: 2.8,
  damage: 11,
  xp: 3,
  coins: 2,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3000,
      firstDelayMs: 800,
      aim: 'nearest',
      range: 5,
      damage: 14,
      fireSfx: 'whoosh',
      windup: { ms: 300, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 5, ms: 350, radius: 0.6 },
      onHit: [{ kind: 'slow', factor: 0.6, durationMs: 1500 }],
    },
  ],
} satisfies EnemyDef

export default SHOOTING_STAR
