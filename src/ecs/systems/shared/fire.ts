import { hasComponent } from 'bitecs'
import { playSfx } from '../../../audio/sfx'
import { DEG2RAD, UNIT } from '../../../util/units'
import { ACQUIRE } from '../../../data/abilities'
import {
  AIM,
  Aim,
  ALL_OF,
  Alive,
  AllShape,
  Anchor,
  Aura,
  BlinkShape,
  BlinkState,
  Boss,
  Chain,
  CharFlash,
  Disc,
  DISC_AT,
  DISC_OF,
  DropShape,
  EmplaceShape,
  Fired,
  FlyerShape,
  Hp,
  LeapShape,
  Leaping,
  Owner,
  Payload,
  Repeat,
  RepeatState,
  Rushing,
  Sector,
  Segment,
  Shots,
  SprintShape,
  SummonShape,
  Swing,
  Thrown,
  Tint,
  Transform,
  VisOff,
  ZoneShape,
  WorldShape,
  Bolt,
  Casting,
  Slowed,
  Windup,
  WindupState,
} from '../../components'
import { abilityArtEmoji, abilityFireSfx, abilityOnHit, abilityOnSelf, abilityPulse } from '../../store'
import { damageMul, ownerX, ownerY, waveScale } from '../../utils/amp'
import { sourceOf } from '../../utils/source'
import type { Source } from '../../utils/source'
import { eachAlly, nearestTarget, targetsNear } from '../../utils/targets'
import type { Found } from '../../utils/targets'
import { circleHitIndices, sectorHitIndices, thrustHitIndices } from '../../utils/hit'
import { strongestTarget } from '../../utils/assassinate'
import { headingOf, muzzle } from '../../utils/projectile'
import { leaderPoint } from '../../utils/team'
import { hit } from './damage'
import { applyAbilityEffects } from './effects'
import { grantIframe } from './combat'
import { shoot } from './projectile'
import { launch } from '../../entities/weapon'
import { place, spawnBee } from '../../entities/minion'
import { spawnDrop } from '../../entities/drop'
import { spawnZone } from '../../entities/zone'
import { spawnFxBeam, spawnFxBolt, spawnFxBoom, spawnFxCircle, spawnFxSlash } from '../../entities/fx'
import type { Sim } from '../../sim'

/** 正在做的事没做完就不出手：延迟重复未打完、飞返体未回收、瞬袭未闪回、蓄力未到点 */
export function busy(sim: Sim, e: number): boolean {
  return RepeatState.left[e]! > 0 || Thrown.n[e]! > 0 || BlinkState.until[e]! > sim.elapsedMs || WindupState.until[e]! > 0
}

export interface Shot {
  readonly angle: number
  readonly target: Found | null
}

export function aimAt(sim: Sim, e: number, src: Source): Shot | null {
  const ox = ownerX(e)
  const oy = ownerY(e)
  switch (Aim.kind[e]) {
    case AIM.nearest: {
      const t = nearestTarget(sim, src, ox, oy, Aim.range[e]!)
      return t ? { angle: Math.atan2(t.y - oy, t.x - ox), target: t } : null
    }
    case AIM.strongest: {
      const r = Aim.range[e]!
      const t = strongestTarget(ox, oy, targetsNear(sim, src, ox, oy, r), r)
      return t ? { angle: Math.atan2(t.y - oy, t.x - ox), target: t } : null
    }
    case AIM.move: {
      const h = headingOf(sim, e)
      return { angle: h.x === 0 && h.y === 0 ? Aim.rad[e]! : Math.atan2(h.y, h.x), target: null }
    }
    case AIM.leader: {
      const p = leaderPoint(sim)
      const d = sim.hooks.worldDelta(sim, ox, oy, p.x, p.y)
      return { angle: Math.atan2(d.y, d.x), target: null }
    }
    case AIM.stick:
      return { angle: Math.atan2(sim.aim.y, sim.aim.x), target: null }
    default:
      return { angle: Aim.rad[e]!, target: null }
  }
}

function baseDamage(sim: Sim, e: number): number {
  return Math.round(Payload.damage[e]! * damageMul(sim, e) * (Payload.waveScale[e] ? waveScale(sim) : 1))
}

export function blinkFlash(sim: Sim, x: number, y: number): void {
  spawnFxCircle(sim, x, y, 26, { fill: 0xb388ff, fillAlpha: 0.4, fromScale: 1, toScale: 1.8, durationMs: 240, depth: 14 })
}

