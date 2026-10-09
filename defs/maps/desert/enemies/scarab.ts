import type { EnemyDef } from '../../../../legacy/types/enemies'

const SCARAB = {
  kind: 'scarab',
  emoji: '1fab2',
  name: '圣甲虫',
  element: 'fire',
  desc: '甲壳坚硬，物理打上去不太疼，本身是火、点不着，毒最管用；隔一阵团起身子，推着一团烧着的粪球朝最近的人猛滚过去，半路会跟着人拐弯，撞上的被点着，挨着站的队友会一起烧起来',
  size: 1.2,
  radius: 0.45,
  span: [0, 1],
  hp: 82,
  stats: { armor: 6 },
  speed: 1,
  damage: 6,
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
      damage: 10,
      fireSfx: 'charge',
      windup: { ms: 500, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 4, ms: 650, radius: 0.8, seek: true },
    },
  ],
} satisfies EnemyDef

export default SCARAB
