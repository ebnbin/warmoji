import type { EnemyDef } from '../../../src/types/enemies'

const INVADER = {
  kind: 'invader',
  drive: { kind: 'wander' },
  emoji: '1f47e',
  name: '外星怪',
  desc: '不追人，游荡途中朝前方吐慢速弹，死亡放一记冷枪',
  size: 1.25,
  radius: 0.48,
  hp: 40,
  speed: 0.9,
  damage: 6,
  xp: 4,
  coins: 3,
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2800,
      aim: 'move',
      damage: 6,
      shape: { kind: 'bolt', projectile: { look: { emoji: '1f534', size: 0.4, rotationOffsetDeg: 0 }, radius: 0.14, speed: 3 }, lifeMs: 4500 },
    },
  ],
  reactions: [
    {
      on: 'death',
      to: 'spot',
      effects: [
        {
          kind: 'spawnProjectile',
          aim: 'nearest',
          damage: 8,
          lifeMs: 6000,
          projectile: { look: { emoji: '1f6f8', size: 0.6, rotationOffsetDeg: 0 }, radius: 0.2, speed: 1.5 },
        },
      ],
    },
  ],
} satisfies EnemyDef

export default INVADER