function burst(sim: Sim, x: number, y: number, radius: number, color: number, boom: boolean): void {
  if (boom) spawnFxCircle(sim, x, y, radius * 0.55, { fill: 0xffffff, fillAlpha: 0.9, fromScale: 1, toScale: 1.7, durationMs: 170, depth: 8 })
  spawnFxCircle(sim, x, y, radius, {
    fill: color,
    fillAlpha: boom ? 0.4 : 0.18,
    stroke: color,
    lineWidth: boom ? 6 : 4,
    lineAlpha: 1,
    fromScale: 0.25,
    toScale: 1.08,
    durationMs: 400,
    depth: 7,
  })
  if (boom) spawnFxBoom(sim, x, y, radius * 1.5)
}

/** 一次出手：按形状覆盖目标，先效果后伤害；返回是否真的出了手 */
export function fireOnce(sim: Sim, e: number, src: Source, angle: number, target: Found | null, damage: number): boolean {
  const w = sim.world
  const ox = ownerX(e)
  const oy = ownerY(e)
  const kb = Payload.knockback[e]!
  const color = Payload.color[e]!
  const onHit = abilityOnHit[e]

  if (hasComponent(w, e, Bolt)) {
    const from = muzzle(sim, e)
    shoot(sim, e, from.x, from.y, angle, damage)
    return true
  }

  if (hasComponent(w, e, Segment)) {
    const reach = Segment.reach[e]!
    const radius = Segment.radius[e]!
    const list = targetsNear(sim, src, ox, oy, reach + radius)
    const origin = { x: ox, y: oy }
    for (const i of thrustHitIndices(origin, angle, reach, radius, list)) {
      hit(sim, src, list[i]!.eid, damage, { knockback: kb, from: origin })
    }
    applyAbilityEffects(sim, src, onHit, { x: ox + Math.cos(angle) * reach, y: oy + Math.sin(angle) * reach, baseDamage: damage })
    if (Segment.beam[e]) spawnFxBeam(sim, ox, oy, angle, reach, radius, color)
    Swing.startMs[e] = sim.fxMs
    Swing.durMs[e] = Segment.ms[e]!
    return true
  }

  if (hasComponent(w, e, Sector)) {
    const radius = Sector.radius[e]!
    const list = targetsNear(sim, src, ox, oy, radius)
    const origin = { x: ox, y: oy }
    const hits: number[] = []
    for (const i of sectorHitIndices(origin, angle, Sector.arcDeg[e]! * DEG2RAD, radius, list)) {
      hit(sim, src, list[i]!.eid, damage, { knockback: kb, from: origin })
      hits.push(list[i]!.eid)
    }
    applyAbilityEffects(sim, src, onHit, { x: ox, y: oy, baseDamage: damage, targets: hits })
    Swing.startMs[e] = sim.fxMs
    Swing.durMs[e] = Sector.ms[e]!
    return true
  }

  if (hasComponent(w, e, Disc)) {
    const atTarget = Disc.at[e] === DISC_AT.target
    if (atTarget && !target) return false
    const cx = atTarget ? target!.x : ox
    const cy = atTarget ? target!.y : oy
    const r = Disc.radius[e]!
    if (Disc.of[e] === DISC_OF.hurt) {
      const hurt: number[] = []
      eachAlly(sim, src.faction, cx, cy, r, true, (t, x, y) => {
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy > r * r) return
        if (!Alive.v[t] || Hp.v[t]! < Hp.max[t]!) hurt.push(t)
      })
      if (hurt.length === 0) return false
      applyAbilityEffects(sim, src, onHit, { x: cx, y: cy, baseDamage: damage, targets: hurt })
      if (color !== 0) burst(sim, cx, cy, r, color, false)
      return true
    }
    const list = targetsNear(sim, src, cx, cy, r)
    const found = circleHitIndices({ x: cx, y: cy }, r, list).map((i) => list[i]!)
    applyAbilityEffects(sim, src, onHit, { x: cx, y: cy, baseDamage: damage, targets: found.map((t) => t.eid) })
    if (damage > 0) for (const t of found) hit(sim, src, t.eid, damage, { knockback: kb, from: { x: cx, y: cy } })
    if (color !== 0) burst(sim, cx, cy, r, color, damage > 0)
    return true
  }

  if (hasComponent(w, e, Chain)) {
    let cur = target
    if (!cur) return false
    const visited = new Set<number>()
    const points: { x: number; y: number }[] = [{ x: ox, y: oy }]
    let dmg = damage
    let last: Found = cur
    for (let hop = 0; hop <= Chain.hops[e]! && cur; hop++) {
      visited.add(cur.eid)
      const from = points[points.length - 1]!
      points.push({ x: cur.x, y: cur.y })
      hit(sim, src, cur.eid, Math.max(1, Math.round(dmg)), { knockback: kb, from })
      last = cur
      dmg *= Chain.decay[e]!
      cur = nearestTarget(sim, src, cur.x, cur.y, Chain.hopRange[e]!, visited)
    }
    applyAbilityEffects(sim, src, onHit, { x: last.x, y: last.y, baseDamage: dmg, exclude: visited })
    spawnFxBolt(sim, points, color)
    return true
  }

  if (hasComponent(w, e, FlyerShape)) {
    launch(sim, e, angle, damage)
    return true
  }

  if (hasComponent(w, e, DropShape)) {
    const seen = new Set<number>()
    const nearest = targetsNear(sim, src, ox, oy, Infinity)
      .map((t) => ({ t, d2: (t.x - ox) ** 2 + (t.y - oy) ** 2 }))
      .sort((a, b) => a.d2 - b.d2)
      .filter(({ t }) => !seen.has(t.eid) && (seen.add(t.eid), true))
      .slice(0, DropShape.targets[e]!)
    if (nearest.length === 0) return false
    nearest.forEach(({ t }, i) =>
      spawnDrop(sim, e, {
        emoji: abilityArtEmoji[e]!,
        size: DropShape.size[e]!,
        target: t.eid,
        x: t.x,
        y: t.y,
        fromAbove: DropShape.fromAbove[e]!,
        dropMs: DropShape.dropMs[e]!,
        delayMs: i * DropShape.staggerMs[e]!,
      }),
    )
    return true
  }

  if (hasComponent(w, e, BlinkShape)) {
    if (!target) return false
    const dx = target.x - ox
    const dy = target.y - oy
    const d = Math.hypot(dx, dy) || 1
    const behind = target.radius + BlinkShape.behindDist[e]!
    const landX = target.x + (dx / d) * behind
    const landY = target.y + (dy / d) * behind
    Aim.rad[e] = Math.atan2(target.y - landY, target.x - landX)
    blinkFlash(sim, ox, oy)
    const m = Owner.eid[e]!
    VisOff.x[m] = landX - Transform.x[m]!
    VisOff.y[m] = landY - Transform.y[m]!
    const strikeMs = BlinkShape.strikeMs[e]!
    BlinkState.until[e] = sim.elapsedMs + strikeMs
    grantIframe(sim, m, strikeMs + 200)
    blinkFlash(sim, landX, landY)
    let dmg = damage
    const execHp = BlinkShape.execHp[e]!
    if (execHp > 0 && Hp.max[target.eid]! > 0 && Hp.v[target.eid]! / Hp.max[target.eid]! <= execHp) {
      dmg = Math.round(dmg * BlinkShape.execMul[e]!)
    }
    hit(sim, src, target.eid, dmg, { knockback: kb, from: { x: landX, y: landY } })
    applyAbilityEffects(sim, src, onHit, { x: target.x, y: target.y, baseDamage: dmg, targets: [target.eid], exclude: new Set([target.eid]) })
    spawnFxSlash(sim, target.x, target.y, Aim.rad[e]!, 34)
    return true
  }

  if (hasComponent(w, e, SprintShape)) {
    const m = Owner.eid[e]!
    const speed = (SprintShape.distance[e]! / (SprintShape.ms[e]! / 1000)) * Slowed.v[m]!
    Rushing.active[m] = 1
    Rushing.msLeft[m] = SprintShape.ms[e]!
    Rushing.vx[m] = Math.cos(angle) * speed
    Rushing.vy[m] = Math.sin(angle) * speed
    Rushing.skill[m] = e
    Rushing.stamp[m] = sim.elapsedMs
    if (color !== 0) spawnFxCircle(sim, ox, oy, SprintShape.radius[e]!, {
      fill: color,
      fillAlpha: 0.35,
      stroke: color,
      lineWidth: 3,
      lineAlpha: 0.9,
      fromScale: 0.4,
      toScale: 1.6,
      durationMs: 260,
      depth: 8,
    })
    return true
  }

  if (hasComponent(w, e, LeapShape)) {
    const m = Owner.eid[e]!
    const from = { x: Transform.x[m]!, y: Transform.y[m]! }
    const dist = LeapShape.distance[e]!
    // 落点先经场地约束，再折算回起点附近，环面上才不会跨图飞
    const to = sim.hooks.constrainBody(sim, m, from, { x: from.x + Math.cos(angle) * dist, y: from.y + Math.sin(angle) * dist })
    const d = sim.hooks.worldDelta(sim, from.x, from.y, to.x, to.y)
    Leaping.active[m] = 1
    Leaping.landed[m] = 0
    Leaping.msLeft[m] = LeapShape.ms[e]!
    Leaping.ms[m] = LeapShape.ms[e]!
    Leaping.fromX[m] = from.x
    Leaping.fromY[m] = from.y
    Leaping.toX[m] = from.x + d.x
    Leaping.toY[m] = from.y + d.y
    Leaping.skill[m] = e
    return true
  }

  if (hasComponent(w, e, AllShape)) {
    if (AllShape.of[e] === ALL_OF.foes) {
      const list = targetsNear(sim, src, ox, oy, Infinity)
      applyAbilityEffects(sim, src, onHit, { x: ox, y: oy, baseDamage: damage, targets: list.map((t) => t.eid) })
      if (damage > 0) {
        const bossRatio = Payload.bossRatio[e]!
        for (const t of list) hit(sim, src, t.eid, Math.max(1, Math.round(damage * (Boss.v[t.eid] ? bossRatio : 1))))
        sim.out.flash = { color: 0xffffff, alpha: 0.55, durationMs: 380 }
      }
    } else {
      const allies: number[] = []
      eachAlly(sim, src.faction, ox, oy, Infinity, AllShape.downed[e] === 1, (t) => {
        allies.push(t)
      })
      applyAbilityEffects(sim, src, onHit, { x: ox, y: oy, baseDamage: damage, targets: allies })
      for (const t of allies) {
        if (!Alive.v[t]) continue
        CharFlash.until[t] = sim.fxMs + 320
        Tint.color[t] = color !== 0 ? color : 0xffe082
        Tint.effect[t] = 0
      }
    }
    const fxR = Payload.fxRadius[e]!
    if (fxR > 0) {
      spawnFxCircle(sim, ox, oy, fxR, { fill: color, fillAlpha: 0.3, stroke: color, lineWidth: 4, lineAlpha: 0.9, fromScale: 0.4, toScale: 3, durationMs: 550, depth: 20 })
    }
    return true
  }

  if (hasComponent(w, e, ZoneShape)) {
    const follow = ZoneShape.follow[e] === 1
    if (follow && Aura.zone[e] !== 0) return false
    const spec = {
      x: ox,
      y: oy,
      radius: ZoneShape.radius[e]!,
      src,
      durationMs: ZoneShape.durationMs[e]!,
      enterMs: ZoneShape.enterMs[e]!,
      color: ZoneShape.color[e]!,
      fillAlpha: ZoneShape.fillAlpha[e]!,
      lineAlpha: ZoneShape.lineAlpha[e]!,
      lineWidth: ZoneShape.lineWidth[e]!,
      tickMs: ZoneShape.tickMs[e]!,
      damage,
      mend: ZoneShape.mend[e]!,
      effects: onHit,
      follow: follow ? { of: Anchor.eid[e]!, owner: e } : undefined,
    }
    const pulseMs = ZoneShape.pulseMs[e]!
    // 须先落局部变量：spawnZone 可能扩容替换 Aura.zone
    const zone = spawnZone(sim, spec)
    if (follow) Aura.zone[e] = zone
    if (pulseMs > 0) {
      spawnZone(sim, { ...spec, tickMs: pulseMs, damage: 0, mend: 0, effects: abilityPulse[e], pulse: spec.color, fillAlpha: 0, lineAlpha: 0, lineWidth: 0 })
    }
    return true
  }

  if (hasComponent(w, e, SummonShape)) {
    const count = SummonShape.count[e]!
    for (let i = 0; i < count; i++) spawnBee(sim, e, i)
    return true
  }

  if (hasComponent(w, e, EmplaceShape)) {
    const n = EmplaceShape.count[e]!
    const r = EmplaceShape.spread[e]!
    const life = EmplaceShape.lifeMs[e]!
    if (n <= 1 || r <= 0) {
      place(sim, e, undefined, life)
      return true
    }
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / n
      const at = sim.hooks.constrainBody(sim, Owner.eid[e]!, { x: ox, y: oy }, { x: ox + Math.cos(a) * r, y: oy + Math.sin(a) * r })
      place(sim, e, at, life)
    }
    return true
  }

  if (hasComponent(w, e, WorldShape)) {
    applyAbilityEffects(sim, src, onHit, { x: ox, y: oy, baseDamage: damage })
    return true
  }
  return false
}

