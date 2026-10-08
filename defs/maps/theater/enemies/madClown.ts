import type { EnemyDef } from '../../../../src/types/enemies'
import { patch, ring, shot } from '../../../kit.ts'

const MAD_CLOWN = {
  kind: 'madClown',
  emoji: '1f921',
  name: '疯小丑',
  element: 'fire',
  desc: '追着人跑的疯小丑，隔一阵抛出炮仗，砸中人就炸开，1.3 格内的人一起挨炸；倒下时自己也原地炸开，炸伤 1.6 格内的人',
  size: 1.3,
  radius: 0.48,
  hp: 85,
  speed: 2,
  damage: 10,
  xp: 4,
  coins: 2,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2600,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 6,
      damage: 13,
      fireSfx: 'whoosh',
      shape: { kind: 'bolt', projectile: { ...shot('1f9e8', 6, 0.5), flight: { kind: 'arc', peakM: 1.4 } }, lifeMs: 1500 },
      onHit: [{ kind: 'blast', radius: 1.3, ratio: 1, knockback: 2, ring: ring(0xff7043) }],
    },
  ],
  reactions: [
    {
      on: 'death',
      to: 'spot',
      effects: [
        { kind: 'ground', def: patch(1.6, 300, 0xff7043) },
        { kind: 'to', who: { side: 'foes', radius: 1.6 }, then: [{ kind: 'damage', amount: 16 }] },
      ],
    },
  ],
} satisfies EnemyDef

export default MAD_CLOWN
