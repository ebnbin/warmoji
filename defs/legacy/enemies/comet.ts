import type { EnemyDef } from '../../../src/types/enemies'

const COMET = {
  kind: 'comet',
  emoji: '2604',
  name: '彗星',
  desc: '拖着尾焰蓄势，锁定后直线疾冲，横向可躲',
  size: 1.3,
  radius: 0.5,
  span: [1, 2],
  hp: 26,
  stats: { dodge: 0.15, exertion: 0 },
  speed: 1.4,
  damage: 12,
  xp: 5,
  coins: 3,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 1600,
      firstDelayMs: 0,
      aim: 'nearest',
      range: 5,
      windup: { ms: 240, lockAt: 'end', telegraph: 'shake' },
      fireSfx: 'whoosh',
      shape: { kind: 'sprint', distance: 2.8, ms: 350 },
    },
  ],
} satisfies EnemyDef

export default COMET
