import type { EnemyDef } from '../../../../src/types/enemies'

const CAVE_TROLL = {
  kind: 'caveTroll',
  emoji: '1f9cc',
  name: '洞穴巨怪',
  element: 'earth',
  desc: '从暗道深处挤出来的巨怪，又大又慢：一把揪住面前的人往身后一扔，摔在地上晕 0.6 秒；隔一阵抡起木棒横扫面前一大片',
  size: 1.8,
  radius: 0.65,
  hp: 210,
  stats: { armor: 6 },
  speed: 0.9,
  damage: 11,
  xp: 8,
  coins: 6,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 4000,
      firstDelayMs: 1200,
      aim: 'nearest',
      range: 1.8,
      damage: 16,
      fireSfx: 'whoosh',
      windup: { ms: 450, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'segment', reach: 1.6, radius: 0.5, ms: 180 },
      onHit: [{ kind: 'throw', to: 'behind', distance: 4, ms: 600, height: 1.5, onLand: [{ kind: 'stun', durationMs: 600 }] }],
    },
    {
      trigger: 'auto',
      cooldownMs: 2600,
      firstDelayMs: 600,
      aim: 'nearest',
      range: 2.3,
      damage: 18,
      knockback: 3,
      fireSfx: 'thud',
      windup: { ms: 500, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'sector', radius: 2.2, arcDeg: 120, ms: 220 },
    },
  ],
} satisfies EnemyDef

export default CAVE_TROLL
