import { addComponents } from 'bitecs'
import { newEntity } from './entity'
import { Due, Meteor } from '../components'
import { meteorHit } from '../store'
import { attachDrawable } from './drawable'
import type { Sim } from '../sim'


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
    outline: undefined,
    x: s.sx,
    y: s.sy,
    size,
    alpha: 0,
    z: 60,
  })
  return eid
}
