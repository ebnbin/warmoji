import type { EnemyDef } from '../../../../legacy/types/enemies'

const BULL = {
  kind: 'bull',
  emoji: '1f402',
  name: '公牛',
  element: 'earth',
  desc: '从牧场的栅栏翻进来，红着眼只盯队长；隔一阵蓄力狂冲一长段，冲撞时什么控制都不吃',
  size: 1.6,
  radius: 0.6,
  span: [0, 2],
  hp: 140,
  stats: { armor: 4 },
  speed: 0.9,
  damage: 10,
  xp: 8,
  coins: 5,
  drive: { kind: 'chase', at: 'leader' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 5200,
      firstDelayMs: 1800,
      aim: 'leader',
      range: 8,
      damage: 18,
      knockback: 6,
      fireSfx: 'charge',
      windup: { ms: 900, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 8, ms: 800, radius: 1 },
      reactions: [{ on: 'cast', to: 'self', effects: [{ kind: 'unstoppable', durationMs: 1000 }] }],
    },
  ],
} satisfies EnemyDef

export default BULL
