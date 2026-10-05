import { solveSakura } from './water'
import type { SakuraPlan } from './layout'
import type { SakuraConfig } from '../../types/maps'

self.onmessage = (e: MessageEvent<{ cfg: SakuraConfig; plan: SakuraPlan }>) => {
  const w = solveSakura(e.data.cfg, e.data.plan)
  self.postMessage(w, { transfer: [w.z.buffer, w.h.buffer, w.u.buffer, w.v.buffer, w.sink.buffer] })
}
