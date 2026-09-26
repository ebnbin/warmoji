import { MARK } from '../components'
import { hasMark, isAirborne } from './marks'
import type { Sim } from '../sim'

/** 身上控制的底色，按轻重排：静止、眩晕、睡眠、恐惧、魅惑、倒戈、击飞、定身、沉默、致盲；没有控制返回 0 */
const TINTS: readonly (readonly [number, number])[] = [
  [MARK.stasis, 0xb3e5fc],
  [MARK.stun, 0xff9ff3],
  [MARK.sleep, 0xb39ddb],
  [MARK.fear, 0x9575cd],
  [MARK.charm, 0xff80ab],
  [MARK.berserk, 0xff5252],
  [MARK.root, 0xbcaaa4],
  [MARK.silence, 0xcfd8dc],
  [MARK.disarm, 0x9e9e9e],
]

export function statusTint(sim: Sim, eid: number): number {
  for (const [kind, color] of TINTS) if (hasMark(sim, eid, kind)) return color
  return isAirborne(eid) ? 0xfff59d : 0
}
