import { addComponents, addEntity } from 'bitecs'
import { attachDrawable } from './drawable'
import { Drop, FACTION, Faction, Owner } from '../components'
import type { Sim } from '../sim'


export interface DropSpec {
  emoji: string
  size: number
  target: number
  x: number
  y: number
  /** px */
  fromAbove: number
  /** ms，视觉钟 */
  dropMs: number
  /** ms */
  delayMs: number
}

export function spawnDrop(sim: Sim, weaponEid: number, spec: DropSpec): number {
  const d = addEntity(sim.world)
  attachDrawable(sim.world, d, sim.frames, {
    id: spec.emoji,
    outline: Faction.v[weaponEid] === FACTION.enemy ? 'enemy' : 'player',
    x: spec.x,
    y: spec.y - spec.fromAbove,
    size: spec.size,
    alpha: 0,
    z: 30,
  })
  addComponents(sim.world, d, Drop, Owner)
  Owner.eid[d] = weaponEid
  Drop.startMs[d] = sim.fxMs + spec.delayMs
  Drop.durMs[d] = spec.dropMs
  Drop.fromY[d] = spec.y - spec.fromAbove
  Drop.toY[d] = spec.y
  Drop.target[d] = spec.target
  return d
}
