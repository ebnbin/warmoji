import { addComponent, query, removeEntity } from 'bitecs'
import { newEntity } from './entity'
import { attachDrawable } from './drawable'
import { lookOf } from './shadow'
import { Alive, Echo, Sprite, Tint, Transform, Uid } from '../components'
import { abilityDef, echoPts } from '../store'
import { rewindMs } from '../../data/abilities'
import { cooled } from '../systems/shared/avail'
import { traceAt, tracePath } from '../systems/shared/trace'
import type { Sim } from '../sim'

const ECHO_COLOR = 0x80deea
const ECHO_ALPHA = 0.5
const COOLING_DIM = 0.4

function spawnEcho(sim: Sim, of: number): number {
  const e = newEntity(sim.world)
  attachDrawable(sim.world, e, sim.frames, { id: lookOf(sim, of), outline: 'player', x: Transform.x[of]!, y: Transform.y[of]!, size: Transform.w[of]!, z: 4, color: ECHO_COLOR, effect: 0, alpha: 0 })
  addComponent(sim.world, e, Echo)
  Echo.of[e] = of
  Echo.ofUid[e] = Uid.v[of]!
  return e
}

/** 队长的主动技能会倒带时，在倒带的落点留一个它的残影，这段路画在地上；冷却中更淡；换了队长或技能不倒带就撤掉 */
export function tickEchoes(sim: Sim): void {
  const lead = sim.leader
  const root = sim.skills[sim.characters.indexOf(lead)]
  const def = root === undefined ? undefined : abilityDef[root]
  const ms = def && Alive.v[lead] ? rewindMs(def) : 0
  const at = ms > 0 ? traceAt(sim, lead, ms) : null
  let echo = -1
  for (const e of [...query(sim.world, [Echo])]) {
    if (at && echo < 0 && Echo.of[e] === lead && Echo.ofUid[e] === Uid.v[lead]) echo = e
    else removeEntity(sim.world, e)
  }
  if (!at || root === undefined) return
  if (echo < 0) echo = spawnEcho(sim, lead)
  const dim = cooled(sim, root) ? 1 : COOLING_DIM
  Sprite.frame[echo] = sim.frames.index(lookOf(sim, lead), 'player')
  Transform.x[echo] = at.x
  Transform.y[echo] = at.y
  Transform.w[echo] = Transform.w[lead]!
  Transform.h[echo] = Transform.h[lead]!
  Tint.alpha[echo] = ECHO_ALPHA * dim
  Echo.dim[echo] = dim
  echoPts[echo] = tracePath(sim, lead, ms) ?? undefined
}
