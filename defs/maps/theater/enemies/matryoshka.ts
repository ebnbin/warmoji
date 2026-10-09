import type { EnemyDef } from '../../../../legacy/types/enemies'
import MATRYOSHKA_MID from './matryoshkaMid.ts'

const MATRYOSHKA = {
  kind: 'matryoshka',
  emoji: '1fa86',
  name: '套娃',
  desc: '又慢又结实的套娃，木壳最厚（护甲 10），刀剑砍着费劲，烧和毒却不吃护甲；蓄一下就一头撞过来，撞中的被撞飞；打碎了裂成两个中套娃，中套娃再裂成两个小套娃，越打越多、挤成一堆，一着火就烧一片',
  size: 1.4,
  radius: 0.6,
  hp: 130,
  stats: { armor: 10 },
  speed: 0.9,
  damage: 10,
  xp: 6,
  coins: 5,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 4000,
      firstDelayMs: 2000,
      aim: 'nearest',
      range: 2.8,
      damage: 16,
      knockback: 2.5,
      fireSfx: 'thud',
      windup: { ms: 600, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 2.5, ms: 340, radius: 0.7 },
    },
  ],
  reactions: [{ on: 'death', to: 'spot', effects: [{ kind: 'split', into: MATRYOSHKA_MID, count: 2 }] }],
} satisfies EnemyDef

export default MATRYOSHKA
