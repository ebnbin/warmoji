import type { EnemyDef } from '../../../../src/types/enemies'

const WOLF = {
  kind: 'wolf',
  emoji: '1f43a',
  name: '狼',
  element: 'earth',
  desc: '在林间成群游荡，盯上人就小跑追来，进到三格内伏低身子猛扑过去',
  size: 1.3,
  radius: 0.48,
  span: [0, 1],
  hp: 34,
  speed: 2.1,
  damage: 6,
  xp: 3,
  coins: 2,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2800,
      firstDelayMs: 600,
      aim: 'nearest',
      range: 3.2,
      damage: 9,
      knockback: 1.5,
      fireSfx: 'jump',
      windup: { ms: 380, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'leap', distance: 3, ms: 360, height: 0.6, radius: 0.8 },
    },
  ],
} satisfies EnemyDef

export default WOLF
