import type { EnemyDef } from '../../../../legacy/types/enemies'
import { shot } from '../../../kit.ts'

const CACTUS = {
  kind: 'cactus',
  emoji: '1f335',
  name: '仙人掌怪',
  desc: '从沙里冒出来就扎根不动，标志物旁也常冒出它来；浑身是刺：有人走进 4.5 格就朝四面八方射出 12 根刺，贴上去会被扎，近身打它每一下都会被扎回来；护甲厚，烧它、毒它最省事',
  size: 1.5,
  radius: 0.52,
  hp: 120,
  stats: { armor: 4, thorns: 4 },
  speed: 0,
  damage: 8,
  xp: 6,
  coins: 4,
  traits: ['anchored'],
  drive: { kind: 'stay' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2600,
      firstDelayMs: 600,
      aim: 'nearest',
      range: 4.5,
      damage: 6,
      fireSfx: 'shoot',
      shape: { kind: 'bolt', projectile: shot('1faa1', 7, 0.5, 225), lifeMs: 900 },
      repeat: { count: 12, spreadDeg: 360 },
    },
  ],
} satisfies EnemyDef

export default CACTUS
