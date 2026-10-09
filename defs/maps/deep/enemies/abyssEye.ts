import type { EnemyDef } from '../../../../legacy/types/enemies'

const ABYSS_EYE = {
  kind: 'abyssEye',
  emoji: '1f441',
  name: '深渊之眼',
  element: 'dark',
  desc: '从头顶的黑暗里沉下来，悬在高处和队伍隔开五格；盯住最近的队员牵上一道暗光，2.5 秒内没挣出 6 格，那人的气就被抽空，3 秒内受到的伤害 ×1.2',
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
      fireSfx: 'warp',
      color: 0x7e57c2,
      shape: { kind: 'disc', radius: 0.4, at: 'target' },
      onHit: [
        {
          kind: 'tether',
          ms: 2500,
          range: 6,
          onHold: [{ kind: 'exhaust' }, { kind: 'status', status: 'exposed', ms: 3000, value: 1.2 }],
          color: 0x7e57c2,
        },
      ],
    },
  ],
} satisfies EnemyDef

export default ABYSS_EYE
