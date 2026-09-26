import { addComponent, hasComponent, query, removeEntity } from 'bitecs'
import { Alive, Disarmed, Frozen, Hp, Lifetime, MARK, Owner, Portal, PortCd, Radius, Ring, TAG, Tint, Transform, Uid, ZONE_SET, ZONE_WHO, Zone, ZoneFollow, ZoneHit } from '../components'
import { hit } from './shared/damage'
import { applyAbilityEffects } from './shared/effects'
import { displace } from './shared/displace'
import { backEaseOut } from '../utils/ease'
import { addMark } from '../utils/marks'
import { isSameEntity } from '../utils/identity'
import { eachAlly, targetsWithin } from '../utils/targets'
import { zoneDwellIn, zoneEffects, zoneRules, zoneSrc } from '../store'
import { spawnFxCircle } from '../entities/fx'
import type { Source } from '../utils/source'
import type { Sim } from '../sim'

const FADE_MS = 250
const MIST_HOLD_MS = 200

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

function foesIn(sim: Sim, src: Source, x: number, y: number, r: number): number[] {
  return targetsWithin(sim, src, x, y, r)
    .filter((t) => inside(x, y, r, t.x, t.y))
    .map((t) => t.eid)
}

function alliesIn(sim: Sim, src: Source, x: number, y: number, r: number): number[] {
  const out: number[] = []
  eachAlly(sim, src.faction, x, y, r, false, (eid, tx, ty) => {
    if (inside(x, y, r, tx, ty)) out.push(eid)
  }, src.realm)
  return out
}

/** 场的对象：敌方、己方或都算 */
function whoIn(sim: Sim, z: number, src: Source, x: number, y: number, r: number): number[] {
  const who = Zone.who[z]!
  if (who === ZONE_WHO.foes) return foesIn(sim, src, x, y, r)
  if (who === ZONE_WHO.allies) return alliesIn(sim, src, x, y, r)
  return [...foesIn(sim, src, x, y, r), ...alliesIn(sim, src, x, y, r)]
}

/** 连续待满时长的施加一次；离开的重新计 */
function dwell(sim: Sim, z: number, list: readonly number[], x: number, y: number, src: Source): void {
  const rule = zoneRules[z]?.dwell
  const seen = zoneDwellIn[z]
  if (!rule || !seen) return
  const now = sim.elapsedMs
  const here = new Set<number>()
  for (const t of list) {
    const uid = Uid.v[t]!
    here.add(uid)
    const since = seen.get(uid)
    if (since === undefined) {
      seen.set(uid, now)
      continue
    }
    if (since < 0 || now - since < rule.ms) continue
    seen.set(uid, -1)
    applyAbilityEffects(sim, src, rule.effects, { x, y, baseDamage: 0, targets: [t] })
  }
  for (const uid of [...seen.keys()]) if (!here.has(uid)) seen.delete(uid)
}

/** 结算伤害前记下的身体里编号未变的：打死而被复用的编号不再吃后面的效果 */
function unchanged(sim: Sim, found: readonly number[], uids: readonly number[]): number[] {
  return found.filter((t, i) => isSameEntity(sim.world, t, uids[i]!))
}

/** 传送门：踏进来的身体（谁都算）从另一扇门出来 */
function port(sim: Sim, z: number, x: number, y: number, r: number): void {
  const other = Portal.other[z]!
  if (!isSameEntity(sim.world, other, Portal.otherUid[z]!) || Zone.on[other] === 0) return
  const now = sim.elapsedMs
  for (const list of sim.targets) {
    for (const t of list) {
      if (!t.alive || Uid.v[t.eid] !== t.uid || !inside(x, y, r, t.x, t.y)) continue
      if (hasComponent(sim.world, t.eid, PortCd) && now < PortCd.until[t.eid]!) continue
      const ox = Transform.x[other]!
      const oy = Transform.y[other]!
      if (!displace(sim, t.eid, { kind: 'place', x: ox, y: oy }, { self: false, free: true })) continue
      if (!hasComponent(sim.world, t.eid, PortCd)) addComponent(sim.world, t.eid, PortCd)
      PortCd.until[t.eid] = now + Portal.cdMs[z]!
      spawnFxCircle(sim, t.x, t.y, Radius.v[t.eid]! * 1.6, { fill: Ring.color[z]!, fillAlpha: 0.5, fromScale: 1, toScale: 0.2, durationMs: 240, depth: 14 })
      spawnFxCircle(sim, ox, oy, Radius.v[t.eid]! * 1.6, { fill: Ring.color[z]!, fillAlpha: 0.5, fromScale: 0.2, toScale: 1.4, durationMs: 280, depth: 14 })
    }
  }
}

