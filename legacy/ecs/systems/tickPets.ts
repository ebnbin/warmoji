import { query } from 'bitecs'
import { PET_TRAIL_MS } from '../../data/abilities'
import { Alive, Faction, Hp, Mounted, Pet, PET, Transform } from '../components'
import { traceAt } from './shared/trace'
import type { Sim } from '../sim'

const SPIN = 2.2

/** 同阵营血量比例最低的活着的身体，没有就是宿主 */
function lowestAlly(sim: Sim, host: number): number {
  let best = host
  let bestR = Infinity
  for (const t of sim.targets[Faction.v[host]!] ?? []) {
    if (!t.alive || !Alive.v[t.eid]) continue
    const r = Hp.v[t.eid]! / Math.max(1, Hp.max[t.eid]!)
    if (r < bestR) {
      bestR = r
      best = t.eid
    }
  }
  return best
}

/** 施法锚点物件的摆放：绕宿主转、落在宿主一阵子前的位置、或贴着血量最低的同伴；都是平滑追过去 */
export function tickPets(sim: Sim): void {
  const dt = sim.wdtMs / 1000
  const k = Math.min(1, dt * 10)
  for (const p of query(sim.world, [Pet, Transform])) {
    const host = Mounted.host[p]!
    const dist = Pet.dist[p]!
    let tx = Transform.x[host]!
    let ty = Transform.y[host]!
    switch (Pet.mode[p]) {
      case PET.orbit: {
        Pet.phase[p] = Pet.phase[p]! + SPIN * dt
        tx += Math.cos(Pet.phase[p]!) * dist
        ty += Math.sin(Pet.phase[p]!) * dist
        break
      }
      case PET.trail: {
        const at = traceAt(sim, host, PET_TRAIL_MS)
        if (at) {
          tx = at.x
          ty = at.y
        }
        break
      }
      default: {
        const a = lowestAlly(sim, host)
        tx = Transform.x[a]! + dist * 0.7
        ty = Transform.y[a]! - dist * 0.7
      }
    }
    const d = sim.hooks.worldDelta(sim, Transform.x[p]!, Transform.y[p]!, tx, ty)
    const to = sim.hooks.wrap(sim, Transform.x[p]! + d.x * k, Transform.y[p]! + d.y * k)
    Transform.x[p] = to.x
    Transform.y[p] = to.y
  }
}
