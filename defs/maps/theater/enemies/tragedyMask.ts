import type { EnemyDef } from '../../../../src/types/enemies'
import { shot } from '../../../kit.ts'

const TRAGEDY_MASK = {
  kind: 'tragedyMask',
  emoji: '1f62d',
  name: '悲剧面具',
  element: 'water',
  desc: '飘在半空的悲剧面具，离人四格远远地哭，一次洒出三滴眼泪，沾上的人 1 秒内走得慢两成',
  size: 1.2,
  radius: 0.45,
  span: [1, 2],
  hp: 60,
  speed: 1.4,
  damage: 9,
  xp: 3,
  coins: 2,
  drive: { kind: 'standoff', standoffDist: 4 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2400,
      firstDelayMs: 1000,
      aim: 'nearest',
      range: 6,
      damage: 11,
      fireSfx: 'plip',
      shape: { kind: 'bolt', projectile: shot('1f4a7', 6, 0.4, -90), lifeMs: 1600 },
      repeat: { count: 3, spreadDeg: 30 },
      onHit: [{ kind: 'slow', factor: 0.8, durationMs: 1000 }],
    },
  ],
} satisfies EnemyDef

export default TRAGEDY_MASK
