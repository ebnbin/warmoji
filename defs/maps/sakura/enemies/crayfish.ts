import type { EnemyDef } from '../../../../legacy/types/enemies'

const CRAYFISH = {
  kind: 'crayfish',
  emoji: '1f99e',
  name: '溪虾',
  element: 'water',
  desc: '从溪岸爬上来的溪虾，溪水冲不走它，追人时照样下水：钳子一夹，被夹住的 1 秒走不动；挨打时有三成几率缩进壳里，2 秒内受到的伤害减半',
  size: 1.25,
  radius: 0.46,
  span: [0, 1],
  hp: 62,
  stats: { armor: 4 },
  speed: 1.3,
  damage: 6,
  xp: 5,
  coins: 4,
  traits: ['swims'],
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2400,
      firstDelayMs: 600,
      aim: 'nearest',
      range: 1.7,
      damage: 10,
      fireSfx: 'chip',
      windup: { ms: 320, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'segment', reach: 1.4, radius: 0.4, ms: 140 },
      onHit: [{ kind: 'root', durationMs: 1000 }],
    },
  ],
  reactions: [{ on: 'hurt', to: 'self', chance: 0.3, effects: [{ kind: 'guard', mul: 0.5, durationMs: 2000 }] }],
} satisfies EnemyDef

export default CRAYFISH
