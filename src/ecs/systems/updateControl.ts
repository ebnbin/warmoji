import { hasComponent, query } from 'bitecs'
import { Casting, Ctl, Dormant, Drive, EDir, EnemyPhase, MARK, Mark, Motion, MOTION, Phys, SpeedMul, Transform } from '../components'
import { hasMark } from '../utils/marks'
import { wanderDir } from './shared/steer'
import type { Sim } from '../sim'

/** 每个身体这一帧能做什么，敌我同一条：休眠、定身、脚本位移、蓄力都不自己走；定身与变形不能出手；变形中会走的只慢速乱逛 */
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
    if (hasMark(sim, eid, MARK.stun)) {
      Transform.rot[eid] = Math.sin(now / 80 + EnemyPhase.v[eid]!) * 0.3
      move = 0
      act = 0
      cast = 0
      dash = 0
    }
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
    if (Motion.kind[eid] !== MOTION.none || now < Casting.until[eid]!) move = 0
    Ctl.move[eid] = move
    Ctl.act[eid] = act
    Ctl.cast[eid] = cast
    Ctl.dash[eid] = dash
  }
}
