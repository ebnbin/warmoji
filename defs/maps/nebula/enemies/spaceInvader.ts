import type { EnemyDef } from '../../../../legacy/types/enemies'
import { shot } from '../../../kit.ts'

const SPACE_INVADER = {
  kind: 'spaceInvader',
  emoji: '1f47e',
  name: '入侵者',
  element: 'thunder',
  desc: '像素块拼成的小怪物，本身是雷，别处跳来的电流跳不到它身上：追着人跑，有人在 7 格内时每 2 秒朝自己前进的方向射一发电光，打中的人出手被打断，电流再跳到身边的另一名队员，挤在一起的跑不掉；倒下时朝最近的人放一发慢悠悠的电光',
  size: 1.2,
  radius: 0.45,
  hp: 80,
  speed: 1.4,
  damage: 9,
  xp: 3,
  coins: 2,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2000,
      firstDelayMs: 1000,
      aim: 'move',
      damage: 10,
      fireSfx: 'shoot',
      when: { kind: 'foesNear', who: 'self', radius: 7, atLeast: 1 },
      shape: { kind: 'bolt', projectile: shot('1f7e8', 8, 0.32), lifeMs: 1200 },
    },
  ],
  reactions: [
    {
      on: 'death',
      to: 'spot',
      effects: [{ kind: 'spawnProjectile', aim: 'nearest', damage: 9, lifeMs: 6000, projectile: shot('1f7e8', 2, 0.4) }],
    },
  ],
} satisfies EnemyDef

export default SPACE_INVADER
