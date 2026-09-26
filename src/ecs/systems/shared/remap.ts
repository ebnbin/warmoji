import { query } from 'bitecs'
import { remapPoint, remapVector, isHorizontal } from '../../utils/remap'
import { Aim, Barrier, Drop, EDir, ENEMY_SET, Facing, Flyer, History, HISTORY, MARK, MARK_SLOTS, Mark, Minion, Motion, MOTION, Phys, PICKUP_SET, PROJ_SET, Shadow, Telegraph, Transform, Vel, VisOff, ZONE_SET } from '../../components'
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
  for (const b of query(sim.world, [Motion])) {
    const rv = rot(Motion.vx[b]!, Motion.vy[b]!)
    Motion.vx[b] = rv.x
    Motion.vy[b] = rv.y
    const mf = map(Motion.fx[b]!, Motion.fy[b]!)
    // 跟随的 tx/ty 是相对宿主的偏移，其余是落点
    const mt = Motion.kind[b] === MOTION.follow ? rot(Motion.tx[b]!, Motion.ty[b]!) : map(Motion.tx[b]!, Motion.ty[b]!)
    Motion.fx[b] = mf.x
    Motion.fy[b] = mf.y
    Motion.tx[b] = mt.x
    Motion.ty[b] = mt.y
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
  for (const eid of query(sim.world, [Shadow, Transform])) movePos(eid)
  for (const w of query(sim.world, [Barrier])) {
    const a = map(Barrier.ax[w]!, Barrier.ay[w]!)
    const b = map(Barrier.bx[w]!, Barrier.by[w]!)
    const c = map(Barrier.cx[w]!, Barrier.cy[w]!)
    Barrier.ax[w] = a.x
    Barrier.ay[w] = a.y
    Barrier.bx[w] = b.x
    Barrier.by[w] = b.y
    Barrier.cx[w] = c.x
    Barrier.cy[w] = c.y
  }
  for (const eid of query(sim.world, [History])) {
    for (let s = eid * HISTORY; s < (eid + 1) * HISTORY; s++) {
      const p = map(History.x[s]!, History.y[s]!)
      History.x[s] = p.x
      History.y[s] = p.y
    }
  }
  // 恐惧与魅惑记着施加者最后的位置
  for (const eid of query(sim.world, [Mark])) {
    for (let s = eid * MARK_SLOTS; s < (eid + 1) * MARK_SLOTS; s++) {
      if (Mark.kind[s] !== MARK.fear && Mark.kind[s] !== MARK.charm) continue
      const p = map(Mark.b[s]!, Mark.c[s]!)
      Mark.b[s] = p.x
      Mark.c[s] = p.y
    }
  }
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
