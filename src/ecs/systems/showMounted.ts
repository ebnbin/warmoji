import { query } from 'bitecs'
import { Mounted, Tint } from '../components'
import { hostShown } from '../utils/statusTint'
import type { Sim } from '../sim'

/** 挂在身体上的实体画出来的透明度：它自己该不该出现，乘上随宿主的那一份 */
export function showMounted(sim: Sim): void {
  for (const e of query(sim.world, [Mounted, Tint])) Tint.alpha[e] = Mounted.show[e]! * hostShown(Mounted.host[e]!)
}
