import type { EnemyDef } from '../../../../src/types/enemies'
import { shot } from '../../../kit.ts'

const TEMPLE_MONKEY = {
  kind: 'templeMonkey',
  emoji: '1f435',
  name: '寺猴',
  element: 'wood',
  desc: '寺院里的猴子：绕着人保持三四格远，抛桃核砸人；挨打时有三成几率猛地提速 1.5 秒，蹿得飞快',
  size: 1.15,
  radius: 0.42,
  hp: 40,
  speed: 2.4,
  damage: 6,
  xp: 3,
  coins: 2,
  drive: { kind: 'standoff', standoffDist: 3.5 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2200,
      firstDelayMs: 900,
      aim: 'nearest',
      range: 5.5,
      damage: 8,
      fireSfx: 'whoosh',
      shape: { kind: 'bolt', projectile: { ...shot('1f351', 7, 0.45), flight: { kind: 'arc', peakM: 1.3 } }, lifeMs: 1200 },
    },
  ],
  reactions: [{ on: 'hurt', to: 'self', chance: 0.3, effects: [{ kind: 'status', status: 'speed', ms: 1500, value: 1.7 }] }],
} satisfies EnemyDef

export default TEMPLE_MONKEY
