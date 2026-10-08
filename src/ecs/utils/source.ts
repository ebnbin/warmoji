import { hasComponent } from 'bitecs'
import { Anchor, FACTION, Faction, FlyerShape, Minion, Owner, Sector, Segment, Slot, SprintShape, SummonShape, Summoned, Uid, WallBlocked } from '../components'
import { Transform } from '../components'
import { abilityDef, enemyDef } from '../store'
import { attributionSlot, creditSlot } from './ability'
import { deliveryOf, HIT } from './hitTags'
import { isTurncoat, realmOf } from './marks'
import { isSameEntity } from './identity'
import { NEUTRAL, offenseOf } from './stats'
import { bandOf, eyeM } from './pass'
import { strikeElement } from './element'
import { ENEMIES } from '../../data/enemies'
import { elementIndex } from '../../data/elements'
import type { Band } from './pass'
import type { Offense } from './stats'
import type { Sim } from '../sim'
import type { EnemyKind } from '../../types/enemies'
import type { Hazard } from '../../types/maps'

/** 一次伤害的来源：阵营决定打谁，其余是归因与倍率 */
export interface Source {
  readonly faction: number
  readonly slot: number
  /** 出手者的属性：结算时出手的身体还在就按它此刻的属性表，不在了才用这份出手时记下的 */
  readonly atk: Offense
  /** 这一下不会暴击：场地 */
  readonly noCrit?: boolean
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
  /** 瞄准时从哪里看、眼睛离地多高（米）：看不见的不瞄；出手不受障碍阻挡的没有 */
  readonly sight?: { readonly x: number; readonly y: number; readonly eye: number }
  /** 这一下被障碍挡：近战、爆炸与场只打得到从出手处够得着的身体 */
  readonly blocked?: boolean
  /** 这一下打在哪一段高度：只打得到占着其中一处的身体，不写的不论高低 */
  readonly band?: Band
  /** 出手的位置：迷雾里的身体只能被同在迷雾里出手的打到 */
  readonly from?: { readonly x: number; readonly y: number }
  /** 伤害标签（见 hitTags）：出手方式与是否来自召唤物；范围与持续由出手处补上 */
  readonly tags?: number
  /** 这一下的元素编号，0 或不写是无元素 */
  readonly element?: number
}

/** 出手者眼里的敌方阵营：倒戈时是自己的阵营 */
function foesOf(sim: Sim, body: number, faction: number): readonly number[] | undefined {
  return isTurncoat(sim, body) ? [faction] : undefined
}

/** 能力出手的来源：出手方式按能力定；蜂群、装置与被召出的身体出的手带召唤标签 */
export function sourceOf(sim: Sim, e: number): Source {
  const enemySide = Faction.v[e] === FACTION.enemy
  const o = Owner.eid[e]!
  const w = sim.world
  const summon = hasComponent(w, e, SummonShape) || hasComponent(w, Anchor.eid[e]!, Minion) || hasComponent(w, o, Summoned)
  return {
    faction: Faction.v[e]!,
    slot: attributionSlot(sim, e),
    atk: offenseOf(sim.world, o),
    enemy: enemySide ? enemyDef[Owner.eid[e]!]?.kind : undefined,
    viewer: Owner.eid[e]!,
    body: o,
    bodyUid: Uid.v[o]!,
    ability: e,
    foes: foesOf(sim, o, Faction.v[e]!),
    realm: realmOf(sim, o),
    from: { x: Transform.x[Anchor.eid[e]!]!, y: Transform.y[Anchor.eid[e]!]! },
    sight: WallBlocked.v[e] ? { x: Transform.x[Anchor.eid[e]!]!, y: Transform.y[Anchor.eid[e]!]!, eye: eyeM(sim.world, Anchor.eid[e]!) } : undefined,
    blocked: WallBlocked.v[e] === 1,
    tags: deliveryOf(abilityDef[e]) | (summon ? HIT.summon : 0),
    element: strikeElement(sim, abilityDef[e], o),
  }
}

/** 近战、冲刺与飞返体只扫得到出手者自己占的那一段 */
export function sweep(sim: Sim, e: number, src: Source): Source {
  const w = sim.world
  if (!hasComponent(w, e, Segment) && !hasComponent(w, e, Sector) && !hasComponent(w, e, SprintShape) && !hasComponent(w, e, FlyerShape)) return src
  return { ...src, band: bandOf(sim, Owner.eid[e]!) }
}

/** 身体自己在看：转向用 */
export function bodySource(sim: Sim, eid: number): Source {
  const faction = Faction.v[eid]!
  return { faction, slot: -1, atk: NEUTRAL, viewer: eid, body: eid, bodyUid: Uid.v[eid]!, foes: foesOf(sim, eid, faction), realm: realmOf(sim, eid), from: { x: Transform.x[eid]!, y: Transform.y[eid]! } }
}

/** 身体自己作为伤害来源，按自己的属性表结算：角色归因到槽位，我方召唤物归因到召唤者，敌人归因到种类；不带出手方式，由出手处给 */
export function selfSource(sim: Sim, eid: number): Source {
  const tags = hasComponent(sim.world, eid, Summoned) ? HIT.summon : 0
  const own = { body: eid, bodyUid: Uid.v[eid]!, foes: foesOf(sim, eid, Faction.v[eid]!), realm: realmOf(sim, eid), from: { x: Transform.x[eid]!, y: Transform.y[eid]! }, tags, element: strikeElement(sim, undefined, eid) }
  const atk = offenseOf(sim.world, eid)
  if (hasComponent(sim.world, eid, Slot)) return { faction: FACTION.team, slot: Slot.v[eid]!, atk, ...own }
  const def = enemyDef[eid]
  const faction = Faction.v[eid]!
  return def ? { ...enemySource(def.kind, atk), faction, slot: faction === FACTION.team ? creditSlot(sim, eid) : -1, ...own } : bodySource(sim, eid)
}

/** 飞出去的东西自己看：不带发射者的视角与视线，挡不挡照旧 */
export function flying(src: Source): Source {
  return { ...src, viewer: undefined, sight: undefined }
}

export function enemySource(enemy: EnemyKind | undefined, atk: Offense): Source {
  return { faction: FACTION.enemy, slot: -1, atk, enemy, element: elementIndex(enemy === undefined ? undefined : ENEMIES[enemy].element) }
}

export function hazardSource(hazard: Hazard, tint: number): Source {
  return { faction: FACTION.world, slot: -1, atk: NEUTRAL, hazard, tint }
}

export const WORLD_SOURCE: Source = { faction: FACTION.world, slot: -1, atk: NEUTRAL }

/** 结算时用的出手属性：出手的身体还在就读它此刻的属性表，否则用出手时记下的 */
export function attackOf(sim: Sim, src: Source): Offense {
  const b = src.body
  return b !== undefined && isSameEntity(sim.world, b, src.bodyUid ?? 0) ? offenseOf(sim.world, b) : src.atk
}
