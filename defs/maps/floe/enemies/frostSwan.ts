import type { EnemyDef } from '../../../../legacy/types/enemies'

const FROST_SWAN = {
  kind: 'frostSwan',
  emoji: '1f9a2',
  name: '霜天鹅',
  desc: '从天上落下来的霜天鹅，身段轻盈：单发的出手有四分之一被它闪开，范围与持续伤害躲不开；追着人跑，凑近了翅膀一扇，把面前的人扇开三格，扇出冰缘就掉进海里，冻住的一扇就碎；自己掉进海里照样冻得死',
  size: 1.4,
  radius: 0.5,
  hp: 60,
  stats: { dodge: 0.25 },
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
