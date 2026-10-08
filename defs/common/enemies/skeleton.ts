import type { EnemyDef } from '../../../src/types/enemies'

const SKELETON = {
  kind: 'skeleton',
  drive: { kind: 'chase' },
  emoji: '1f480',
  name: '骷髅兵',
  desc: '打散了还会爬起来：第一次生命归零时回到六成，之后三秒内加速扑来、生命流尽才真正散架',
  size: 1.25,
  radius: 0.46,
  hp: 50,
  speed: 1.5,
  damage: 7,
  xp: 4,
  coins: 3,
  reactions: [
    {
      on: 'lethal',
      to: 'self',
      effects: [
        { kind: 'undead', ms: 3000, hpRatio: 0.6 },
        { kind: 'buff', speedMul: 1.5, damageMul: 1.3, durationMs: 3000 },
      ],
    },
  ],
} satisfies EnemyDef

export default SKELETON
