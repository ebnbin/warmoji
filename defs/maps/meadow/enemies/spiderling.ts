import type { EnemyDef } from '../../../../legacy/types/enemies'

const SPIDERLING = {
  kind: 'spiderling',
  emoji: '1f577',
  name: '小蜘蛛',
  desc: '蛛后的卵囊里孵出来的小蜘蛛，又小又快，一窝蜂扑上来贴身乱咬；血薄，一扫一片',
  size: 0.75,
  radius: 0.28,
  span: [0, 0],
  hp: 14,
  speed: 2.7,
  damage: 5,
  xp: 1,
  coins: 0,
  drive: { kind: 'chase' },
} satisfies EnemyDef

export default SPIDERLING
