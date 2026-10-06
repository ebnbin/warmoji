import { MAPS } from '../../data/maps'
import { Transform } from '../../ecs/components'
import { deckAt, deckCoord, mesaOf } from './model'
import type { BridgeSnapshot } from '../../run/hudHost'
import type { Sim } from '../../ecs/sim'

/** 载重表看的那座桥：队长站在哪座桥上就是哪座，否则是桥面离队长最近的那座 */
export function bridgeSnapshot(sim: Sim): BridgeSnapshot | null {
  const s = sim.worldState.canyon
  const cfg = MAPS[sim.mapId].canyon
  if (!s || !cfg || s.bridges.length === 0) return null
  const x = Transform.x[sim.leader]!
  const y = Transform.y[sim.leader]!
  const on = mesaOf(s, x, y) < 0 ? deckAt(s, x, y) : -1
  let pick = on
  if (pick < 0) {
    let best = Infinity
    s.bridges.forEach((b, j) => {
      const c = deckCoord(b, x, y)
      const t = Math.min(1, Math.max(0, c.t))
      const d = Math.hypot(b.ax + b.ux * b.len * t - x, b.ay + b.uy * b.len * t - y)
      if (d < best) {
        best = d
        pick = j
      }
    })
  }
  const b = s.bridges[pick]!
  const kind = cfg.bridge.kinds[b.span.kind]!
  const span = b.phase === 'down' ? cfg.bridge.downMs : b.phase === 'rebuild' ? cfg.bridge.rebuildMs : 1
  const left = b.phase === 'up' ? 0 : Math.max(0, span - (sim.elapsedMs - b.since))
  // 断了还没开始拉绳时，倒计时数到搭好为止
  const toUp = b.phase === 'down' ? left + cfg.bridge.rebuildMs : left
  return {
    name: kind.name,
    grade: b.span.kind,
    grades: cfg.bridge.kinds.length,
    kg: b.kg,
    cap: b.cap,
    phase: b.phase,
    ratio: b.phase === 'up' ? 1 : left / span,
    inSec: toUp / 1000,
    on: on >= 0,
  }
}
