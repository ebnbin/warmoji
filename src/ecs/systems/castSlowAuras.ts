import { hasComponent } from 'bitecs'
import { Anchor, Aura, AuraDps, AuraFreeze, Faction, Pulse, Slow, SlowAura } from '../components'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { damageTarget } from './shared/damage'
import { spawnZone } from '../entities/zone'
import { sourceOf } from '../utils/source'
import { castScan } from './shared/castScan'
import { targetsNear } from '../utils/targets'
import type { Sim } from '../sim'
import { spawnFxCircle } from '../entities/fx'

const TICK_MS = 500

export function castSlowAuras(sim: Sim): void {
  const dt = sim.wdtMs
  castScan(sim, SlowAura, (e) => {
    const src = sourceOf(sim, e)
    const x = ownerX(e)
    const y = ownerY(e)
    const radius = SlowAura.radius[e]!
    if (Aura.zone[e] === 0) {
      // 须先落局部变量：spawnZone 可能扩容替换 Aura.zone
      const zone = spawnZone(sim, {
        x,
        y,
        radius,
        faction: Faction.v[e]!,
        durationMs: 0,
        enterMs: 0,
        color: SlowAura.color[e]!,
        fillAlpha: 0.08,
        lineAlpha: 0.35,
        lineWidth: 2,
        chill: { factor: SlowAura.slowFactor[e]! },
        follow: { of: Anchor.eid[e]!, owner: e },
      })
      Aura.zone[e] = zone
      Pulse.dps[e] = TICK_MS
      Pulse.freeze[e] = hasComponent(sim.world, e, AuraFreeze) ? AuraFreeze.intervalMs[e]! : 0
    }
    const r2 = radius * radius
    if (hasComponent(sim.world, e, AuraDps)) {
      if ((Pulse.dps[e] = Pulse.dps[e]! - dt) <= 0) {
        Pulse.dps[e] = Pulse.dps[e]! + TICK_MS
        const damage = Math.max(1, Math.round(((AuraDps.perSec[e]! * TICK_MS) / 1000) * damageMul(sim, e)))
        for (const t of targetsNear(sim, src, x, y, radius)) {
          const dx = t.x - x
          const dy = t.y - y
          if (dx * dx + dy * dy <= r2) damageTarget(sim, src, t.eid, damage)
        }
      }
    }
    if (hasComponent(sim.world, e, AuraFreeze)) {
      if ((Pulse.freeze[e] = Pulse.freeze[e]! - dt) <= 0) {
        Pulse.freeze[e] = Pulse.freeze[e]! + AuraFreeze.intervalMs[e]!
        for (const t of targetsNear(sim, src, x, y, radius)) {
          const dx = t.x - x
          const dy = t.y - y
          if (dx * dx + dy * dy > r2) continue
          freeze(sim, t.eid, AuraFreeze.durationMs[e]!)
        }
        spawnFxCircle(sim, x, y, radius, {
          fill: 0xffffff,
          fillAlpha: 0.18,
          stroke: SlowAura.color[e]!,
          lineWidth: 4,
          lineAlpha: 0.9,
          fromScale: 0.2,
          toScale: 1,
          durationMs: 420,
          depth: 7,
        })
      }
    }
  })
}

function freeze(sim: Sim, eid: number, durationMs: number): void {
  Slow.until[eid] = sim.elapsedMs + durationMs
  Slow.mul[eid] = 0
}
