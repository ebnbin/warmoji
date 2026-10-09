import type { EnemyDef } from '../../../../src/types/enemies'
import { shot } from '../../../kit.ts'

const SPACE_INVADER = {
  kind: 'spaceInvader',
  emoji: '1f47e',
  name: '入侵者',
  element: 'thunder',
  desc: '像素块拼成的小怪物，追着人跑，有人在 7 格内时每 2 秒朝自己前进的方向射一发激光；倒下时朝最近的人放一发慢悠悠的冷枪',
  size: 1.2,
  radius: 0.45,
  hp: 80,
  speed: 1.4,
  damage: 11,
  xp: 3,
  coins: 2,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2000,
      firstDelayMs: 1000,
      aim: 'move',
      damage: 13,
      fireSfx: 'shoot',
      when: { kind: 'foesNear', who: 'self', radius: 7, atLeast: 1 },
      shape: { kind: 'bolt', projectile: shot('1f7e8', 8, 0.32), lifeMs: 1200 },
    },
  ],
  reactions: [
    {
      on: 'death',
      to: 'spot',
      effects: [{ kind: 'spawnProjectile', aim: 'nearest', damage: 12, lifeMs: 6000, projectile: shot('1f7e5', 2, 0.4) }],
    },
  ],
} satisfies EnemyDef

export default SPACE_INVADER
