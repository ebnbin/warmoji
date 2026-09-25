import { Amp, Anchor, FACTION, Faction, Owner, WallBlocked } from '../components'
import { Transform } from '../components'
import { enemyDef } from '../store'
import { attributionSlot } from './amp'
import type { Sim } from '../sim'

export interface Source {
  readonly faction: number
  readonly slot: number
  readonly kb: number
  readonly crit: number
  readonly dmgMul: number
  readonly name?: string
  readonly sight?: { readonly x: number; readonly y: number }
}

export function sourceOf(sim: Sim, e: number): Source {
  const enemySide = Faction.v[e] === FACTION.enemy
  return {
    faction: Faction.v[e]!,
    slot: attributionSlot(e),
    kb: Amp.kb[e]!,
    crit: Amp.crit[e]! + (Amp.battle[e] ? sim.battleFx.critAdd : 0),
    dmgMul: 1,
    name: enemySide ? enemyDef[Owner.eid[e]!]?.name : undefined,
    sight:
      sim.worldState.walls !== null && WallBlocked.v[e] && !enemySide
        ? { x: Transform.x[Anchor.eid[e]!]!, y: Transform.y[Anchor.eid[e]!]! }
        : undefined,
  }
}

export function boltSource(slot: number): Source {
  return { faction: FACTION.team, slot, kb: 1, crit: 0, dmgMul: 1 }
}

export function enemySource(name: string, dmgMul: number): Source {
  return { faction: FACTION.enemy, slot: -1, kb: 1, crit: 0, dmgMul, name }
}
