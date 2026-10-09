import type { EnemyDef } from '../../../../legacy/types/enemies'
import { shot } from '../../../kit.ts'

const TRAGEDY_MASK = {
  kind: 'tragedyMask',
  emoji: '1f62d',
  name: '悲剧面具',
  element: 'water',
  desc: '飘在半空的悲剧面具，本身总是湿的，怕雷怕冰：离人四格远远地哭，一次洒出三滴眼泪，沾上的人湿透 5 秒，点不着火，可一冰就冻、一电就连成一片',
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
      damage: 8,
      fireSfx: 'plip',
      shape: { kind: 'bolt', projectile: shot('1f4a7', 6, 0.4, -90), lifeMs: 1600 },
      repeat: { count: 3, spreadDeg: 30 },
    },
  ],
} satisfies EnemyDef

export default TRAGEDY_MASK