/** 蓄力：记下方向，让宿主停下并显出预兆，到点由 tickWindups 出手 */
function startWindup(sim: Sim, e: number, shot: Shot): void {
  const until = sim.elapsedMs + Windup.ms[e]!
  WindupState.until[e] = until
  WindupState.angle[e] = shot.angle
  const o = Owner.eid[e]!
  Casting.until[o] = until
  Casting.telegraph[o] = Windup.telegraph[e]!
}

/** 出手：瞄准、第一发、即时重复或安排延迟重复、音效、施法者自身的效果；有蓄力的先蓄力，到点再带着方向回到这里 */
export function fireAbility(sim: Sim, e: number, preset?: Shot): boolean {
  const w = sim.world
  const src = sourceOf(sim, e)
  const shot = preset ?? aimAt(sim, e, src)
  if (!shot) return false
  Aim.rad[e] = shot.angle
  if (!preset && hasComponent(w, e, Windup)) {
    startWindup(sim, e, shot)
    return true
  }
  let count = 1
  let spread = 0
  let delay = 0
  if (hasComponent(w, e, Repeat)) {
    const n = Repeat.everyN[e]!
    let due = true
    if (n > 0) {
      Shots.n[e] = Shots.n[e]! + 1
      due = Shots.n[e]! % n === 0
    }
    if (due) {
      count = Repeat.count[e]!
      spread = Repeat.spreadDeg[e]!
      delay = Repeat.delayMs[e]!
    }
  }
  const damage = baseDamage(sim, e)
  if (count <= 1 || delay > 0) {
    if (!fireOnce(sim, e, src, shot.angle, shot.target, damage)) return false
    if (count > 1) {
      RepeatState.left[e] = count - 1
      RepeatState.nextAt[e] = sim.elapsedMs + delay
      RepeatState.angle[e] = shot.angle
      RepeatState.damage[e] = damage
    }
  } else {
    const ring = spread >= 360 - 1e-9
    let fired = false
    for (let i = 0; i < count; i++) {
      const angle = ring ? shot.angle + (i * Math.PI * 2) / count : shot.angle + spread * DEG2RAD * (i / (count - 1) - 0.5)
      if (fireOnce(sim, e, src, angle, shot.target, damage)) fired = true
    }
    if (!fired) return false
  }
  const sfx = abilityFireSfx[e]
  if (sfx) playSfx(sfx)
  const anchor = Anchor.eid[e]!
  if (hasComponent(w, anchor, Fired)) Fired.v[anchor] = 1
  // 自身效果放最后：消散会把宿主连同这条能力一起移除
  const self = abilityOnSelf[e]
  if (self) applyAbilityEffects(sim, src, self, { x: ownerX(e), y: ownerY(e), baseDamage: damage, targets: [Owner.eid[e]!] })
  return true
}

