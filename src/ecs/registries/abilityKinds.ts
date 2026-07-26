import { Aura, Blink, Followup, Pulse, Radial, Shots, Swing } from '../components'
import type { AbilityDef } from '../../types/abilityDefs'

// 每种能力的登记表：一个 tag 组件 + 它自己需要的状态组件。
//
// **tag**：施放系统靠它取自己那一批实体，不在一个循环里 switch kind。一条能力归不归
// 某系统管，只看它身上有没有那个 tag——与持有者是谁无关。
//
// **state**：只有真的用得到的 kind 才挂。挥击进度只有横扫/突刺有、瞬闪落点只有刺客有、
// 扫射序列只有激光有——从前是**每颗武器都背着全套**，弩塔身上永远躺着一个用不到的
// Blink。现在「有这个组件 = 有这个性质」，各系统的 query 自己就把无关实体挡在外面。
//
// 新增 kind：在此加 tag、登记进 KINDS（用得到状态就一并列上），再写一个 kinds/ 下的施放系统。

/** 一个状态组件与它的清零方式（组件按 eid 索引，eid 复用会读到上一位住户的残值） */
interface StateSpec {
  readonly comp: object
  reset(eid: number): void
}

const SwingState: StateSpec = {
  comp: Swing,
  reset: (e) => {
    Swing.startMs[e] = 0
    Swing.durMs[e] = 0
  },
}
const FollowupState: StateSpec = {
  comp: Followup,
  reset: (e) => {
    Followup.left[e] = 0
    Followup.damage[e] = 0
  },
}
const RadialState: StateSpec = { comp: Radial, reset: (e) => { Radial.left[e] = 0 } }
const BlinkState: StateSpec = {
  comp: Blink,
  reset: (e) => {
    Blink.x[e] = 0
    Blink.y[e] = 0
  },
}
const PulseState: StateSpec = {
  comp: Pulse,
  reset: (e) => {
    Pulse.dps[e] = 0
    Pulse.freeze[e] = 0
  },
}
const ShotsState: StateSpec = { comp: Shots, reset: (e) => { Shots.n[e] = 0 } }
const AuraState: StateSpec = { comp: Aura, reset: (e) => { Aura.zone[e] = 0 } }

export const KindRally = {}
export const KindDance = {}
export const KindBuff = {}
export const KindTimeStop = {}
export const KindNuke = {}
export const KindHeal = {}
export const KindAreaBlast = {}
export const KindChainArc = {}
export const KindThrust = {}
export const KindSweep = {}
export const KindStrike = {}
export const KindAssassinate = {}
export const KindProjectile = {}
export const KindBoomerang = {}
export const KindLaser = {}
export const KindSummon = {}
export const KindTurret = {}
export const KindSlowAura = {}

/** 一种能力的登记项 */
export interface KindSpec {
  readonly tag: object
  /** 这种能力自己需要的状态组件；不列即不挂 */
  readonly state?: readonly StateSpec[]
}

export const KINDS: Partial<Record<AbilityDef['kind'], KindSpec>> = {
  rally: { tag: KindRally },
  dance: { tag: KindDance },
  buff: { tag: KindBuff },
  timeStop: { tag: KindTimeStop },
  nuke: { tag: KindNuke },
  heal: { tag: KindHeal },
  areaBlast: { tag: KindAreaBlast, state: [FollowupState] },
  chainArc: { tag: KindChainArc },
  thrust: { tag: KindThrust, state: [SwingState, FollowupState] },
  sweep: { tag: KindSweep, state: [SwingState] },
  strike: { tag: KindStrike },
  assassinate: { tag: KindAssassinate, state: [FollowupState, BlinkState] },
  projectile: { tag: KindProjectile, state: [ShotsState] },
  boomerang: { tag: KindBoomerang },
  laser: { tag: KindLaser, state: [RadialState] },
  summon: { tag: KindSummon },
  turret: { tag: KindTurret },
  slowAura: { tag: KindSlowAura, state: [PulseState, AuraState] },
}
