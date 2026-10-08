import type { EnemyDef } from '../../../src/types/enemies'

const CHAMELEON = {
  kind: 'chameleon',
  drive: { kind: 'chase' },
  emoji: '1f98e',
  name: '变色龙',
  desc: '两秒没出手就融进背景，瞄准类的攻击找不到它；伸舌出手的一刻现形',
  size: 1.2,
  radius: 0.45,
  span: [0, 0],
  hp: 38,
  stats: { dodge: 0.15 },
  speed: 2,
  damage: 0,
  xp: 5,
  coins: 3,
  reactions: [{ on: 'idle', ms: 2000, to: 'self', effects: [{ kind: 'stealth' }] }],
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 1600,
      firstDelayMs: 0,
      aim: 'nearest',
      range: 2.2,
      damage: 14,
      color: 0xa5d6a7,
      shape: { kind: 'segment', reach: 2, radius: 0.35, ms: 160, beam: true },
    },
  ],
} satisfies EnemyDef

export default CHAMELEON
