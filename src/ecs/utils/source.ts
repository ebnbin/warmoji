import { hasComponent } from 'bitecs'
import { Amp, Anchor, FACTION, Faction, MARK, Owner, Slot, Uid, WallBlocked } from '../components'
import { Transform } from '../components'
import { enemyDef } from '../store'
import { attributionSlot, damageMul } from './amp'
import { dmgMul, hasMark, realmOf } from './marks'
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
  /** 出手的身体与它的编号：击杀反应、施于施法者的效果都找它 */
  readonly body?: number
  readonly bodyUid?: number
  /** 能打哪些阵营：不写按阵营的敌人算，倒戈时是自己的阵营 */
  readonly foes?: readonly number[]
  /** 所在的界：只打得到同一个界里的身体，0 是大家共处的世界 */
  readonly realm?: number
  /** 出手的那条能力 */
  readonly ability?: number
  readonly sight?: { readonly x: number; readonly y: number }
}

/** 出手者眼里的敌方阵营：倒戈时是自己的阵营 */
function foesOf(sim: Sim, body: number, faction: number): readonly number[] | undefined {
  return hasMark(sim, body, MARK.berserk) ? [faction] : undefined
}

export function sourceOf(sim: Sim, e: number): Source {
  const enemySide = Faction.v[e] === FACTION.enemy
  const o = Owner.eid[e]!
  return {
    faction: Faction.v[e]!,
    slot: attributionSlot(sim, e),
    kb: Amp.kb[e]!,
    crit: Amp.crit[e]! + (Amp.battle[e] ? sim.battleFx.critAdd : 0),
    dmgMul: damageMul(sim, e),
    enemy: enemySide ? enemyDef[Owner.eid[e]!]?.kind : undefined,
    viewer: Owner.eid[e]!,
    body: o,
    bodyUid: Uid.v[o]!,
    ability: e,
    foes: foesOf(sim, o, Faction.v[e]!),
    realm: realmOf(sim, o),
    sight:
      sim.worldState.walls !== null && WallBlocked.v[e]
        ? { x: Transform.x[Anchor.eid[e]!]!, y: Transform.y[Anchor.eid[e]!]! }
        : undefined,
  }
}

/** 身体自己在看：转向用 */
export function bodySource(sim: Sim, eid: number): Source {
  const faction = Faction.v[eid]!
  return { faction, slot: -1, kb: 1, crit: 0, dmgMul: 1, viewer: eid, body: eid, bodyUid: Uid.v[eid]!, foes: foesOf(sim, eid, faction), realm: realmOf(sim, eid) }
}

/** 身体自己作为伤害来源：角色归因到槽位，敌人归因到种类并带身上的伤害倍率 */
export function selfSource(sim: Sim, eid: number): Source {
  const own = { body: eid, bodyUid: Uid.v[eid]!, foes: foesOf(sim, eid, Faction.v[eid]!), realm: realmOf(sim, eid) }
  if (hasComponent(sim.world, eid, Slot)) return { ...boltSource(Slot.v[eid]!), ...own }
  const def = enemyDef[eid]
  return def ? { ...enemySource(def.kind, dmgMul(sim, eid)), faction: Faction.v[eid]!, ...own } : bodySource(sim, eid)
}

/** 飞出去的身体自己看：不带发射者的视角与视线 */
export function flying(src: Source): Source {
  return { ...src, viewer: undefined, sight: undefined }
}

function boltSource(slot: number): Source {
  return { faction: FACTION.team, slot, kb: 1, crit: 0, dmgMul: 1 }
}

export function enemySource(enemy: EnemyKind | undefined, dmgMul: number): Source {
  return { faction: FACTION.enemy, slot: -1, kb: 1, crit: 0, dmgMul, enemy }
}

export function hazardSource(hazard: Hazard, tint: number): Source {
  return { faction: FACTION.world, slot: -1, kb: 1, crit: 0, dmgMul: 1, hazard, tint }
}

export const WORLD_SOURCE: Source = { faction: FACTION.world, slot: -1, kb: 1, crit: 0, dmgMul: 1 }
