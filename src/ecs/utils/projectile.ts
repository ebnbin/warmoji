import { hasComponent } from 'bitecs'
import { Aim, Faction, FACTION, Held, Owner, Phys } from '../components'
import { anchorX, anchorY } from './amp'
import type { Sim } from '../sim'

export function headingOf(sim: Sim, e: number): { x: number; y: number } {
  if (Faction.v[e] !== FACTION.enemy) return sim.teamDir
  const o = Owner.eid[e]!
  return { x: Phys.vx[o]!, y: Phys.vy[o]! }
}

export function muzzle(sim: Sim, e: number): { x: number; y: number } {
  if (!hasComponent(sim.world, e, Held)) return { x: anchorX(e), y: anchorY(e) }
  const aim = Aim.rad[e]!
  const off = Held.restOffset[e]!
  const lateral = Held.side[e]! * Held.gap[e]!
  return {
    x: anchorX(e) + Math.cos(aim) * off + Math.cos(aim + Math.PI / 2) * lateral,
    y: anchorY(e) + Math.sin(aim) * off + Math.sin(aim + Math.PI / 2) * lateral,
  }
}
