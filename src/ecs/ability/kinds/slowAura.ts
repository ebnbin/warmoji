import type { SlowAuraDef } from '../../../data/abilityDefs'
import { Slow } from '../../components'
import { damageMul, damageTarget, ownerX, ownerY } from '../amp'
import { Pulse } from '../components'
import { sourceOf } from '../source'
import { castScan } from '../systems/cast'
import { KindSlowAura } from '../tags'
import { targetsOf } from '../targets'
import type { Sim } from '../../sim'

/** 冻伤跳伤间隔（半秒一跳，dps 折半） */
const TICK_MS = 500

/** 寒气光环：以持有者为圆心持续减速。光环没有冷却概念——Cooldown 恒为 0，
 * 于是每帧都过一遍施放扫描、每帧都重新登记减速区（少一帧圈就断一帧）。
 * dps 光环内持续掉血、freeze 周期脉冲冻结，两条节拍各自走 Pulse，不占冷却。
 * 持有者倒下光环随之消失（闸门管） */
export function castSlowAuras(sim: Sim, dt: number): void {
  castScan<SlowAuraDef>(sim, KindSlowAura, (e, def) => {
    const src = sourceOf(sim, e)
    const x = ownerX(e)
    const y = ownerY(e)
    // 本帧减速区（消费方 steerEnemies 读最近一次；ring 供场景侧画光环圈）
    sim.frameSlowZones.push({ x, y, r2: def.radius * def.radius, factor: def.slowFactor, r: def.radius, ring: def.color })
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
