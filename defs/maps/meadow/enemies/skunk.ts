import type { EnemyDef } from '../../../../src/types/enemies'
import { patch } from '../../../kit.ts'

const STINK = [{ kind: 'attackSlow', mul: 1.5, durationMs: 600 }] as const

const SKUNK = {
  kind: 'skunk',
  emoji: '1f9a8',
  name: '臭鼬',
  element: 'wood',
  desc: '挨打时尾巴一翘放一团臭气，臭气里的人出手变慢；倒下时放一大团',
  size: 1.2,
  radius: 0.45,
  span: [0, 1],
  hp: 42,
  speed: 1.5,
  damage: 5,
  xp: 4,
  coins: 3,
  drive: { kind: 'chase' },
  reactions: [
    { on: 'hurt', to: 'self', chance: 0.35, effects: [{ kind: 'ground', def: patch(1.5, 3500, 0xaed581, STINK) }] },
    { on: 'death', to: 'spot', effects: [{ kind: 'ground', def: patch(2.4, 6000, 0xaed581, STINK) }] },
  ],
} satisfies EnemyDef

export default SKUNK
