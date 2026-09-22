import { query } from 'bitecs'
import { remapPoint, remapVector, isHorizontal } from '../../utils/remap'
import { Bob, EDir, ENEMY_SET, Follow, Kv, PICKUP_SET, PROJ_SET, Telegraph, Transform, Vel, ZONE_SET } from '../../components'
import type { Sim } from '../../sim'
import type { Point } from '../../../util/vec'
import { centerX, centerY, setCenter } from '../../utils/team'

// 仅单屏图：世界尺寸由视口推出
export function remapSim(sim: Sim, fromW: number, fromH: number, toW: number, toH: number): void {
  const fromH0 = isHorizontal(fromW, fromH)
  const toH0 = isHorizontal(toW, toH)
  const map = (x: number, y: number): Point => remapPoint({ x, y }, fromW, fromH, toW, toH)
  const rot = (x: number, y: number): Point => remapVector({ x, y }, fromH0, toH0)

  const c = map(centerX(sim), centerY(sim))
  setCenter(sim, c.x, c.y)
  const tv = rot(sim.worldState.vx, sim.worldState.vy)
  sim.worldState.vx = tv.x
  sim.worldState.vy = tv.y

  for (const m of sim.characters) {
    const p = map(Follow.x[m]!, Follow.y[m]!)
    const v = rot(Follow.vx[m]!, Follow.vy[m]!)
    Follow.x[m] = p.x
    Follow.y[m] = p.y
    Follow.vx[m] = v.x
    Follow.vy[m] = v.y
    Transform.x[m] = p.x
    Transform.y[m] = p.y
  }

  const movePos = (eid: number): void => {
    const p = map(Transform.x[eid]!, Transform.y[eid]!)
    Transform.x[eid] = p.x
    Transform.y[eid] = p.y
  }
  const moveVel = (eid: number): void => {
    const v = rot(Vel.x[eid]!, Vel.y[eid]!)
    Vel.x[eid] = v.x
    Vel.y[eid] = v.y
  }
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    movePos(eid)
    const d = rot(EDir.x[eid]!, EDir.y[eid]!)
    EDir.x[eid] = d.x
    EDir.y[eid] = d.y
    const k = rot(Kv.x[eid]!, Kv.y[eid]!)
    Kv.x[eid] = k.x
    Kv.y[eid] = k.y
  }
  for (const set of [PROJ_SET, PICKUP_SET]) {
    for (const eid of query(sim.world, set as unknown as object[])) {
      movePos(eid)
      moveVel(eid)
    }
  }
  for (const eid of query(sim.world, PICKUP_SET as unknown as object[])) Bob.y0[eid] = Transform.y[eid]!
  for (const eid of query(sim.world, [Telegraph, Transform])) movePos(eid)
  for (const eid of query(sim.world, ZONE_SET as unknown as object[])) movePos(eid)
}
