import type { EnemyDef } from '../../../../legacy/types/enemies'

const SPIDERLING = {
  kind: 'spiderling',
  emoji: '1f577',
  name: '小蜘蛛',
  element: 'dark',
  desc: '蛛后的卵囊里孵出来的小蜘蛛，又小又快，咬一口让人腿发软',
  size: 0.75,
  radius: 0.28,
  span: [0, 0],
  hp: 14,
  speed: 2.7,
  damage: 4,
  xp: 1,
  coins: 0,
  drive: { kind: 'chase' },
  reactions: [{ on: 'touch', to: 'other', effects: [{ kind: 'slow', factor: 0.7, durationMs: 1000 }] }],
} satisfies EnemyDef

export default SPIDERLING
