import type { EnemyDef } from '../../../../legacy/types/enemies'
import SPIDER_WEB from './spiderWeb.ts'

const SPIDER_EGG = {
  kind: 'spiderEgg',
  emoji: '1faba',
  name: '蜘蛛卵',
  desc: '蛛后产在草里的一窝卵，原地不动，6 秒内不打破就结成一张会缠人的蜘蛛网',
  size: 1,
  radius: 0.4,
  span: [0, 0],
  hp: 40,
  speed: 0,
  damage: 0,
  xp: 1,
  coins: 0,
  traits: ['anchored'],
  drive: { kind: 'stay' },
  grow: { ms: 6000, into: SPIDER_WEB },
} satisfies EnemyDef

export default SPIDER_EGG
