import type { EnemyDef } from '../../../../src/types/enemies'

const GRASS_SNAKE = {
  kind: 'grassSnake',
  emoji: '1f40d',
  name: '草蛇',
  element: 'wood',
  desc: '贴着草皮游过来，窜起来咬一口带毒；个子矮，平射的子弹容易从它头上飞过去',
  size: 1.15,
  radius: 0.42,
  span: [0, 0],
  hp: 26,
  speed: 2,
  damage: 4,
  xp: 3,
  coins: 2,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2200,
      firstDelayMs: 400,
      aim: 'nearest',
      range: 1.8,
      damage: 6,
      fireSfx: 'whoosh',
      windup: { ms: 260, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'segment', reach: 0.8, radius: 0.4, ms: 120, lungeDist: 0.8 },
      onHit: [{ kind: 'poison', damage: 3, tickMs: 600, durationMs: 3600 }],
    },
  ],
} satisfies EnemyDef

export default GRASS_SNAKE
