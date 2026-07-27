import { Amp, Anchor, FACTION, Faction, Owner, WallBlocked } from '../components'
import { Transform } from '../components'
import { enemyDef } from '../store'
import { attributionSlot } from './amp'
import type { Sim } from '../sim'

// 一次结算的来源：谁打的、算谁的账、带什么乘区。能力实体、在途弹丸、死亡快照都能给出
// 这么一份——效果层因此不依赖「来源实体还在不在场上」（子弹常比发射者活得久）。

export interface Source {
  /** FACTION.team | FACTION.enemy：决定这一下落在哪一侧 */
  readonly faction: number
  /** 伤害归属槽位（队伍侧战报分账；非队员来源 -1） */
  readonly slot: number
  /** 击退倍率（能力出手吃道具乘区；命中链与亡语是裸值 1） */
  readonly kb: number
  /** 暴击率（同上，裸值 0） */
  readonly crit: number
  /** 发弹伤害倍率（亡语冷枪按死者体质缩放；其余为 1） */
  readonly dmgMul: number
  /** 敌方来源名（战报按敌人名归属） */
  readonly name?: string
  /** 断壁遮挡的视点：给出时索敌须从这里探得到头；缺省不遮挡 */
  readonly sight?: { readonly x: number; readonly y: number }
}

/** 能力实体的来源 */
export function sourceOf(sim: Sim, e: number): Source {
  const enemySide = Faction.v[e] === FACTION.enemy
  return {
    faction: Faction.v[e]!,
    slot: attributionSlot(e),
    kb: Amp.kb[e]!,
    crit: Amp.crit[e]! + (Amp.battle[e] ? sim.battleFx.critAdd : 0),
    dmgMul: 1,
    name: enemySide ? enemyDef[Owner.eid[e]!]?.name : undefined,
    // 无墙图与穿墙能力整条判定短路（wallHit 恒 null，白扫一遍不值当）
    sight:
      sim.worldState.walls !== null && WallBlocked.v[e] && !enemySide
        ? { x: Transform.x[Anchor.eid[e]!]!, y: Transform.y[Anchor.eid[e]!]! }
        : undefined,
  }
}

/** 队伍侧弹丸命中链的来源：不掷暴击、不乘击退倍率（溅射只是主伤的附带） */
export function boltSource(slot: number): Source {
  return { faction: FACTION.team, slot, kb: 1, crit: 0, dmgMul: 1 }
}

/** 敌方的非能力来源（亡语 / 接触）：不掷暴击、不乘击退倍率，发弹按体质缩放 */
export function enemySource(name: string, dmgMul: number): Source {
  return { faction: FACTION.enemy, slot: -1, kb: 1, crit: 0, dmgMul, name }
}
