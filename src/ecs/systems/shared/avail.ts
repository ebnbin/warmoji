import { hasComponent } from 'bitecs'
import { Ammo, Cd, Charges, Disarmed, Frozen, Stage, Turn } from '../../components'
import { cooldownMul } from '../../utils/amp'
import { busy } from './fire'
import { affordable, payRes } from './resource'
import type { Sim } from '../../sim'

/** 连段里还有哪一段开着 */
export function openStage(sim: Sim, root: number): number {
  for (let s = hasComponent(sim.world, root, Stage) ? Stage.next[root]! : 0; s !== 0; s = Stage.next[s]!) {
    if (Stage.open[s]! > sim.elapsedMs) return s
  }
  return 0
}

/** 弹匣：打空后换好了就装满 */
function ammoReady(sim: Sim, e: number): boolean {
  if (Ammo.n[e]! > 0) return true
  if (sim.elapsedMs < Ammo.readyAt[e]!) return false
  Ammo.n[e] = Ammo.max[e]!
  return true
}

/** 冷却或充能好了没有 */
export function cooled(sim: Sim, e: number): boolean {
  return hasComponent(sim.world, e, Charges) ? Charges.n[e]! > 0 : Cd.left[e]! <= 0
}

/** 能不能出手：没被冻结缴械、手头没事、轮到它、冷却或充能好了、弹匣有弹、付得起；后续段要窗口开着，第一段要没有开着的后续段 */
export function ready(sim: Sim, e: number): boolean {
  if (Frozen.v[e] || Disarmed.v[e] || busy(sim, e)) return false
  if (hasComponent(sim.world, e, Turn) && !Turn.active[e]) return false
  if (hasComponent(sim.world, e, Stage)) {
    if (Stage.root[e] !== 0) return Stage.open[e]! > sim.elapsedMs && affordable(sim, e)
    if (openStage(sim, e) !== 0) return false
  }
  if (!cooled(sim, e)) return false
  if (hasComponent(sim.world, e, Ammo) && !ammoReady(sim, e)) return false
  return affordable(sim, e)
}

/** 出手之后记账：冷却或充能、弹匣、资源与生命、连段下一段开窗、轮流交棒 */
export function spend(sim: Sim, e: number): void {
  const w = sim.world
  const base = Cd.base[e]! * cooldownMul(sim, e)
  if (hasComponent(w, e, Stage) && Stage.root[e] !== 0) {
    Stage.open[e] = 0
  } else if (hasComponent(w, e, Charges)) {
    Charges.n[e] = Charges.n[e]! - 1
    if (Cd.left[e]! <= 0) Cd.left[e] = base
  } else if (Cd.base[e]! > 0) {
    Cd.left[e] = base
  }
  if (hasComponent(w, e, Ammo)) {
    Ammo.n[e] = Ammo.n[e]! - 1
    if (Ammo.n[e]! <= 0) Ammo.readyAt[e] = sim.elapsedMs + Ammo.reloadMs[e]!
  }
  payRes(sim, e)
  if (hasComponent(w, e, Stage) && Stage.next[e] !== 0) Stage.open[Stage.next[e]!] = sim.elapsedMs + Stage.window[e]!
  if (hasComponent(w, e, Turn)) {
    const next = Turn.next[e]!
    Turn.active[e] = 0
    Turn.active[next] = 1
    Cd.left[next] = Math.max(Cd.left[next]!, Cd.left[e]!)
  }
}
