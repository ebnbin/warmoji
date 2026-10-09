import type { EnemyDef } from '../../../../legacy/types/enemies'

const SPADE_GUARD = {
  kind: 'spadeGuard',
  emoji: '2660',
  name: '黑桃卫兵',
  desc: '扑克牌里的卫兵：盯上人就把盾举到身前 3 秒，正面 120 度打来的全挡下，隔 4 秒举一次；凑近了一枪刺过来，绕到侧面打它',
  size: 1.35,
  radius: 0.5,
  hp: 130,
  stats: { armor: 6 },
  speed: 1.1,
  damage: 11,
  xp: 4,
  coins: 3,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 4000,
      firstDelayMs: 500,
      aim: 'nearest',
      range: 5,
      fireSfx: 'clank',
      shape: { kind: 'world' },
      reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'frontGuard', arcDeg: 120, durationMs: 3000 }] }],
    },
    {
      trigger: 'auto',
      cooldownMs: 2200,
      firstDelayMs: 800,
      aim: 'nearest',
      range: 2.4,
      damage: 14,
      knockback: 1,
      fireSfx: 'whoosh',
      windup: { ms: 350, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'segment', reach: 1.7, radius: 0.35, ms: 160, lungeDist: 0.5 },
    },
  ],
} satisfies EnemyDef

export default SPADE_GUARD
