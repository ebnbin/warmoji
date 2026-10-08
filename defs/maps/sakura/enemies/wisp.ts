import type { EnemyDef } from '../../../../src/types/enemies'

const WISP = {
  kind: 'wisp',
  emoji: '1f47b',
  name: '游魂',
  element: 'dark',
  desc: '从樱林里慢慢飘出来的游魂，穿得过墙、飘得过溪：贴上谁就吸一口，回自己 8% 的生命；隔一阵就虚化 1.2 秒，这时什么都打不中它',
  size: 1.2,
  radius: 0.44,
  span: [1, 2],
  hp: 32,
  speed: 1.4,
  damage: 6,
  xp: 3,
  coins: 2,
  traits: ['phases'],
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 6000,
      firstDelayMs: 2500,
      aim: 'self',
      fireSfx: 'warp',
      shape: { kind: 'world' },
      reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'untargetable', durationMs: 1200 }] }],
    },
  ],
  reactions: [{ on: 'touch', to: 'other', effects: [{ kind: 'to', who: { side: 'self' }, then: [{ kind: 'healRatio', ratio: 0.08 }] }] }],
} satisfies EnemyDef

export default WISP
