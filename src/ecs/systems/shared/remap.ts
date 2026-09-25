import { query } from 'bitecs'
import { remapPoint, remapVector, isHorizontal } from '../../utils/remap'
import { Aim, Blink, Bob, Drop, EDir, ENEMY_SET, Flyer, Follow, Kv, Minion, PICKUP_SET, PROJ_SET, Telegraph, Transform, Vel, VisOff, ZONE_SET } from '../../components'
import type { Sim } from '../../sim'
import type { Point } from '../../../util/vec'
import { centerX, centerY, setCenter } from '../../utils/team'

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
    const off = rot(VisOff.x[m]!, VisOff.y[m]!)
    Follow.x[m] = p.x
    Follow.y[m] = p.y
    Follow.vx[m] = v.x
    Follow.vy[m] = v.y
    VisOff.x[m] = off.x
    VisOff.y[m] = off.y
    Transform.x[m] = p.x + off.x
    Transform.y[m] = p.y + off.y
  }
  for (const e of query(sim.world, [Blink])) {
    const b = rot(Blink.x[e]!, Blink.y[e]!)
    Blink.x[e] = b.x
    Blink.y[e] = b.y
  }
  for (const e of query(sim.world, [Aim])) {
    const a = rot(Math.cos(Aim.rad[e]!), Math.sin(Aim.rad[e]!))
    Aim.rad[e] = Math.atan2(a.y, a.x)
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
  for (const eid of query(sim.world, PICKUP_SET as unknown as object[])) {
    if (Bob.amp[eid]! > 0) Transform.y[eid] = Bob.y0[eid]!
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
  for (const eid of query(sim.world, [Minion, Transform])) movePos(eid)
  for (const f of query(sim.world, [Flyer, Transform])) {
    movePos(f)
    const from = map(Flyer.launchX[f]!, Flyer.launchY[f]!)
    const to = map(Flyer.destX[f]!, Flyer.destY[f]!)
    Flyer.launchX[f] = from.x
    Flyer.launchY[f] = from.y
    Flyer.destX[f] = to.x
    Flyer.destY[f] = to.y
  }
  for (const d of query(sim.world, [Drop, Transform])) {
    const land = map(Transform.x[d]!, Drop.toY[d]!)
    const fall = Drop.toY[d]! - Drop.fromY[d]!
    const above = Drop.toY[d]! - Transform.y[d]!
    Transform.x[d] = land.x
    Drop.toY[d] = land.y
    Drop.fromY[d] = land.y - fall
    Transform.y[d] = land.y - above
  }
}
