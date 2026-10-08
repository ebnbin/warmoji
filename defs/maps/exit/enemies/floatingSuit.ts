import type { EnemyDef } from '../../../../src/types/enemies'
import { shot } from '../../../kit.ts'

const FLOATING_SUIT = {
  kind: 'floatingSuit',
  emoji: '1f574',
  name: '悬浮西装男',
  element: 'dark',
  desc: '西装笔挺地飘在半空，和人隔着 3.5 格；每 3.5 秒朝最近的人隐身穿行 4 格，冷不丁出现在跟前，再甩出公文包砸人',
  size: 1.4,
  radius: 0.5,
  span: [1, 2],
  hp: 120,
  speed: 1.4,
  damage: 10,
  xp: 6,
  coins: 4,
  drive: { kind: 'standoff', standoffDist: 3.5 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3500,
      firstDelayMs: 2000,
      aim: 'nearest',
      range: 8,
      fireSfx: 'warp',
      shape: { kind: 'world' },
      reactions: [{ on: 'fire', to: 'self', effects: [{ kind: 'warp', distance: 4 }] }],
    },
    {
      trigger: 'auto',
      cooldownMs: 2200,
      firstDelayMs: 1200,
      aim: 'nearest',
      range: 7,
      damage: 14,
      fireSfx: 'shoot',
      shape: { kind: 'bolt', projectile: shot('1f4bc', 7, 0.5), lifeMs: 1400 },
    },
  ],
} satisfies EnemyDef

export default FLOATING_SUIT
