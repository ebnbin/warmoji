import { hasComponent, query } from 'bitecs'
import { Casting, Ctl, Drive, EDir, EnemyPhase, MARK, Mark, Motion, MOTION, Transform } from '../components'
import { BLOCK, blockedBits, FORCING, hasMark, inTransit, isAirborne, leadSlot, markedBy, wanderPace } from '../utils/marks'
import { norm } from '../../util/vec'
import { wanderDir } from './shared/steer'
import { moveSpeed } from '../utils/stats'
import type { Sim } from '../sim'

const FLEE = 1
const APPROACH = 2

/** 牵着走的控制：施加者还在就对着它，否则对着记下的位置；几个施加者的取 leadSlot 那一格 */
function ledPoint(sim: Sim, eid: number, kind: number): { x: number; y: number } | null {
  const s = leadSlot(sim, eid, kind)
  if (s < 0) return null
  const by = markedBy(sim, eid, kind)
  if (by >= 0) {
    Mark.b[s] = Transform.x[by]!
    Mark.c[s] = Transform.y[by]!
  }
  return { x: Mark.b[s]!, y: Mark.c[s]! }
}

/** 每个身体这一帧能做什么，敌我同一条：身上的状态按状态表封住动作、逼着它走（见 data/statuses）；穿行中什么都做不了，被抛在空中不能出手；脚本位移与蓄力中不自己走 */
export function updateControl(sim: Sim): void {
  for (const eid of query(sim.world, [Ctl, Mark, Drive])) controlBody(sim, eid)
}

/** 一个身体此刻的门控与被牵着走的驱动；出手前的自身效果改了状态后当场重新判定 */
export function controlBody(sim: Sim, eid: number): void {
  const now = sim.elapsedMs
  Drive.x[eid] = 0
  Drive.y[eid] = 0
  Drive.idle[eid] = 0
  Ctl.forced[eid] = 0
  if (hasMark(sim, eid, MARK.stun)) Transform.rot[eid] = Math.sin(now / 80 + EnemyPhase.v[eid]!) * 0.3
  let bits = blockedBits(sim, eid)
  if (inTransit(eid)) bits |= BLOCK.move | BLOCK.act | BLOCK.cast | BLOCK.dash
  if (isAirborne(eid)) bits |= BLOCK.act | BLOCK.cast
  let move = bits & BLOCK.move ? 0 : 1
  const act = bits & BLOCK.act ? 0 : 1
  const cast = bits & BLOCK.cast ? 0 : 1
  const dash = bits & BLOCK.dash ? 0 : 1
  const wander = wanderPace(sim, eid)
  if (wander > 0 && hasComponent(sim.world, eid, EDir)) {
    const d = wanderDir(sim, eid)
    const sp = moveSpeed(eid) * wander
    Drive.x[eid] = d.x * sp
    Drive.y[eid] = d.y * sp
    Drive.idle[eid] = 1
  }
  let forced = 0
  let pace = 1
  let to: { x: number; y: number } | null = null
  for (const { kind, force } of FORCING) {
    if (force.kind === 'taunted') {
      const by = markedBy(sim, eid, kind)
      if (by >= 0) to = { x: Transform.x[by]!, y: Transform.y[by]! }
    } else {
      to = ledPoint(sim, eid, kind)
    }
    if (!to) continue
    forced = force.kind === 'flee' ? FLEE : APPROACH
    pace = force.pace
    break
  }
  if (Motion.kind[eid] !== MOTION.none || now < Casting.until[eid]!) move = 0
  if (forced !== 0 && to && move) {
    const d = sim.hooks.worldDelta(sim, Transform.x[eid]!, Transform.y[eid]!, to.x, to.y)
    const toward = norm(d.x, d.y)
    const dir = forced === FLEE ? sim.hooks.fleeDir(sim, eid, -toward.x, -toward.y) : toward
    const sp = moveSpeed(eid) * pace
    Drive.x[eid] = dir.x * sp
    Drive.y[eid] = dir.y * sp
    Ctl.forced[eid] = forced
    Ctl.fx[eid] = to.x
    Ctl.fy[eid] = to.y
    move = 0
  }
  Ctl.move[eid] = move
  Ctl.act[eid] = act
  Ctl.cast[eid] = cast
  Ctl.dash[eid] = dash
}
