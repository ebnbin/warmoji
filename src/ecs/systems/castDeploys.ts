import { Deploy } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import { place } from '../entities/minion'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

/** 绕施法者均匀放一圈，落点经场地约束 */
export function castDeploys(sim: Sim, scan = castScan): void {
  scan(sim, Deploy, (e) => {
    const n = Deploy.count[e]!
    const r = Deploy.spread[e]!
    const life = Deploy.lifeMs[e]!
    const ox = ownerX(e)
    const oy = ownerY(e)
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / n
      const at = sim.hooks.constrainBody(sim, { x: ox, y: oy }, { x: ox + Math.cos(a) * r, y: oy + Math.sin(a) * r }, sim.dtMs)
      place(sim, e, at, life)
    }
  })
}
