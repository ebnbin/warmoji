import type { EnemyDef } from '../../../../legacy/types/enemies'

const UMBRELLA = {
  kind: 'umbrella',
  emoji: '2602',
  name: '唐伞妖',
  desc: '单脚蹦的唐伞妖：一蹦就是两格半地追过来，落地砸中身边的人还把人震开，冻住的一砸就碎；挨打时有三成几率撑开伞面 2 秒，正面 120 度来的一下都被挡下，得绕到侧面打，烧着毒着的照样掉血',
  size: 1.3,
  radius: 0.46,
  hp: 46,
  speed: 1.2,
  damage: 6,
  xp: 3,
  coins: 2,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 1800,
      firstDelayMs: 600,
      aim: 'nearest',
      range: 7,
      damage: 9,
      knockback: 3,
      fireSfx: 'jump',
      windup: { ms: 250, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'leap', distance: 2.5, ms: 380, height: 0.9, radius: 1.2 },
    },
  ],
  reactions: [{ on: 'hurt', to: 'self', chance: 0.3, effects: [{ kind: 'frontGuard', arcDeg: 120, durationMs: 2000 }] }],
} satisfies EnemyDef

export default UMBRELLA
