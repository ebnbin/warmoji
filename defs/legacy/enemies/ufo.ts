import type { EnemyDef } from '../../../src/types/enemies'

const UFO = {
  kind: 'ufo',
  emoji: '1f6f8',
  name: '飞碟',
  desc: '悬停的碟形来客，绕着队伍维持定距，站定俯射能量弹',
  size: 1.35,
  radius: 0.5,
  span: [2, 3],
  hp: 44,
  stats: { dodge: 0.2, exertion: 0 },
  speed: 1.8,
  damage: 6,
  xp: 5,
  coins: 4,
  drive: { kind: 'standoff', standoffDist: 6 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2400,
      aim: 'nearest',
      range: 9,
      damage: 6,
      shape: { kind: 'bolt', projectile: { look: { emoji: '1f7e1', size: 0.45, rotationOffsetDeg: 0 }, radius: 0.15, speed: 3.4 }, lifeMs: 4500 },
    },
  ],
} satisfies EnemyDef

export default UFO
