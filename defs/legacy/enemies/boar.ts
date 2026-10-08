import type { EnemyDef } from '../../../src/types/enemies'

const BOAR = {
  kind: 'boar',
  emoji: '1f417',
  name: '山猪',
  desc: '发现猎物后蓄力直线突刺，横向可躲，死亡留半透明尸壳诱骗火力',
  size: 1.4,
  radius: 0.52,
  span: [0, 1],
  hp: 65,
  stats: { armor: 3 },
  speed: 1.1,
  damage: 10,
  xp: 5,
  coins: 3,
  drive: { kind: 'wander' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 1800,
      firstDelayMs: 0,
      aim: 'nearest',
      range: 4,
      windup: { ms: 550, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 3.5, ms: 437.5 },
    },
  ],
  reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'decoy', hp: 40, durationMs: 3000, alpha: 0.5 }] }],
} satisfies EnemyDef

export default BOAR
