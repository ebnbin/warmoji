import type { EnemyDef } from '../../../../src/types/enemies'

const FROST_SWAN = {
  kind: 'frostSwan',
  emoji: '1f9a2',
  name: '霜天鹅',
  element: 'ice',
  desc: '从天上落下来的霜天鹅，追着人跑；凑近了翅膀一扇，把面前的人扇开三格，扇出冰缘就掉进海里',
  size: 1.4,
  radius: 0.5,
  hp: 70,
  speed: 1.8,
  damage: 8,
  xp: 3,
  coins: 2,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3000,
      firstDelayMs: 800,
      aim: 'nearest',
      range: 1.9,
      damage: 11,
      fireSfx: 'flutter',
      windup: { ms: 350, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'sector', radius: 1.8, arcDeg: 90, ms: 200 },
      onHit: [{ kind: 'shove', distance: 3, ms: 300 }],
    },
  ],
} satisfies EnemyDef

export default FROST_SWAN
