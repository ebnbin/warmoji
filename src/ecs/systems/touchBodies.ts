import { hasComponent, query, removeEntity } from 'bitecs'
import { Alive, Built, Contact, Dormant, Faction, MARK, Radius, Transform } from '../components'
import { hasMark } from '../utils/marks'
import { bodyRules } from '../store'
import { hit } from './shared/damage'
import { applyAbilityEffects } from './shared/effects'
import { selfSource, sourceOf } from '../utils/source'
import type { Source } from '../utils/source'
import { eachFoeBody } from '../utils/targets'
import type { Sim } from '../sim'

/** 谁在碰：造物算它的能力，其余算身体自己 */
function contactSource(sim: Sim, eid: number): Source {
  if (hasComponent(sim.world, eid, Built)) return sourceOf(sim, Built.by[eid]!)
  return selfSource(sim, eid)
}

/** 接触：带接触载荷的身体碰到敌方身体就打一下，每帧最多一下；打中后先让被碰者反应，再施加碰者的接触效果；接触不看隐匿与视线 */
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
    const touch = bodyRules[eid]?.onTouch
    let landed = false
    eachFoeBody(sim, src.faction, x, y, Radius.v[eid]!, (t, tx, ty) => {
      if (!hit(sim, src, t, dmg, { knockback: kb, from: { x, y } })) return
      landed = true
      const back = bodyRules[t]?.onTouched
      if (back) applyAbilityEffects(sim, selfSource(sim, t), back, { x: tx, y: ty, baseDamage: dmg, targets: [eid] })
      if (touch) applyAbilityEffects(sim, src, touch, { x: tx, y: ty, baseDamage: 0, targets: [t] })
      return true
    })
    if (landed && Contact.vanish[eid]) {
      bodyRules[eid] = undefined
      removeEntity(sim.world, eid)
    }
  }
}
