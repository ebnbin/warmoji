import { Pop } from '../components'
import type { Sim } from '../sim'

/** 弹一下：从现在起 ms 毫秒内由小放大到正常大小，走画面时钟 */
export function startPop(sim: Sim, eid: number, ms: number): void {
  Pop.until[eid] = sim.fxMs + ms
  Pop.ms[eid] = ms
}
