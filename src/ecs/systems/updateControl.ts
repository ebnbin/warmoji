import { hasComponent, query } from 'bitecs'
import { Casting, Ctl, Dormant, Drive, EDir, EnemyPhase, MARK, Mark, Motion, MOTION, Phys, SpeedMul, Transform } from '../components'
import { hasMark, isAirborne, markedBy, markSlot } from '../utils/marks'
import { norm } from '../../util/vec'
import { wanderDir } from './shared/steer'
import type { Sim } from '../sim'

const FLEE = 1
const APPROACH = 2

/** 牵着走的控制：施加者还在就对着它，否则对着记下的位置 */
function ledPoint(sim: Sim, eid: number, kind: number): { x: number; y: number } | null {
  const s = markSlot(sim, eid, kind)
  if (s < 0) return null
  const by = markedBy(sim, eid, kind)
  if (by >= 0) {
    Mark.b[s] = Transform.x[by]!
    Mark.c[s] = Transform.y[by]!
  }
  return { x: Mark.b[s]!, y: Mark.c[s]! }
}

/** 每个身体这一帧能做什么，敌我同一条：静止、被吞、眩晕、睡眠什么都做不了；被抛在空中不能出手；定身不能走，沉默不能施放，致盲不能出手，禁锢不能位移；恐惧与魅惑被牵着走，嘲讽被拉向嘲讽者；变形中会走的只慢速乱逛；脚本位移与蓄力中不自己走 */
export function updateControl(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, [Ctl, Mark, Drive])) {
    Drive.x[eid] = 0
    Drive.y[eid] = 0
    Ctl.forced[eid] = 0
    if (Dormant.v[eid]) {
      Ctl.move[eid] = 0
      Ctl.act[eid] = 0
      Ctl.cast[eid] = 0
      Ctl.dash[eid] = 0
      continue
    }
    let move = 1
    let act = 1
    let cast = 1
    let dash = 1
    const stun = hasMark(sim, eid, MARK.stun)
    if (stun || hasMark(sim, eid, MARK.sleep) || hasMark(sim, eid, MARK.stasis) || hasMark(sim, eid, MARK.devoured)) {
      if (stun) Transform.rot[eid] = Math.sin(now / 80 + EnemyPhase.v[eid]!) * 0.3
      move = 0
      act = 0
      cast = 0
      dash = 0
    }
    if (isAirborne(eid)) {
      act = 0
      cast = 0
    }
    if (hasMark(sim, eid, MARK.root)) {
      move = 0
      dash = 0
    }
    if (hasMark(sim, eid, MARK.silence)) cast = 0
    if (hasMark(sim, eid, MARK.disarm)) act = 0
    if (hasMark(sim, eid, MARK.ground)) dash = 0
    if (hasMark(sim, eid, MARK.morph)) {
      act = 0
      cast = 0
      dash = 0
      move = 0
      if (hasComponent(sim.world, eid, EDir)) {
        const d = wanderDir(sim, eid)
        const sp = (Phys.thrust[eid]! / Phys.drag[eid]!) * SpeedMul.v[eid]! * 0.5
        Drive.x[eid] = d.x * sp
        Drive.y[eid] = d.y * sp
      }
    }
    let forced = 0
    let pace = 1
    let to: { x: number; y: number } | null = null
    const fear = ledPoint(sim, eid, MARK.fear)
    const charm = fear ? null : ledPoint(sim, eid, MARK.charm)
    if (fear || charm) {
      forced = fear ? FLEE : APPROACH
      pace = fear ? 1 : 0.75
      to = fear ?? charm
      act = 0
      cast = 0
      dash = 0
    } else {
      const taunter = markedBy(sim, eid, MARK.taunt)
      if (taunter >= 0) {
        forced = APPROACH
        to = { x: Transform.x[taunter]!, y: Transform.y[taunter]! }
      }
    }
    if (Motion.kind[eid] !== MOTION.none || now < Casting.until[eid]!) move = 0
    if (forced !== 0 && to && move) {
      const d = sim.hooks.worldDelta(sim, Transform.x[eid]!, Transform.y[eid]!, to.x, to.y)
      const toward = norm(d.x, d.y)
      const dir = forced === FLEE ? sim.hooks.fleeDir(sim, eid, -toward.x, -toward.y) : toward
      const sp = (Phys.thrust[eid]! / Phys.drag[eid]!) * SpeedMul.v[eid]! * pace
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
}
