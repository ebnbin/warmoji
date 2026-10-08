import type { EnemyDef } from '../../../../src/types/enemies'
import { shot } from '../../../kit.ts'

const SPACE_INVADER = {
  kind: 'spaceInvader',
  emoji: '1f47e',
  name: '入侵者',
  element: 'thunder',
  desc: '像素块拼成的小怪物，追着人跑，每两秒朝 7 格内最近的人射一发激光',
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
      aim: 'nearest',
      range: 7,
      damage: 13,
      fireSfx: 'shoot',
      shape: { kind: 'bolt', projectile: shot('1f7e8', 8, 0.32), lifeMs: 1200 },
    },
  ],
} satisfies EnemyDef

export default SPACE_INVADER
