import { addComponents, query, removeEntity } from 'bitecs'
import { newEntity } from './entity'
import { Alive, Tether, Transform, Uid } from '../components'
import { tetherBreak, tetherHold, tetherSrc } from '../store'
import { isSameEntity } from '../utils/identity'
import { applyAbilityEffects } from '../systems/shared/effects'
import type { Effect } from '../../types/abilityDefs'
import type { Source } from '../utils/source'
import type { Sim } from '../sim'

/** 牵一根绳：a 是施法者，b 是被牵的 */
export function spawnTether(sim: Sim, src: Source, a: number, b: number, ms: number, range: number, color: number, hold?: readonly Effect[], brk?: readonly Effect[]): void {
  const e = newEntity(sim.world)
  addComponents(sim.world, e, Tether)
  Tether.a[e] = a
  Tether.aUid[e] = Uid.v[a]!
  Tether.b[e] = b
  Tether.bUid[e] = Uid.v[b]!
  Tether.until[e] = sim.elapsedMs + ms
  Tether.range[e] = range
  Tether.color[e] = color
  tetherSrc[e] = src
  tetherHold[e] = hold
  tetherBreak[e] = brk
}

/** 绳的时钟：一端没了就散，被牵的跑出范围就断，撑满时长就结算 */
export function tickTethers(sim: Sim): void {
  const now = sim.elapsedMs
  for (const e of [...query(sim.world, [Tether])]) {
    const a = Tether.a[e]!
    const b = Tether.b[e]!
    const src = tetherSrc[e]
    if (!src || !isSameEntity(sim.world, a, Tether.aUid[e]!) || !isSameEntity(sim.world, b, Tether.bUid[e]!) || !Alive.v[a] || !Alive.v[b]) {
      removeEntity(sim.world, e)
      continue
    }
    const d = sim.hooks.worldDelta(sim, Transform.x[a]!, Transform.y[a]!, Transform.x[b]!, Transform.y[b]!)
    const at = { x: Transform.x[b]!, y: Transform.y[b]!, baseDamage: 0, targets: [b] }
    if (d.x * d.x + d.y * d.y > Tether.range[e]! * Tether.range[e]!) {
      removeEntity(sim.world, e)
      applyAbilityEffects(sim, src, tetherBreak[e], at)
      continue
    }
    if (now < Tether.until[e]!) continue
    const hold = tetherHold[e]
    removeEntity(sim.world, e)
    applyAbilityEffects(sim, src, hold, at)
  }
}
