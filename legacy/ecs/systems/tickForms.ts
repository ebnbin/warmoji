import { query } from 'bitecs'
import { Alive, Form, Transform } from '../components'
import { formEnd } from '../store'
import { applyForm } from '../entities/form'
import { applyAbilityEffects } from './shared/effects'
import { selfSource } from '../utils/source'
import type { Sim } from '../sim'

/** 限时形态到点切回本体，再施加结束效果 */
export function tickForms(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of [...query(sim.world, [Form])]) {
    const until = Form.until[eid]!
    if (until === 0 || now < until || !Alive.v[eid]) continue
    const end = formEnd[eid]
    applyForm(sim, eid, -1)
    if (end) applyAbilityEffects(sim, selfSource(sim, eid), end, { x: Transform.x[eid]!, y: Transform.y[eid]!, baseDamage: 0, targets: [eid] })
  }
}
