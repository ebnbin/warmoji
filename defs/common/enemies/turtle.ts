import type { EnemyDef } from '../../../src/types/enemies'

const TURTLE = {
  kind: 'turtle',
  drive: { kind: 'chase' },
  emoji: '1f30b',
  name: '火山怪',
  desc: '缓慢挪动的活火山，边逼近边朝队伍喷出一串火山石，血厚、免疫击退',
  size: 1.5,
  radius: 0.6,
  span: [0, 3],
  hp: 85,
  stats: { armor: 8 },
  speed: 0.8,
  damage: 8,
  xp: 7,
  coins: 5,
  traits: ['anchored', 'fireproof'],
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3000,
      firstDelayMs: 1500,
      aim: 'nearest',
      damage: 7,
      shape: { kind: 'bolt', projectile: { look: { emoji: '1faa8', size: 0.4, rotationOffsetDeg: 0 }, radius: 0.15, speed: 2.6, flight: { kind: 'arc', peakM: 2.2 } }, lifeMs: 5000 },
      repeat: { count: 3, spreadDeg: 36 },
    },
  ],
} satisfies EnemyDef

export default TURTLE
