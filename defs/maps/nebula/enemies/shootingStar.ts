import type { EnemyDef } from '../../../../legacy/types/enemies'

const SHOOTING_STAR = {
  kind: 'shootingStar',
  emoji: '1f320',
  name: '流星',
  element: 'ice',
  desc: '被流星甩进空腔的冰碎片，本身是冰，冻不住：飘在半空飞得飞快，身子不碰人；顿一下就朝人俯冲 5 格，撞上的人冷一层，越冷越慢，叠满三层就冻住；身子薄，几下就打散',
  size: 1.2,
  radius: 0.45,
  span: [1, 2],
  hp: 72,
  speed: 2.8,
  damage: 0,
  xp: 3,
  coins: 2,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2500,
      firstDelayMs: 800,
      aim: 'nearest',
      range: 5,
      damage: 12,
      fireSfx: 'whoosh',
      windup: { ms: 300, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 5, ms: 350, radius: 0.6 },
    },
  ],
} satisfies EnemyDef

export default SHOOTING_STAR