/** 延迟重复的下一发：重新瞄准或沿环转动，伤害按比例打折 */
export function fireRepeat(sim: Sim, e: number): boolean {
  const src = sourceOf(sim, e)
  const count = Repeat.count[e]!
  const i = count - RepeatState.left[e]!
  let angle = RepeatState.angle[e]!
  let target: Found | null = null
  const ox = ownerX(e)
  const oy = ownerY(e)
  switch (Repeat.reaim[e]) {
    case 1: {
      const t = nearestTarget(sim, src, ox, oy, Aim.range[e]!)
      if (!t) return false
      target = t
      angle = Math.atan2(t.y - oy, t.x - ox)
      break
    }
    case 2: {
      const near = targetsNear(sim, src, ox, oy, ACQUIRE.range * UNIT)
      if (near.length === 0) return false
      target = near[Math.floor(sim.rng.next() * near.length)]!
      angle = Math.atan2(target.y - oy, target.x - ox)
      break
    }
    default:
      if (Repeat.spreadDeg[e]! >= 360 - 1e-9) angle = RepeatState.angle[e]! + (i * Math.PI * 2) / count
  }
  Aim.rad[e] = angle
  if (!fireOnce(sim, e, src, angle, target, Math.max(1, Math.round(RepeatState.damage[e]! * Repeat.ratio[e]!)))) return false
  const sfx = abilityFireSfx[e]
  if (sfx) playSfx(sfx)
  return true
}
