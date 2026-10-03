import { solveWater } from './water'
import type { RiverPlan } from './layout'
import type { RiverConfig } from '../../types/maps'

self.onmessage = (e: MessageEvent<{ cfg: RiverConfig; plan: RiverPlan }>) => {
  const w = solveWater(e.data.cfg, e.data.plan)
  self.postMessage(w, { transfer: [w.z.buffer, w.h.buffer, w.u.buffer, w.v.buffer, w.sink.buffer] })
}
