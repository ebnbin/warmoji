import type { EnemyDef } from '../../../src/types/enemies'

const LOCUST = {
  kind: 'locust',
  emoji: '1f997',
  name: '跳蝗',
  desc: '成群蝗虫一蹦一蹦地扑来，脆皮但高频跳突，专挤压走位空间',
  size: 0.9,
  radius: 0.35,
  span: [0, 0],
  hp: 17,
  stats: { dodge: 0.15, exertion: 0 },
  speed: 1.0,
  damage: 4,
  xp: 2,
  coins: 1,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 1400,
      firstDelayMs: 600,
      aim: 'nearest',
      windup: { ms: 200, lockAt: 'end', telegraph: 'shake' },
      shape: { kind: 'sprint', distance: 2.2, ms: 314.3 },
    },
  ],
} satisfies EnemyDef

export default LOCUST
