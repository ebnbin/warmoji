import type { EnemyDef } from '../../../../legacy/types/enemies'

const SCARAB = {
  kind: 'scarab',
  emoji: '1fab2',
  name: '圣甲虫',
  desc: '甲壳坚硬；隔一阵团起身子，像推粪球一样朝最近的人猛滚过去，半路会跟着人拐弯，撞上的被顶开',
  size: 1.2,
  radius: 0.45,
  span: [0, 1],
  hp: 82,
  stats: { armor: 6 },
  speed: 1,
  damage: 7,
  xp: 5,
  coins: 3,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3600,
      firstDelayMs: 1200,
      aim: 'nearest',
      range: 4.5,
      damage: 12,
      knockback: 3,
      fireSfx: 'charge',
      windup: { ms: 500, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 4, ms: 650, radius: 0.8, seek: true },
    },
  ],
} satisfies EnemyDef

export default SCARAB
