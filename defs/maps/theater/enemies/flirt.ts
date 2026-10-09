import type { EnemyDef } from '../../../../legacy/types/enemies'
import { shot } from '../../../kit.ts'

const FLIRT = {
  kind: 'flirt',
  emoji: '1f618',
  name: '飞吻演员',
  element: 'poison',
  desc: '离人四格远远站着抛飞吻，飞吻带毒，会拐着弯追人，挨上的人中一层毒、1.2 秒里被迷得朝飞吻演员走过去；本身是毒，毒不倒它',
  size: 1.25,
  radius: 0.46,
  hp: 90,
  speed: 1.5,
  damage: 9,
  xp: 6,
  coins: 4,
  drive: { kind: 'standoff', standoffDist: 4 },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 3000,
      firstDelayMs: 1200,
      aim: 'nearest',
      range: 7,
      damage: 9,
      fireSfx: 'chirp',
      shape: { kind: 'bolt', projectile: { ...shot('1f48b', 5, 0.5), flight: { kind: 'homing', degPerSec: 120 } }, lifeMs: 2400 },
      onHit: [{ kind: 'charm', durationMs: 1200 }],
    },
  ],
} satisfies EnemyDef

export default FLIRT
