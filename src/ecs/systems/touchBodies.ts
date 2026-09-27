import { hasComponent, query, removeEntity } from 'bitecs'
import { Alive, Built, Contact, Ctl, Faction, MARK, Radius, Stats, Transform } from '../components'
import { hasMark } from '../utils/marks'
import { bodyRules } from '../store'
import { hit } from './shared/damage'
import { applyAbilityEffects, applyOnHit, struckOf } from './shared/effects'
import { selfSource, sourceOf } from '../utils/source'
import type { Source } from '../utils/source'
import { eachFoeBody } from '../utils/targets'
import type { Sim } from '../sim'

/** 谁在碰：造物算它的能力，其余算身体自己 */
function contactSource(sim: Sim, eid: number): Source {
  if (hasComponent(sim.world, eid, Built)) return sourceOf(sim, Built.by[eid]!)
  return selfSource(sim, eid)
}

/** 接触：带接触载荷的身体碰到能打的身体就打一下，每帧最多一下；这一帧不能出手的不打；打中后被碰者先按属性表反伤、再施加它的被碰规则，最后施加碰者的接触效果；接触不看隐匿与视线 */
export function touchBodies(sim: Sim): void {
  if (sim.over) return
  for (const eid of [...query(sim.world, [Contact, Transform, Radius, Alive, Faction])]) {
    if (!hasComponent(sim.world, eid, Contact)) continue
    if (!Alive.v[eid] || hasMark(sim, eid, MARK.morph) || (hasComponent(sim.world, eid, Ctl) && !Ctl.act[eid])) continue
    const src = contactSource(sim, eid)
    const dmg = Contact.damage[eid]!
    const kb = Contact.knockback[eid]!
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const touch = bodyRules[eid]?.onTouch
    let landed = false
    eachFoeBody(sim, src, x, y, Radius.v[eid]!, (t, tx, ty) => {
      const s = struckOf(t)
      if (!hit(sim, src, t, dmg, { knockback: kb, from: { x, y } })) return
      landed = true
      const thorns = Stats.thorns[t]!
      if (thorns > 0) hit(sim, selfSource(sim, t), eid, thorns)
      const back = bodyRules[t]?.onTouched
      if (back) applyAbilityEffects(sim, selfSource(sim, t), back, { x: tx, y: ty, baseDamage: dmg, targets: [eid] })
      applyOnHit(sim, src, touch, tx, ty, dmg, [s])
      return true
    })
    if (landed && Contact.vanish[eid]) {
      bodyRules[eid] = undefined
      removeEntity(sim.world, eid)
    }
  }
}
