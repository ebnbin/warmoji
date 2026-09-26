import { Amp, Anchor, FACTION, Faction, Owner, WallBlocked } from '../components'
import { Transform } from '../components'
import { enemyDef } from '../store'
import { attributionSlot } from './amp'
import type { Sim } from '../sim'
import type { EnemyKind } from '../../types/enemies'
import type { Hazard } from '../../types/maps'

/** 一次伤害的来源：阵营决定打谁，其余是归因与倍率 */
export interface Source {
  readonly faction: number
  readonly slot: number
  readonly kb: number
  readonly crit: number
  readonly dmgMul: number
  readonly enemy?: EnemyKind
  readonly hazard?: Hazard
  readonly tint?: number
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
    enemy: enemySide ? enemyDef[Owner.eid[e]!]?.kind : undefined,
    sight:
      sim.worldState.walls !== null && WallBlocked.v[e] && !enemySide
        ? { x: Transform.x[Anchor.eid[e]!]!, y: Transform.y[Anchor.eid[e]!]! }
        : undefined,
  }
}

export function boltSource(slot: number): Source {
  return { faction: FACTION.team, slot, kb: 1, crit: 0, dmgMul: 1 }
}

export function enemySource(enemy: EnemyKind, dmgMul: number): Source {
  return { faction: FACTION.enemy, slot: -1, kb: 1, crit: 0, dmgMul, enemy }
}

export function hazardSource(hazard: Hazard, tint: number): Source {
  return { faction: FACTION.world, slot: -1, kb: 1, crit: 0, dmgMul: 1, hazard, tint }
}

export const WORLD_SOURCE: Source = { faction: FACTION.world, slot: -1, kb: 1, crit: 0, dmgMul: 1 }
