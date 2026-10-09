import { hasComponent, query, removeComponent } from 'bitecs'
import { Ability, Act, Alive, BLINK, BlinkState, Casting, CastRequest, Cd, Manual, Motion, MOTION, Owner, RepeatState, Stage, WindupState } from '../components'
import { abilityCombo, abilityDef, enemyDef, npcCombo } from '../store'
import { grantedAbility } from '../entities/ability'
import { fireAbility } from './shared/fire'
import { ready, spend, stall } from './shared/avail'
import { gearSkill } from './shared/gear'
import type { Sim } from '../sim'

/** 出了手记账；手动能力的第一段算放了一次主动技能 */
function fired(sim: Sim, e: number): void {
  spend(sim, e)
  if (hasComponent(sim.world, e, Manual) && !(hasComponent(sim.world, e, Stage) && Stage.root[e] !== 0)) gearSkill(sim, Owner.eid[e]!)
}

/** 手上正有事没做完的身体：蓄力、延迟重复、瞬袭、自己的冲刺 */
function busyBodies(sim: Sim): Set<number> {
  const out = new Set<number>()
  const now = sim.elapsedMs
  for (const e of query(sim.world, [Ability, Owner])) {
    if (WindupState.until[e]! > 0 || RepeatState.left[e]! > 0 || BlinkState.phase[e] !== BLINK.none) out.add(Owner.eid[e]!)
  }
  for (const o of query(sim.world, [Act])) {
    if (Casting.until[o]! > now || (Motion.kind[o] === MOTION.dash && Motion.self[o])) out.add(o)
  }
  return out
}

/** 非玩家身体这一刻出一招：手上有事就等；连招没放完先放连招，瞄不到就断；否则过了公共冷却，从能出的招里按优先级挑第一招出得去的，试过没出去的轮换记一笔 */
function act(sim: Sim, o: number, candidates: readonly number[]): void {
  const combo = npcCombo[o]
  if (combo) {
    const step = grantedAbility(sim, o, combo.list[combo.next]!)
    if (fireAbility(sim, step) && ++combo.next < combo.list.length) return
    npcCombo[o] = undefined
    return
  }
  if (sim.elapsedMs < Act.gcdUntil[o]!) return
  const order = [...candidates].sort((a, b) => (abilityDef[b]?.priority ?? 0) - (abilityDef[a]?.priority ?? 0) || a - b)
  for (const e of order) {
    if (!fireAbility(sim, e)) {
      stall(sim, e)
      continue
    }
    spend(sim, e)
    Act.gcdUntil[o] = sim.elapsedMs + (enemyDef[o]?.gcdMs ?? 0)
    const list = abilityCombo[e]
    if (list && list.length > 0) npcCombo[o] = { list, next: 0 }
    return
  }
}

/** 自动能力：能出手就出手，出了手再记账；没出成手下一帧再试，轮换的记一笔；非玩家身体一次只做一件事，见 act */
export function castAbilities(sim: Sim): void {
  const npcs = new Map<number, number[]>()
  for (const e of [...query(sim.world, [Ability, Cd])]) {
    if (!hasComponent(sim.world, e, Ability)) continue
    if (hasComponent(sim.world, e, CastRequest)) {
      removeComponent(sim.world, e, CastRequest)
      if (ready(sim, e) && fireAbility(sim, e)) fired(sim, e)
      continue
    }
    if (hasComponent(sim.world, e, Manual)) continue
    const o = Owner.eid[e]!
    if (hasComponent(sim.world, o, Act)) {
      if (ready(sim, e)) {
        const list = npcs.get(o)
        if (list) list.push(e)
        else npcs.set(o, [e])
      }
      continue
    }
    if (!ready(sim, e)) continue
    if (!fireAbility(sim, e)) {
      stall(sim, e)
      continue
    }
    spend(sim, e)
  }
  const busy = busyBodies(sim)
  for (const o of [...query(sim.world, [Act])]) {
    if (!Alive.v[o] || busy.has(o)) continue
    const list = npcs.get(o)
    if (list || npcCombo[o]) act(sim, o, list ?? [])
  }
}

/** 手动能力只在被请求时出手 */
export function castRequests(sim: Sim): void {
  for (const e of [...query(sim.world, [Ability, Manual, CastRequest])]) {
    if (!hasComponent(sim.world, e, CastRequest)) continue
    removeComponent(sim.world, e, CastRequest)
    if (ready(sim, e) && fireAbility(sim, e)) fired(sim, e)
  }
}
