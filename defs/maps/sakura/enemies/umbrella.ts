import type { EnemyDef } from '../../../../src/types/enemies'

const UMBRELLA = {
  kind: 'umbrella',
  emoji: '2602',
  name: '唐伞妖',
  element: 'dark',
  desc: '单脚蹦的唐伞妖：一蹦就是两格半地追过来，落地砸中身边的人还把人震开',
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
} satisfies EnemyDef

export default UMBRELLA
