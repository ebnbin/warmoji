import { query } from 'bitecs'
import { remapPoint, remapVector, isHorizontal } from '../../utils/remap'
import { Aim, Drop, EDir, ENEMY_SET, Facing, Flyer, Leaping, Minion, Phys, PICKUP_SET, PROJ_SET, Rushing, Telegraph, Transform, Vel, VisOff, ZONE_SET } from '../../components'
import type { Sim } from '../../sim'
import type { Point } from '../../../util/vec'

export function remapSim(sim: Sim, fromW: number, fromH: number, toW: number, toH: number): void {
  const fromH0 = isHorizontal(fromW, fromH)
  const toH0 = isHorizontal(toW, toH)
  const map = (x: number, y: number): Point => remapPoint({ x, y }, fromW, fromH, toW, toH)
  const rot = (x: number, y: number): Point => remapVector({ x, y }, fromH0, toH0)

  const h = rot(sim.heading.x, sim.heading.y)
  sim.heading = { x: h.x, y: h.y }
  const ho = sim.handover
  if (ho) {
    const c = rot(ho.camX, ho.camY)
    ho.camX = c.x
    ho.camY = c.y
  }
  const aim = rot(sim.aim.x, sim.aim.y)
  sim.aim = { x: aim.x, y: aim.y }

  const movePos = (eid: number): void => {
    const p = map(Transform.x[eid]!, Transform.y[eid]!)
    Transform.x[eid] = p.x
    Transform.y[eid] = p.y
  }
  for (const b of query(sim.world, [Phys])) {
    const v = rot(Phys.vx[b]!, Phys.vy[b]!)
    Phys.vx[b] = v.x
    Phys.vy[b] = v.y
  }
  for (const b of query(sim.world, [Rushing])) {
    const rv = rot(Rushing.vx[b]!, Rushing.vy[b]!)
    Rushing.vx[b] = rv.x
    Rushing.vy[b] = rv.y
  }
  for (const m of sim.characters) {
    movePos(m)
    const off = rot(VisOff.x[m]!, VisOff.y[m]!)
    VisOff.x[m] = off.x
    VisOff.y[m] = off.y
    const f = rot(Facing.x[m]!, Facing.y[m]!)
    Facing.x[m] = f.x
    Facing.y[m] = f.y
    const fv = rot(Facing.vx[m]!, Facing.vy[m]!)
    Facing.vx[m] = fv.x
    Facing.vy[m] = fv.y
    const lf = map(Leaping.fromX[m]!, Leaping.fromY[m]!)
    const lt = map(Leaping.toX[m]!, Leaping.toY[m]!)
    Leaping.fromX[m] = lf.x
    Leaping.fromY[m] = lf.y
    Leaping.toX[m] = lt.x
    Leaping.toY[m] = lt.y
  }
  for (const e of query(sim.world, [Aim])) {
    const a = rot(Math.cos(Aim.rad[e]!), Math.sin(Aim.rad[e]!))
    Aim.rad[e] = Math.atan2(a.y, a.x)
  }
  const moveVel = (eid: number): void => {
    const v = rot(Vel.x[eid]!, Vel.y[eid]!)
    Vel.x[eid] = v.x
    Vel.y[eid] = v.y
  }
  for (const eid of query(sim.world, ENEMY_SET)) {
    movePos(eid)
    const d = rot(EDir.x[eid]!, EDir.y[eid]!)
    EDir.x[eid] = d.x
    EDir.y[eid] = d.y
  }
  for (const eid of query(sim.world, PROJ_SET)) {
    movePos(eid)
    moveVel(eid)
  }
  for (const eid of query(sim.world, PICKUP_SET)) movePos(eid)
  for (const eid of query(sim.world, [Telegraph, Transform])) movePos(eid)
  for (const eid of query(sim.world, ZONE_SET)) movePos(eid)
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
