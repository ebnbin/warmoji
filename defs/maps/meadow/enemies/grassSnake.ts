import type { EnemyDef } from '../../../../legacy/types/enemies'

const GRASS_SNAKE = {
  kind: 'grassSnake',
  emoji: '1f40d',
  name: '草蛇',
  element: 'poison',
  desc: '贴着草皮游过来，窜起来咬一口叠一层中毒，几条一起咬叠得飞快，中了毒什么回复都不管用；本身是毒、不会中毒；个子矮，平射的子弹容易从它头上飞过去',
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
      cooldownMs: 1800,
      firstDelayMs: 400,
      aim: 'nearest',
      range: 1.8,
      damage: 7,
      fireSfx: 'whoosh',
      windup: { ms: 260, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'segment', reach: 0.8, radius: 0.4, ms: 120, lungeDist: 0.8 },
    },
  ],
} satisfies EnemyDef

export default GRASS_SNAKE
