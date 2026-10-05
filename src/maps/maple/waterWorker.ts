import { solveMaple } from './water'
import type { MaplePlan } from './layout'
import type { MapleConfig } from '../../types/maps'

self.onmessage = (e: MessageEvent<{ cfg: MapleConfig; plan: MaplePlan }>) => {
  const w = solveMaple(e.data.cfg, e.data.plan)
  self.postMessage(w, { transfer: [w.z.buffer, w.h.buffer, w.u.buffer, w.v.buffer, w.sink.buffer] })
}
