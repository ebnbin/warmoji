import type { EnemyDef } from '../../../../legacy/types/enemies'

const STEAMER = {
  kind: 'steamer',
  emoji: '1f624',
  name: '喷气怪',
  element: 'water',
  desc: '从喷气孔里钻出来，鼓着腮帮慢慢挪近；凑到身边就憋足一口气，朝身周两格喷出蒸汽，把人掀到半空',
  size: 1.35,
  radius: 0.5,
  hp: 120,
  speed: 0.9,
  damage: 9,
  xp: 6,
  coins: 4,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3500,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 2.2,
      damage: 12,
      color: 0xeceff1,
      fireSfx: 'gust',
      windup: { ms: 600, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'disc', radius: 2, at: 'self' },
      onHit: [{ kind: 'knockup', durationMs: 700, height: 1.2 }],
    },
  ],
} satisfies EnemyDef

export default STEAMER
