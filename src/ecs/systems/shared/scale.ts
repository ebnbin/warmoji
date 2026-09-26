import { hasComponent } from 'bitecs'
import { CharScale, Grow, MARK, MARK_SLOTS, Mark, Pop, Radius, Transform } from '../../components'
import type { Sim } from '../../sim'

/** 限时体型标记的乘积 */
function timedGrow(sim: Sim, eid: number): number {
  const now = sim.elapsedMs
  const base = eid * MARK_SLOTS
  let mul = 1
  for (let i = 0; i < MARK_SLOTS; i++) {
    const s = base + i
    if (Mark.kind[s] === MARK.grow && Mark.until[s]! > now) mul *= Mark.a[s]!
  }
  return mul
}

/** 角色的画面尺寸：本来的尺寸 × 队长倍率 × 体型 */
export function charSize(eid: number): number {
  return Grow.s0[eid]! * CharScale.v[eid]! * Grow.v[eid]!
}

/** 体型变了：判定半径与画面尺寸一起跟着变；角色的画面尺寸由动画按 charSize 每帧算 */
export function rescale(sim: Sim, eid: number): void {
  if (!hasComponent(sim.world, eid, Grow)) return
  const v = Grow.perm[eid]! * Grow.form[eid]! * timedGrow(sim, eid)
  Grow.v[eid] = v
  const char = hasComponent(sim.world, eid, CharScale)
  Radius.v[eid] = Grow.r0[eid]! * (char ? CharScale.v[eid]! : 1) * v
  if (char || !hasComponent(sim.world, eid, Pop)) return
  Pop.size[eid] = Grow.s0[eid]! * v
  if (Pop.until[eid] !== 0) return
  Transform.w[eid] = Pop.size[eid]!
  Transform.h[eid] = Pop.size[eid]!
}
