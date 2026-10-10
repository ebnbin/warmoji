import type { EnemyDef } from '../../../../legacy/types/enemies'

const BULL = {
  kind: 'bull',
  emoji: '1f402',
  name: '公牛',
  element: 'fire',
  desc: '从牧场的栅栏翻进来，怒火中烧，红着眼只盯队长；本身是火、点不着，碰到它的人身上着火；隔一阵刨蹄蓄力 0.9 秒，朝队长狂冲 8 格，冲撞时什么控制都不吃，撞中的被顶开、身上着火，火会烧到贴着的队友；蓄力时挨一下雷就冲不出去',
  size: 1.6,
  radius: 0.6,
  span: [0, 2],
  hp: 130,
  stats: { armor: 2 },
  speed: 0.9,
  damage: 10,
  xp: 8,
  coins: 5,
  drive: { kind: 'chase', at: 'leader' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 5200,
      firstDelayMs: 1800,
      aim: 'leader',
      range: 8,
      damage: 14,
      knockback: 3,
      fireSfx: 'charge',
      color: 0xff7043,
      windup: { ms: 900, lockAt: 'start', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 8, ms: 800, radius: 1 },
      reactions: [{ on: 'cast', to: 'self', effects: [{ kind: 'unstoppable', durationMs: 1000 }] }],
    },
  ],
} satisfies EnemyDef

export default BULL
