import { query } from 'bitecs'
import { Alive, Dormant, Res } from '../components'
import { resDef } from '../store'
import type { Sim } from '../sim'

/** 资源的时钟：按秒回复，闲下来一阵后按秒流失；倒下与休眠的身体不走 */
export function tickResources(sim: Sim): void {
  const dt = sim.wdtMs / 1000
  const now = sim.elapsedMs
  for (const eid of query(sim.world, [Res])) {
    const def = resDef[eid]
    if (!def || !Alive.v[eid] || Dormant.v[eid]) continue
    let v = Res.v[eid]!
    if (def.regen) v += def.regen * dt
    if (def.decay && now - Res.lastGain[eid]! >= (def.decayDelayMs ?? 0)) v -= def.decay * dt
    Res.v[eid] = Math.max(0, Math.min(Res.max[eid]!, v))
  }
}
