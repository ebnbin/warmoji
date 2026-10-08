import type { EnemyDef } from '../../../src/types/enemies'

const SNAKE = {
  kind: 'snake',
  emoji: '1f40d',
  name: '毒蛇',
  desc: '围着玩家维持定距，站定吐毒弹，太近才后退',
  size: 1.25,
  radius: 0.45,
  span: [0, 0],
  hp: 32,
  stats: { dodge: 0.1, exertion: 0 },
  speed: 2.4,
  damage: 5,
  xp: 4,
  coins: 3,
  drive: { kind: 'standoff', detectRange: 8, standoffDist: 5 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2600,
      aim: 'nearest',
      range: 8,
      damage: 5,
      shape: { kind: 'bolt', projectile: { look: { emoji: '1f7e2', size: 0.4, rotationOffsetDeg: 0 }, radius: 0.14, speed: 3.2 }, lifeMs: 4500 },
    },
  ],
} satisfies EnemyDef

export default SNAKE
