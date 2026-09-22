import { addComponents } from 'bitecs'
import { newEntity } from './entity'
import { Due, Meteor } from '../components'
import { meteorHit } from '../store'
import { attachDrawable } from './drawable'
import type { Sim } from '../sim'


/** warnMs 之后从 (sx,sy) 起划向 (ex,ey) */
export function spawnMeteor(
  sim: Sim,
  s: { sx: number; sy: number; ex: number; ey: number },
  warnMs: number,
  size: number,
): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Meteor, Due)
  Meteor.sx[eid] = s.sx
  Meteor.sy[eid] = s.sy
  Meteor.ex[eid] = s.ex
  Meteor.ey[eid] = s.ey
  Meteor.t[eid] = 0
  Due.at[eid] = sim.elapsedMs + warnMs
  meteorHit[eid] = new Set()
  attachDrawable(sim.world, eid, sim.frames, {
    id: '1fa90',
    outline: 'player',
    x: s.sx,
    y: s.sy,
    size,
    alpha: 0, // 起划才由 tick 拉到 1
    z: 60,
  })
  return eid
}
