import type { EnemyDef } from '../../../../legacy/types/enemies'
import { COMBAT } from '../../../combat.ts'

const UPSIDE_DOWN = {
  kind: 'upsideDown',
  emoji: '1f643',
  name: '倒脸',
  element: 'thunder',
  desc: '倒着长的脸慢吞吞地追来；每隔 5 秒和 6 格内最近的队员对调位置，换过去的人落地后麻 0.4 秒',
  size: 1.25,
  radius: 0.46,
  hp: 120,
  speed: 1.5,
  damage: 11,
  xp: 6,
  coins: 4,
  drive: { kind: 'chase' },
  abilities: [
    {
      trigger: 'auto',
      cooldownMs: 5000,
      firstDelayMs: 2500,
      aim: 'nearest',
      range: 6,
      fireSfx: 'warp',
      shape: { kind: 'world' },
      onHit: [{ kind: 'to', who: { side: 'foes', radius: 6, sort: 'nearest', count: 1 }, then: [{ kind: 'swap' }, { kind: 'stun', durationMs: COMBAT.transitMs.swap + 400 }] }],
    },
  ],
} satisfies EnemyDef

export default UPSIDE_DOWN
