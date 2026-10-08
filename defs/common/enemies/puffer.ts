import type { EnemyDef } from '../../../src/types/enemies'

const PUFFER = {
  kind: 'puffer',
  emoji: '1f421',
  name: '毒河豚',
  desc: '鼓胀的毒河豚，贴身即鼓爆一团毒气冲击；被戳破则炸开一大片残留毒云，别在走位线上戳它',
  size: 1.3,
  radius: 0.5,
  span: [1, 2],
  hp: 45,
  speed: 1.2,
  damage: 5,
  xp: 5,
  coins: 4,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 0,
      firstDelayMs: 0,
      aim: 'nearest',
      range: 2.0,
      windup: { ms: 700, lockAt: 'start', telegraph: 'blink' },
      damage: 22,
      color: 0xff5252,
      fireSfx: 'boom',
      shape: { kind: 'disc', radius: 2.8, at: 'self' },
      reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'vanish' }] }],
    },
  ],
  reactions: [
    {
      on: 'death',
      to: 'spot',
      effects: [
        {
          kind: 'ground',
          def: {
            radius: 2.2,
            durationMs: 3200,
            tickMs: 500,
            damage: 5,
            color: 0x8bc34a,
            fillAlpha: 0.24,
            lineAlpha: 0.5,
            enterMs: 220,
          },
        },
      ],
    },
  ],
} satisfies EnemyDef

export default PUFFER