/** 场每帧：跟随、到期结算、回复、牵引、迷雾、停留、陷阱、传送门；每到节拍对场内对象扣血（只打敌方）再施加效果；一个身体一个节拍内只吃一个场的血；敌我同一条 */
export function updateZones(sim: Sim): void {
  const world = sim.world
  const zones = [...query(world, ZONE_SET)]
  if (zones.length === 0) return
  const now = sim.elapsedMs
  const dt = sim.wdtMs / 1000
  for (const z of zones) {
    if (!hasComponent(world, z, Zone)) continue
    if (hasComponent(world, z, ZoneFollow)) {
      const a = ZoneFollow.of[z]!
      Transform.x[z] = Transform.x[a]!
      Transform.y[z] = Transform.y[a]!
      const w = Owner.eid[z]!
      Zone.on[z] = Frozen.v[w] === 0 && Disarmed.v[w] === 0 ? 1 : 0
    }
    const x = Transform.x[z]!
    const y = Transform.y[z]!
    const r = Zone.radius[z]!
    const src = zoneSrc[z]!
    const until = Lifetime.until[z]!
    if (until > 0 && now >= until) {
      const end = Zone.fadeAt[z] === 0 ? zoneRules[z]?.onExpire : undefined
      if (end) {
        const list = whoIn(sim, z, src, x, y, r)
        if (list.length > 0) applyAbilityEffects(sim, src, end, { x, y, baseDamage: Zone.damage[z]!, targets: list })
      }
      if (fadeExpired(sim, z)) continue
    } else {
      Tint.alpha[z] = Zone.on[z] ? 1 : 0
    }
    const enter = Zone.enterMs[z]!
    const age = sim.fxMs - Ring.born[z]!
    Ring.radius[z] = Zone.radius[z]! * (enter > 0 && age < enter ? 0.3 + 0.7 * backEaseOut(age / enter) : 1)
    if (Zone.on[z] === 0) continue
    if (hasComponent(world, z, Portal)) {
      port(sim, z, x, y, r)
      continue
    }
    const mend = Zone.mend[z]!
    if (mend > 0) {
      eachAlly(sim, src.faction, x, y, r, false, (eid, tx, ty) => {
        if (inside(x, y, r, tx, ty)) Hp.v[eid] = Math.min(Hp.max[eid]!, Hp.v[eid]! + mend * dt)
      }, src.realm)
    }
    const pull = Zone.pull[z]!
    if (pull > 0) {
      for (const t of foesIn(sim, src, x, y, r)) {
        const d = sim.hooks.worldDelta(sim, Transform.x[t]!, Transform.y[t]!, x, y)
        const len = Math.hypot(d.x, d.y)
        if (len > Radius.v[t]! * 0.5) displace(sim, t, { kind: 'drift', vx: (d.x / len) * pull, vy: (d.y / len) * pull, dt }, { self: false })
      }
    }
    if (Zone.mist[z]) {
      for (const t of alliesIn(sim, src, x, y, r)) addMark(t, MARK.mist, TAG.effect, now + MIST_HOLD_MS, z, 0, 0, Uid.v[z]!)
    }
    if (zoneDwellIn[z]) dwell(sim, z, whoIn(sim, z, src, x, y, r), x, y, src)
    if (Zone.trap[z]) {
      const found = foesIn(sim, src, x, y, r)
      if (found.length === 0) continue
      const uids = found.map((t) => Uid.v[t]!)
      const damage = Zone.damage[z]!
      if (damage > 0) for (const t of found) hit(sim, src, t, damage)
      applyAbilityEffects(sim, src, zoneEffects[z], { x, y, baseDamage: damage, targets: unchanged(sim, found, uids) })
      spawnFxCircle(sim, x, y, r * 1.4, { fill: Ring.color[z]!, fillAlpha: 0.4, stroke: 0xffffff, lineWidth: 3, lineAlpha: 0.9, fromScale: 0.3, toScale: 1, durationMs: 320, depth: 8 })
      Lifetime.until[z] = now
      continue
    }
    const tickMs = Zone.tickMs[z]!
    if (tickMs <= 0 || now < Zone.nextAt[z]!) continue
    Zone.nextAt[z] = Zone.nextAt[z]! + tickMs
    const damage = Zone.damage[z]!
    const effects = zoneEffects[z]
    const found = whoIn(sim, z, src, x, y, r)
    const uids = found.map((t) => Uid.v[t]!)
    if (damage > 0) {
      for (const t of Zone.who[z] === ZONE_WHO.allies ? [] : foesIn(sim, src, x, y, r)) {
        const last = ZoneHit.last[t]!
        if (last !== 0 && now - last < tickMs) continue
        ZoneHit.last[t] = now
        hit(sim, src, t, damage, { tick: true })
      }
    }
    if (effects && effects.length > 0 && found.length > 0) {
      applyAbilityEffects(sim, src, effects, { x, y, baseDamage: damage, targets: unchanged(sim, found, uids).filter((t) => Alive.v[t]) })
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
