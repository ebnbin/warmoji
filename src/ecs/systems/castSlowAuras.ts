import { hasComponent } from 'bitecs'
import { Anchor, Aura, AuraDps, AuraFreeze, SlowAura } from '../components'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { spawnZone } from '../entities/zone'
import { sourceOf } from '../utils/source'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

const TICK_MS = 500

/** 光环就是一个跟着施法者走的场：减速与冻伤是它的载荷；冻结是同一位置上节拍更慢的第二个场 */
export function castSlowAuras(sim: Sim): void {
  castScan(sim, SlowAura, (e) => {
    if (Aura.zone[e] !== 0) return
    const src = sourceOf(sim, e)
    const x = ownerX(e)
    const y = ownerY(e)
    const radius = SlowAura.radius[e]!
    const dps = hasComponent(sim.world, e, AuraDps) ? AuraDps.perSec[e]! : 0
    const follow = { of: Anchor.eid[e]!, owner: e }
    // 须先落局部变量：spawnZone 可能扩容替换 Aura.zone
    const zone = spawnZone(sim, {
      x,
      y,
      radius,
      src,
      durationMs: 0,
      enterMs: 0,
      color: SlowAura.color[e]!,
      fillAlpha: 0.08,
      lineAlpha: 0.35,
      lineWidth: 2,
      tickMs: TICK_MS,
      damage: dps > 0 ? Math.max(1, Math.round(((dps * TICK_MS) / 1000) * damageMul(sim, e))) : 0,
      effects: [{ kind: 'slow', factor: SlowAura.slowFactor[e]!, durationMs: TICK_MS + 100 }],
      follow,
    })
    Aura.zone[e] = zone
    if (hasComponent(sim.world, e, AuraFreeze)) {
      spawnZone(sim, {
        x,
        y,
        radius,
        src,
        durationMs: 0,
        enterMs: 0,
        color: SlowAura.color[e]!,
        fillAlpha: 0,
        lineAlpha: 0,
        lineWidth: 0,
        tickMs: AuraFreeze.intervalMs[e]!,
        effects: [{ kind: 'slow', factor: 0, durationMs: AuraFreeze.durationMs[e]! }],
        pulse: SlowAura.color[e]!,
        follow,
      })
    }
  })
}
