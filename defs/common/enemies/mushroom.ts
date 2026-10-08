import type { EnemyDef } from '../../../src/types/enemies'

const MUSHROOM = {
  kind: 'mushroom',
  drive: { kind: 'chase' },
  emoji: '1f344',
  name: '毒蘑菇',
  desc: '死亡时在原地留下一片毒液',
  size: 1.25,
  radius: 0.46,
  hp: 50,
  speed: 1,
  damage: 6,
  xp: 4,
  coins: 3,
  reactions: [
    {
      on: 'death',
      to: 'spot',
      effects: [
        {
          kind: 'ground',
          def: {
            radius: 1.6,
            durationMs: 3000,
            tickMs: 500,
            damage: 4,
            color: 0x7cb342,
            fillAlpha: 0.22,
            lineAlpha: 0.5,
            enterMs: 220,
          },
        },
      ],
    },
  ],
} satisfies EnemyDef

export default MUSHROOM
