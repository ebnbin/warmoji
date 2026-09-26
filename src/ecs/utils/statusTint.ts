import { MARK } from '../components'
import { hasMark, isAirborne, isHidden } from './marks'
import type { Sim } from '../sim'

/** 身上控制的底色，按轻重排：静止、亡后残留、眩晕、睡眠、恐惧、魅惑、倒戈、击飞、定身、沉默、致盲、身在异界；没有控制返回 0 */
const TINTS: readonly (readonly [number, number])[] = [
  [MARK.stasis, 0xb3e5fc],
  [MARK.undead, 0x90a4ae],
  [MARK.stun, 0xff9ff3],
  [MARK.sleep, 0xb39ddb],
  [MARK.fear, 0x9575cd],
  [MARK.charm, 0xff80ab],
  [MARK.berserk, 0xff5252],
  [MARK.root, 0xbcaaa4],
  [MARK.silence, 0xcfd8dc],
  [MARK.disarm, 0x9e9e9e],
]

const REALM_TINT = 0x9575cd

/** 存在感：被吞的几乎看不见，碰不到的半透明，看不见的只剩淡影 */
export function presence(sim: Sim, eid: number): number {
  if (hasMark(sim, eid, MARK.devoured)) return 0.1
  if (isHidden(sim, eid)) return 0.35
  if (hasMark(sim, eid, MARK.untargetable)) return 0.5
  return 1
}

export function statusTint(sim: Sim, eid: number): number {
  for (const [kind, color] of TINTS) if (hasMark(sim, eid, kind)) return color
  if (isAirborne(eid)) return 0xfff59d
  return hasMark(sim, eid, MARK.realm) ? REALM_TINT : 0
}
