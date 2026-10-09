import { addComponents } from 'bitecs'
import { newEntity } from './entity'
import { attachDrawable } from './drawable'
import { Drop, Faction, Owner, Uid } from '../components'
import { holderRim } from './weapon'
import type { Sim } from '../sim'


interface DropSpec {
  /** 能力给的伤害，落地时按它结算 */
  damage: number
  emoji: string
  size: number
  target: number
  x: number
  y: number
  fromAbove: number
  dropMs: number
  delayMs: number
}

export function spawnDrop(sim: Sim, weaponEid: number, spec: DropSpec): number {
  const d = newEntity(sim.world)
  attachDrawable(sim.world, d, sim.frames, {
    id: spec.emoji,
    rim: holderRim(Faction.v[weaponEid]!, Owner.eid[weaponEid]!),
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
  Drop.targetUid[d] = Uid.v[spec.target]!
  Drop.damage[d] = spec.damage
  return d
}
