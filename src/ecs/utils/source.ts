import { hasComponent } from 'bitecs'
import { Amp, Anchor, FACTION, Faction, Owner, Slot, WallBlocked } from '../components'
import { Transform } from '../components'
import { enemyDef } from '../store'
import { attributionSlot, damageMul } from './amp'
import { dmgMul } from './marks'
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
  /** 在看的身体：被嘲讽时只看得见嘲讽者 */
  readonly viewer?: number
  readonly sight?: { readonly x: number; readonly y: number }
}

export function sourceOf(sim: Sim, e: number): Source {
  const enemySide = Faction.v[e] === FACTION.enemy
  return {
    faction: Faction.v[e]!,
    slot: attributionSlot(e),
    kb: Amp.kb[e]!,
    crit: Amp.crit[e]! + (Amp.battle[e] ? sim.battleFx.critAdd : 0),
    dmgMul: damageMul(sim, e),
    enemy: enemySide ? enemyDef[Owner.eid[e]!]?.kind : undefined,
    viewer: Owner.eid[e]!,
    sight:
      sim.worldState.walls !== null && WallBlocked.v[e]
        ? { x: Transform.x[Anchor.eid[e]!]!, y: Transform.y[Anchor.eid[e]!]! }
        : undefined,
  }
}

/** 身体自己在看：转向与接触用 */
export function bodySource(eid: number): Source {
  return { faction: Faction.v[eid]!, slot: -1, kb: 1, crit: 0, dmgMul: 1, viewer: eid }
}

/** 身体自己作为伤害来源：角色归因到槽位，敌人归因到种类并带身上的伤害倍率 */
export function selfSource(sim: Sim, eid: number): Source {
  if (hasComponent(sim.world, eid, Slot)) return boltSource(Slot.v[eid]!)
  const def = enemyDef[eid]
  return def ? enemySource(def.kind, dmgMul(sim, eid)) : bodySource(eid)
}

/** 飞出去的身体自己看：不带发射者的视角与视线 */
export function flying(src: Source): Source {
  return { ...src, viewer: undefined, sight: undefined }
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
