import type { SlowAuraDef } from '../../../types/abilityDefs'
import { Anchor, Aura, Faction, Pulse, Slow } from '../../components'
import { damageMul, damageTarget, ownerX, ownerY } from '../amp'
import { spawnZone } from '../../entities/zone'
import { sourceOf } from '../source'
import { castScan } from '../systems/cast'
import { KindSlowAura } from '../tags'
import { targetsOf } from '../targets'
import type { Sim } from '../../sim'

/** 冻伤跳伤间隔（半秒一跳，dps 折半） */
const TICK_MS = 500

/** 寒气光环：以持有者为圆心持续减速。光环没有冷却概念——Cooldown 恒为 0，
 * 于是每帧都过一遍施放扫描。
 * 减速区本身是一个**跟着持有者走的区域实体**（entities/zone.ts），建一次就一直在：
 * 开关随本武器的出手闸门（持有者倒下当场熄，复活自然回来），武器没了它一并回收。
 * dps 光环内持续掉血、freeze 周期脉冲冻结，两条节拍各自走 Pulse，不占冷却 */
export function castSlowAuras(sim: Sim): void {
  const dt = sim.wdtMs
  castScan<SlowAuraDef>(sim, KindSlowAura, (e, def) => {
    const src = sourceOf(sim, e)
    const x = ownerX(e)
    const y = ownerY(e)
    if (Aura.zone[e] === 0) {
      Aura.zone[e] = spawnZone(sim, {
        x,
        y,
        radius: def.radius,
        faction: Faction.v[e]!,
        durationMs: 0,
        enterMs: 0,
        color: def.color,
        fillAlpha: 0.08,
        lineAlpha: 0.35,
        lineWidth: 2,
        chill: { factor: def.slowFactor },
        follow: { of: Anchor.eid[e]!, owner: e },
      })
    }
    const r2 = def.radius * def.radius
    if (def.dps) {
      if (Pulse.dps[e] === 0) Pulse.dps[e] = TICK_MS // 起拍：等满一个周期再跳第一次
      else if ((Pulse.dps[e] = Pulse.dps[e]! - dt) <= 0) {
        Pulse.dps[e] = Pulse.dps[e]! + TICK_MS
        const damage = Math.max(1, Math.round(((def.dps * TICK_MS) / 1000) * damageMul(sim, e)))
        for (const t of targetsOf(sim, src)) {
          const dx = t.x - x
          const dy = t.y - y
          if (dx * dx + dy * dy <= r2) damageTarget(sim, src, t.eid, damage)
        }
      }
    }
    if (def.freeze) {
      if (Pulse.freeze[e] === 0) Pulse.freeze[e] = def.freeze.intervalMs // 起拍同上
      else if ((Pulse.freeze[e] = Pulse.freeze[e]! - dt) <= 0) {
        Pulse.freeze[e] = Pulse.freeze[e]! + def.freeze.intervalMs
        for (const t of targetsOf(sim, src)) {
          const dx = t.x - x
          const dy = t.y - y
          if (dx * dx + dy * dy > r2) continue
          freeze(sim, t.eid, def.freeze.durationMs)
        }
        sim.pendingCues.push({
          kind: 'circle',
          x,
          y,
          radius: def.radius,
          o: {
            fill: 0xffffff,
            fillAlpha: 0.18,
            stroke: def.color,
            lineWidth: 4,
            lineAlpha: 0.9,
            fromScale: 0.2,
            toScale: 1,
            durationMs: 420,
            depth: 7,
          },
        })
      }
    }
  })
}

/** 凛冬脉冲：移速归零一段时长（走通用限时减速通道） */
function freeze(sim: Sim, eid: number, durationMs: number): void {
  Slow.until[eid] = sim.elapsedMs + durationMs
  Slow.mul[eid] = 0
}
