import { addComponent, hasComponent, query } from 'bitecs'
import { Ability, Alive, Amp, Borrowed, Cd, Faction, Manual, Owner, Stage, Uid } from '../../components'
import { abilityDef } from '../../store'
import { equipAbility, NEUTRAL_AMP, unequipAbilities } from '../../entities/ability'
import { isSameEntity } from '../../utils/identity'
import type { AbilityDef } from '../../../types/abilityDefs'
import type { Sim } from '../../sim'

/** 借来的能力一律自动出手：瞄准不依赖原主的输入与队长，连段与轮换拆掉 */
function borrowedCopy(def: AbilityDef, cooldownMs: number): AbilityDef {
  const aim = def.aim === 'stick' || def.aim === 'leader' ? 'nearest' : def.aim
  return { ...def, trigger: 'auto', cooldownMs, aim, recast: undefined, cycle: undefined, hold: undefined }
}

/** 借来的能力按夺取那一下的能力倍率出手，身体直接夺的按中性倍率 */
function ampOf(sim: Sim, via: number | undefined): typeof NEUTRAL_AMP {
  if (via === undefined || !hasComponent(sim.world, via, Amp)) return NEUTRAL_AMP
  return { dmg: Amp.dmg[via]!, cd: Amp.cd[via]!, crit: Amp.crit[via]!, kb: Amp.kb[via]!, battle: Amp.battle[via] === 1 }
}

/** 夺取：从目标身上复制一条能力给自己用一阵，同时只借一条，连段的后续段不算；夺主动技能时原主的冷却重新走，夺取者死了原主立刻转好 */
export function stealAbility(sim: Sim, by: number, t: number, ms: number, cooldownMs: number, skill: boolean, via?: number): void {
  if (by === t || !Alive.v[by]) return
  const pool: number[] = []
  for (const e of query(sim.world, [Ability, Owner])) {
    if (Owner.eid[e] !== t || !abilityDef[e] || hasComponent(sim.world, e, Borrowed)) continue
    if (hasComponent(sim.world, e, Stage) && Stage.root[e] !== 0) continue
    if (skill !== hasComponent(sim.world, e, Manual)) continue
    pool.push(e)
  }
  if (pool.length === 0) return
  const from = pool[Math.floor(sim.rng.next() * pool.length)]!
  unequipAbilities(sim, by, (e) => hasComponent(sim.world, e, Borrowed))
  const e = equipAbility(sim, by, borrowedCopy(abilityDef[from]!, cooldownMs), Faction.v[by]!, 300, ampOf(sim, via))
  addComponent(sim.world, e, Borrowed)
  Borrowed.until[e] = sim.elapsedMs + ms
  Borrowed.from[e] = skill ? from : -1
  Borrowed.fromUid[e] = skill ? Uid.v[from]! : 0
  if (skill) Cd.left[from] = Math.max(Cd.left[from]!, Cd.base[from]!)
}

/** 夺来的主动技能在夺取者死时还给原主：冷却转好 */
export function returnBorrowed(sim: Sim, by: number): void {
  for (const e of query(sim.world, [Borrowed, Owner])) {
    if (Owner.eid[e] !== by || Borrowed.fromUid[e] === 0) continue
    const from = Borrowed.from[e]!
    if (isSameEntity(sim.world, from, Borrowed.fromUid[e]!)) Cd.left[from] = 0
  }
}

/** 借期到了就撤掉 */
export function tickBorrowed(sim: Sim): void {
  const now = sim.elapsedMs
  for (const e of [...query(sim.world, [Borrowed, Owner])]) {
    if (now < Borrowed.until[e]!) continue
    const o = Owner.eid[e]!
    unequipAbilities(sim, o, (x) => x === e)
  }
}
