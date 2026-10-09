import type { EnemyDef } from '../../../../legacy/types/enemies'

const LURKER = {
  kind: 'lurker',
  emoji: '1f440',
  name: '暗眼',
  element: 'dark',
  desc: '一双藏在暗处的眼睛：摸到离人 5 格就停下，一动不动 1.5 秒便隐进黑暗，出手才现形；有人走进 2.5 格就猛扑过去咬一口',
  size: 1.1,
  radius: 0.42,
  hp: 60,
  speed: 1.8,
  damage: 8,
  xp: 4,
  coins: 3,
  drive: { kind: 'chase' },
  drives: [
    {
      if: { kind: 'all', of: [{ kind: 'within', who: 'target', radius: 5 }, { kind: 'not', cond: { kind: 'within', who: 'target', radius: 2.5 } }] },
      drive: { kind: 'stay' },
    },
  ],
  reactions: [{ on: 'idle', ms: 1500, still: true, to: 'self', effects: [{ kind: 'stealth' }] }],
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3000,
      firstDelayMs: 500,
      aim: 'nearest',
      range: 2.5,
      damage: 14,
      knockback: 1.5,
      fireSfx: 'jump',
      windup: { ms: 250, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 3, ms: 260, radius: 0.8 },
    },
  ],
} satisfies EnemyDef

export default LURKER
