import type { EnemyDef } from '../../../../legacy/types/enemies'

const SHARK = {
  kind: 'shark',
  emoji: '1f988',
  name: '鲨鱼',
  desc: '游得飞快，贴上来就咬；5 格内有生命低于六成的队员，就闻着血味猛冲过去咬一大口，把人撞开；自己的血掉到一半就红了眼，4 秒内游得快四成，趁它没红眼一口气打下来',
  size: 1.5,
  radius: 0.55,
  hp: 110,
  speed: 2.6,
  damage: 8,
  xp: 6,
  coins: 4,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3000,
      firstDelayMs: 1500,
      priority: 1,
      aim: 'nearest',
      range: 5,
      requires: { kind: 'hpBelow', who: 'target', ratio: 0.6 },
      damage: 16,
      knockback: 3,
      fireSfx: 'charge',
      windup: { ms: 350, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 5, ms: 450, radius: 0.9, seek: true },
    },
    {
      trigger: 'auto',
      cooldownMs: 1200,
      firstDelayMs: 500,
      aim: 'nearest',
      range: 1.6,
      damage: 10,
      fireSfx: 'gulp',
      shape: { kind: 'segment', reach: 1.4, radius: 0.45, ms: 120 },
    },
  ],
  reactions: [{ on: 'lowHp', ratio: 0.5, to: 'self', effects: [{ kind: 'status', status: 'speed', ms: 4000, value: 1.4 }] }],
} satisfies EnemyDef

export default SHARK
