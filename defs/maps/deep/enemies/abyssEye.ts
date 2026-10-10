import type { EnemyDef } from '../../../../legacy/types/enemies'

const ABYSS_EYE = {
  kind: 'abyssEye',
  emoji: '1f441',
  name: '深渊之眼',
  element: 'thunder',
  desc: '从头顶的黑暗里沉下来，悬在高处和队伍隔开五格，近战够不着；盯住最近的队员牵上一道电光，2.5 秒内没挣出 6 格，那人的气被抽空，再挨 14 点的电、被打断，电流还跳给身边另一个队员，湿的连成一片一起挨；本身是雷，队伍的电流不往它身上跳',
  size: 1.3,
  radius: 0.48,
  span: [2, 3],
  hp: 80,
  speed: 1.2,
  damage: 6,
  xp: 6,
  coins: 4,
  drive: { kind: 'standoff', standoffDist: 5 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 6000,
      firstDelayMs: 1500,
      aim: 'nearest',
      range: 5.5,
      fireSfx: 'zap',
      color: 0xffd54f,
      shape: { kind: 'disc', radius: 0.4, at: 'target' },
      onHit: [
        {
          kind: 'tether',
          ms: 2500,
          range: 6,
          onHold: [{ kind: 'exhaust' }, { kind: 'damage', amount: 14 }],
          color: 0xffd54f,
        },
      ],
    },
  ],
} satisfies EnemyDef

export default ABYSS_EYE
