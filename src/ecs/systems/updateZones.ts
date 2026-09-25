import { hasComponent, query, removeEntity } from 'bitecs'
import {
  Alive,
  Disarmed,
  ENEMY_SET,
  FACTION,
  Frozen,
  GroundHit,
  Lifetime,
  Owner,
  Ring,
  Tint,
  Transform,
  ZONE_SET,
  Zone,
  ZoneBurn,
  ZoneFollow,
} from '../components'
import { applyDamage, hurtCharacter } from './shared/combat'
import { backEaseOut } from '../utils/ease'
import { zoneSrcName } from '../store'
import type { Sim } from '../sim'


const FADE_MS = 250

function fadeExpired(sim: Sim, z: number): boolean {
  if (Zone.fadeAt[z] === 0) Zone.fadeAt[z] = sim.fxMs
  const over = sim.fxMs - Zone.fadeAt[z]!
  if (over >= FADE_MS) {
    removeEntity(sim.world, z)
    return true
  }
  Zone.on[z] = 0
  Tint.alpha[z] = 1 - over / FADE_MS
  return false
}

export function finishZoneFades(sim: Sim): void {
  for (const z of [...query(sim.world, ZONE_SET as unknown as object[])]) {
    if (Zone.fadeAt[z] !== 0) fadeExpired(sim, z)
  }
}

export function updateZones(sim: Sim): void {
  const world = sim.world
  const zones = [...query(world, ZONE_SET as unknown as object[])]
  if (zones.length === 0) return
  const now = sim.elapsedMs
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
  }
  const burns = [...query(world, [Zone, ZoneBurn, Transform])]
  if (burns.length === 0) return
  burnEnemies(sim, burns, now)
  burnMembers(sim, burns, now)
}

function burnEnemies(sim: Sim, burns: readonly number[], now: number): void {
  let enemies: readonly number[] | undefined
  for (const z of burns) {
    if (Zone.on[z] === 0 || Zone.faction[z] === FACTION.enemy || now < ZoneBurn.nextAt[z]!) continue
    ZoneBurn.nextAt[z] = now + ZoneBurn.tickMs[z]!
    enemies ??= [...query(sim.world, ENEMY_SET as unknown as object[])]
    const r = Zone.radius[z]!
    const damage = ZoneBurn.damage[z]!
    const slot = ZoneBurn.srcSlot[z]!
    for (const eid of enemies) {
      const d = sim.hooks.worldDelta(sim, Transform.x[z]!, Transform.y[z]!, Transform.x[eid]!, Transform.y[eid]!)
      if (d.x * d.x + d.y * d.y <= r * r) applyDamage(sim, eid, damage, 0, undefined, undefined, slot)
    }
  }
}

function burnMembers(sim: Sim, burns: readonly number[], now: number): void {
  for (const m of sim.characters) {
    if (!Alive.v[m]) continue
    for (const z of burns) {
      if (Zone.on[z] === 0 || Zone.faction[z] !== FACTION.enemy) continue
      const r = Zone.radius[z]!
      const d = sim.hooks.worldDelta(sim, Transform.x[z]!, Transform.y[z]!, Transform.x[m]!, Transform.y[m]!)
      if (d.x * d.x + d.y * d.y > r * r) continue
      if (now - GroundHit.last[m]! >= ZoneBurn.tickMs[z]!) {
        GroundHit.last[m] = now
        hurtCharacter(sim, m, ZoneBurn.damage[z]!, zoneSrcName[z] || undefined, 0xa5d86a)
      }
      break
    }
  }
}
