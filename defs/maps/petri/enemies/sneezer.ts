import type { EnemyDef } from '../../../../src/types/enemies'

const SNEEZER = {
  kind: 'sneezer',
  emoji: '1f927',
  name: '喷嚏菌',
  element: 'water',
  desc: '追着人跑，憋一口气打个大喷嚏：身前一片的人挨一下、被喷退 3 格——身后要是菌落，正好被喷进去粘住',
  size: 1.3,
  radius: 0.48,
  hp: 70,
  speed: 1.6,
  damage: 10,
  xp: 3,
  coins: 2,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3200,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 2.5,
      damage: 14,
      fireSfx: 'gust',
      windup: { ms: 600, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sector', radius: 2.5, arcDeg: 90, ms: 200 },
      onHit: [{ kind: 'shove', distance: 3, ms: 320 }],
    },
  ],
} satisfies EnemyDef

export default SNEEZER
