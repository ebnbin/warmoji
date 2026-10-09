import type { EnemyDef } from '../../../../legacy/types/enemies'

const GOAT = {
  kind: 'goat',
  emoji: '1f410',
  name: '山羊',
  desc: '从坡顶一路蹦下来，落地就低头冲顶，被顶中的人飞出去老远',
  size: 1.25,
  radius: 0.46,
  span: [0, 1],
  hp: 50,
  speed: 1.7,
  damage: 6,
  xp: 4,
  coins: 3,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2600,
      firstDelayMs: 800,
      aim: 'nearest',
      range: 3,
      damage: 8,
      fireSfx: 'bleat',
      windup: { ms: 420, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 2.6, ms: 280, radius: 0.85 },
      onHit: [{ kind: 'shove', distance: 3.2, ms: 320 }],
    },
  ],
} satisfies EnemyDef

export default GOAT
