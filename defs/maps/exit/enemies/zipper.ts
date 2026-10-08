import type { EnemyDef } from '../../../../src/types/enemies'
import { shot } from '../../../kit.ts'

const ZIPPER = {
  kind: 'zipper',
  emoji: '1f910',
  name: '拉链嘴',
  element: 'dark',
  desc: '嘴上拉着拉链，隔着 4 格远远站着，射出一枚拉链，被打中的人 1.5 秒放不了技能',
  size: 1.25,
  radius: 0.46,
  hp: 68,
  speed: 1.6,
  damage: 10,
  xp: 3,
  coins: 2,
  drive: { kind: 'standoff', standoffDist: 4 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 2600,
      firstDelayMs: 900,
      aim: 'nearest',
      range: 6,
      damage: 12,
      fireSfx: 'shoot',
      shape: { kind: 'bolt', projectile: shot('1f587', 8, 0.45), lifeMs: 1000 },
      onHit: [{ kind: 'silence', durationMs: 1500 }],
    },
  ],
} satisfies EnemyDef

export default ZIPPER
