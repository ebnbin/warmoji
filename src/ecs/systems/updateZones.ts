import { hasComponent, query, removeEntity } from 'bitecs'
import { Disarmed, Frozen, Hp, Lifetime, Owner, Ring, Tint, Transform, ZONE_SET, Zone, ZoneFollow, ZoneHit } from '../components'
import { hit } from './shared/damage'
import { applyAbilityEffects } from './shared/effects'
import { backEaseOut } from '../utils/ease'
import { eachAlly, targetsWithin } from '../utils/targets'
import { zoneEffects, zoneSrc } from '../store'
import { spawnFxCircle } from '../entities/fx'
import type { Sim } from '../sim'

const FADE_MS = 250

function fadeExpired(sim: Sim, z: number): boolean {
  if (Zone.fadeAt[z] === 0) Zone.fadeAt[z] = sim.fxMs
  const over = sim.fxMs - Zone.fadeAt[z]!
  if (over >= FADE_MS) {
    zoneEffects[z] = undefined
    zoneSrc[z] = undefined
    removeEntity(sim.world, z)
    return true
  }
  Zone.on[z] = 0
  Tint.alpha[z] = 1 - over / FADE_MS
  return false
}

export function finishZoneFades(sim: Sim): void {
  for (const z of [...query(sim.world, ZONE_SET)]) {
    if (Zone.fadeAt[z] !== 0) fadeExpired(sim, z)
  }
}

/** 场内的身体：圆心落在场内 */
function inside(x: number, y: number, r: number, tx: number, ty: number): boolean {
  const dx = tx - x
  const dy = ty - y
  return dx * dx + dy * dy <= r * r
}

/** 场每帧给场内己方回复，每到节拍对场内敌方扣血再施加效果；一个身体一个节拍内只吃一个场的血；敌我同一条 */
export function updateZones(sim: Sim): void {
  const world = sim.world
  const zones = [...query(world, ZONE_SET)]
  if (zones.length === 0) return
  const now = sim.elapsedMs
  const dt = sim.wdtMs / 1000
  for (const z of zones) {
    if (hasComponent(world, z, ZoneFollow)) {
      const a = ZoneFollow.of[z]!
      Transform.x[z] = Transform.x[a]!
      Transform.y[z] = Transform.y[a]!
      const w = Owner.eid[z]!
      Zone.on[z] = Frozen.v[w] === 0 && Disarmed.v[w] === 0 ? 1 : 0
    }
    const until = Lifetime.until[z]!
    if (until > 0 && now >= until) {
      if (fadeExpired(sim, z)) continue
    } else {
      Tint.alpha[z] = Zone.on[z] ? 1 : 0
    }
    const enter = Zone.enterMs[z]!
    const age = sim.fxMs - Ring.born[z]!
    Ring.radius[z] = Zone.radius[z]! * (enter > 0 && age < enter ? 0.3 + 0.7 * backEaseOut(age / enter) : 1)
    if (Zone.on[z] === 0) continue
    const x = Transform.x[z]!
    const y = Transform.y[z]!
    const r = Zone.radius[z]!
    const src = zoneSrc[z]!
    const mend = Zone.mend[z]!
    if (mend > 0) {
      eachAlly(sim, src.faction, x, y, r, false, (eid, tx, ty) => {
        if (inside(x, y, r, tx, ty)) Hp.v[eid] = Math.min(Hp.max[eid]!, Hp.v[eid]! + mend * dt)
      }, src.realm)
    }
    const tickMs = Zone.tickMs[z]!
    if (tickMs <= 0 || now < Zone.nextAt[z]!) continue
    Zone.nextAt[z] = Zone.nextAt[z]! + tickMs
    const damage = Zone.damage[z]!
    const effects = zoneEffects[z]
    const found = targetsWithin(sim, src, x, y, r).filter((t) => inside(x, y, r, t.x, t.y))
    if (damage > 0) {
      for (const t of found) {
        const last = ZoneHit.last[t.eid]!
        if (last !== 0 && now - last < tickMs) continue
        ZoneHit.last[t.eid] = now
        hit(sim, src, t.eid, damage, { tick: true })
      }
    }
    if (effects && effects.length > 0 && found.length > 0) {
      applyAbilityEffects(sim, src, effects, { x, y, baseDamage: damage, targets: found.map((t) => t.eid) })
    }
    const pulse = Zone.pulse[z]!
    if (pulse !== 0) {
      spawnFxCircle(sim, x, y, r, {
        fill: 0xffffff,
        fillAlpha: 0.18,
        stroke: pulse,
        lineWidth: 4,
        lineAlpha: 0.9,
        fromScale: 0.2,
        toScale: 1,
        durationMs: 420,
        depth: 7,
      })
    }
  }
}
