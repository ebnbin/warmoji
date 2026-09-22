import { Amp, Anchor, FACTION, Faction, Owner, WallBlocked } from '../components'
import { Transform } from '../components'
import { enemyDef } from '../store'
import { attributionSlot } from './amp'
import type { Sim } from '../sim'

// 一次结算的来源是一份值，不依赖来源实体还在不在

export interface Source {
  /** 决定落在哪一侧 */
  readonly faction: number
  /** 非队员来源 -1 */
  readonly slot: number
  /** 命中链与亡语为 1 */
  readonly kb: number
  /** 命中链与亡语为 0 */
  readonly crit: number
  /** 亡语冷枪按死者体质缩放，其余 1 */
  readonly dmgMul: number
  /** 战报按敌人名归属 */
  readonly name?: string
  /** 断壁遮挡的视点：给出时索敌须从这里探得到头；缺省不遮挡 */
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

/** 不掷暴击、不乘击退倍率 */
export function boltSource(slot: number): Source {
  return { faction: FACTION.team, slot, kb: 1, crit: 0, dmgMul: 1 }
}

/** 不掷暴击、不乘击退倍率，发弹按体质缩放 */
export function enemySource(name: string, dmgMul: number): Source {
  return { faction: FACTION.enemy, slot: -1, kb: 1, crit: 0, dmgMul, name }
}
