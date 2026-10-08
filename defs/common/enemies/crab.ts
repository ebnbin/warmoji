import type { EnemyDef } from '../../../src/types/enemies'

const CRAB = {
  kind: 'crab',
  drive: { kind: 'chase' },
  emoji: '1fab2',
  name: '铁甲虫',
  desc: '顶着硬甲壳往前拱，正面来的攻击全被挡下，得绕到侧面、背后，或者把它掀翻再打',
  size: 1.35,
  radius: 0.5,
  span: [0, 0],
  hp: 60,
  stats: { armor: 2 },
  speed: 1.1,
  damage: 8,
  xp: 6,
  coins: 4,
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 1000,
      firstDelayMs: 0,
      aim: 'self',
      shape: { kind: 'world' },
      reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'frontGuard', durationMs: 1300, arcDeg: 150 }] }],
    },
  ],
} satisfies EnemyDef

export default CRAB
