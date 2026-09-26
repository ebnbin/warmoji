import { hasComponent, query, removeEntity } from 'bitecs'
import { Alive, Built, CharPerk, Contact, Dormant, Faction, MARK, Radius, Slot, Transform } from '../components'
import { dmgMul, hasMark } from '../utils/marks'
import { contactEffects, enemyDef } from '../store'
import { hit } from './shared/damage'
import { applyAbilityEffects } from './shared/effects'
import { bodySource, boltSource, enemySource, sourceOf } from '../utils/source'
import type { Source } from '../utils/source'
import { eachFoeBody } from '../utils/targets'
import type { Sim } from '../sim'

/** 谁在碰：造物算它的能力，敌人算它自己，其余只是个身体 */
function contactSource(sim: Sim, eid: number): Source {
  if (hasComponent(sim.world, eid, Built)) return sourceOf(sim, Built.by[eid]!)
  const def = enemyDef[eid]
  return def ? enemySource(def.kind, dmgMul(sim, eid)) : bodySource(eid)
}

/** 接触：带接触载荷的身体碰到敌方身体就打一下，每帧最多一下；被碰者的荆棘反弹给碰的人；接触不看隐匿与视线 */
export function touchBodies(sim: Sim): void {
  if (sim.over) return
  for (const eid of [...query(sim.world, [Contact, Transform, Radius, Alive, Faction])]) {
    if (!hasComponent(sim.world, eid, Contact)) continue
    if (!Alive.v[eid] || Dormant.v[eid] || hasMark(sim, eid, MARK.morph)) continue
    const src = contactSource(sim, eid)
    const dmg = Math.max(1, Math.round(Contact.damage[eid]! * src.dmgMul))
    const kb = Contact.knockback[eid]!
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const fx = contactEffects[eid]
    let landed = false
    eachFoeBody(sim, src.faction, x, y, Radius.v[eid]!, (t, tx, ty) => {
      if (!hit(sim, src, t, dmg, { knockback: kb, from: { x, y } })) return
      landed = true
      if (CharPerk.thorns[t]! > 0) hit(sim, boltSource(Slot.v[t]!), eid, CharPerk.thorns[t]!)
      if (fx && fx.length > 0) applyAbilityEffects(sim, src, fx, { x: tx, y: ty, baseDamage: 0, targets: [t] })
      return true
    })
    if (landed && Contact.vanish[eid]) {
      contactEffects[eid] = undefined
      removeEntity(sim.world, eid)
    }
  }
}
