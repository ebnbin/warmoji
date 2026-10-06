import { MARK, Motion, Seen, Tint, TRANSIT, Uid } from '../components'
import { hasMark, inTransit, isAirborne, isHidden } from './marks'
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

const STREAK_ALPHA = 0.5
/** 看不见的身体只剩这么淡的影子 */
const UNSEEN_ALPHA = 0.35

/** 存在感：隐身穿行的看不见，残影穿行的半透明，吊起的照常看得见，被吞的几乎看不见，碰不到的半透明，看不见的只剩淡影 */
export function presence(sim: Sim, eid: number): number {
  if (inTransit(eid)) return Motion.look[eid] === TRANSIT.hidden ? 0 : Motion.look[eid] === TRANSIT.hoist ? 1 : STREAK_ALPHA
  if (hasMark(sim, eid, MARK.devoured)) return 0.1
  if (isHidden(sim, eid)) return UNSEEN_ALPHA
  if (hasMark(sim, eid, MARK.untargetable)) return 0.5
  return 1
}

/** 队伍里谁也看不见的敌人（被挡视线的障碍挡住）和隐身的一样只剩淡影，看见与看不见之间渐变；还没判断过的照常画 */
export function shownToTeam(eid: number): number {
  return Seen.uid[eid] === Uid.v[eid] ? UNSEEN_ALPHA + (1 - UNSEEN_ALPHA) * Seen.v[eid]! : 1
}

/** 挂在身体上的东西随宿主显隐的那一份：宿主画出来多透明，它就多透明 */
export function hostShown(host: number): number {
  return Tint.alpha[host]!
}

/** 身上的底色：穿行中是穿行的颜色（吊起的不染色），其余按控制的轻重排 */
export function statusTint(sim: Sim, eid: number): number {
  if (inTransit(eid)) return Motion.look[eid] === TRANSIT.hoist ? 0 : Motion.color[eid]!
  for (const [kind, color] of TINTS) if (hasMark(sim, eid, kind)) return color
  if (isAirborne(eid)) return 0xfff59d
  return hasMark(sim, eid, MARK.realm) ? REALM_TINT : 0
}
