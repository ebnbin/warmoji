import { hasComponent } from 'bitecs'
import { DEG2RAD } from '../../../util/units'
import { TRANSIT_MS } from '../../../data/abilities'
import {
  AIM,
  Aim,
  ALL_OF,
  Alive,
  AllShape,
  Anchor,
  Aura,
  BLINK,
  BlinkShape,
  BlinkState,
  Chain,
  Disc,
  DISC_AT,
  DISC_OF,
  DropShape,
  EmplaceShape,
  Fired,
  Hp,
  LeapShape,
  MARK,
  Mark,
  Motion,
  AbilityClass,
  Ammo,
  Hold,
  Owner,
  Payload,
  REAIM,
  Repeat,
  RepeatState,
  Sector,
  Segment,
  Shots,
  SprintShape,
  SummonShape,
  Swing,
  Thrown,
  Transform,
  Uid,
  ZoneShape,
  Bolt,
  Casting,
  Windup,
  WindupState,
  Idle,
  Mirror,
} from '../../components'
import { abilityArtEmoji, abilityDef, abilityFireSfx, abilityOnCast, abilityOnHit, abilityOnSelf, abilityPulse, abilityRequires, ammoLast, blinkStrike, zoneRules } from '../../store'
import { abilityPiercesWalls } from '../../../data/abilities'
import { controlBody } from '../updateControl'
import { clearMarks, markSlot } from '../../utils/marks'
import { anchorX, anchorY } from '../../utils/ability'
import { flying, sourceOf, sweep } from '../../utils/source'
import { HIT } from '../../utils/hitTags'
import type { Source } from '../../utils/source'
import { eachAlly, eachTarget, nearestTarget, targetsNear, targetsWithin } from '../../utils/targets'
import { aimLayer, BLAST_M, breachAt, covered, flightProbe, hiOf, impactAt, layerZ, loOf, muzzleOf, reachBlock, reaches, shotPass } from '../../utils/pass'
import type { Found } from '../../utils/targets'
import { circleHitIndices, sectorHitIndices, thrustHitIndices } from '../../utils/hit'
import { strongestTarget } from '../../utils/assassinate'
import { headingOf, muzzle } from '../../utils/projectile'
import { leaderPoint } from '../../utils/team'
import { hit, strike, touch } from './damage'
import { applyAbilityEffects, applyOnHit, EMPOWER_DEF, struckOf, test } from './effects'
import { takeBoost } from './resource'
import type { Struck } from './effects'
import { displace } from './displace'
import { shoot } from './projectile'
import { launch } from '../../entities/weapon'
import { shadowsOf } from '../../entities/shadow'
import { place, spawnBee } from '../../entities/minion'
import { spawnDrop } from '../../entities/drop'
import { spawnZone } from '../../entities/zone'
import { spawnFxBeam, spawnFxBolt, spawnFxBoom, spawnFxCircle } from '../../entities/fx'
import type { Sim } from '../../sim'
import type { Point } from '../../../util/vec'
import type { Effect } from '../../../types/abilityDefs'

const STEALTH = [MARK.stealth]

/** 正在做的事没做完就不出手：延迟重复未打完、飞返体未回收、瞬袭未斩完、蓄力未到点 */
export function busy(e: number): boolean {
  return RepeatState.left[e]! > 0 || Thrown.n[e]! > 0 || BlinkState.phase[e] !== BLINK.none || WindupState.until[e]! > 0
}

export interface Shot {
  readonly angle: number
  readonly target: Found | null
}

export function aimAt(sim: Sim, e: number, src: Source): Shot | null {
  const ox = anchorX(e)
  const oy = anchorY(e)
  const cond = abilityRequires[e]
  const accept = cond ? (t: number): boolean => test(sim, src, t, cond) : undefined
  switch (Aim.kind[e]) {
    case AIM.nearest: {
      const t = nearestHittable(sim, e, src, ox, oy, Aim.range[e]!, accept)
      return t ? { angle: Math.atan2(t.y - oy, t.x - ox), target: t } : null
    }
    case AIM.strongest: {
      const r = Aim.range[e]!
      const t = strongestTarget(ox, oy, targetsNear(sim, src, ox, oy, r).filter((f) => !accept || accept(f.eid)), r)
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

/** 出手者从哪一层出手 */
function muzzleLayer(sim: Sim, e: number): number {
  const o = Owner.eid[e]!
  return muzzleOf(loOf(sim.world, o), hiOf(sim.world, o))
}

/** 这一发离脚下的地面多高：抛射从出手的那一层出手，平射朝着目标那一层飞，没有目标就在出手的那一层 */
function shotZ(sim: Sim, e: number, target: Found | null): number {
  if (Bolt.arc[e]! > 0 || !target) return layerZ(muzzleLayer(sim, e))
  const w = sim.world
  const o = Owner.eid[e]!
  return layerZ(aimLayer(loOf(w, o), hiOf(w, o), loOf(w, target.eid), hiOf(w, target.eid)))
}

/** 这一下打不打得到 f：弹体看飞不飞得过去（抛射的抛到它脚下），近战与连锁看够不够得着，其余的看得见就行 */
function hittable(sim: Sim, e: number, src: Source, ox: number, oy: number, f: Found): boolean {
  const w = sim.world
  if (hasComponent(w, e, Bolt)) {
    const def = abilityDef[e]
    if (def !== undefined && abilityPiercesWalls(def)) return true
    const h = shotZ(sim, e, f)
    const arc = Bolt.arc[e]!
    return shotPass(sim, src.faction, flightProbe(h, arc > 0 ? 0 : h, arc, Bolt.pierce[e]!), ox, oy, f.x, f.y).block === null
  }
  if (hasComponent(w, e, Segment) || hasComponent(w, e, Sector) || hasComponent(w, e, Chain)) return reaches(sim, ox, oy, f.x, f.y)
  return true
}

/** 瞄最近的：看得见的里面由近到远挑这一下真打得到的，都打不到就瞄最近看得见的；不受障碍阻挡的直接瞄最近的 */
function nearestHittable(sim: Sim, e: number, src: Source, ox: number, oy: number, range: number, accept?: (eid: number) => boolean): Found | null {
  if (!src.blocked) return nearestTarget(sim, src, ox, oy, range, undefined, accept)
  const seen: { f: Found; d: number }[] = []
  eachTarget(sim, src, ox, oy, range, (eid, x, y, radius) => {
    if (accept && !accept(eid)) return
    const d = (x - ox) ** 2 + (y - oy) ** 2
    if (d < range * range) seen.push({ f: { eid, x, y, radius }, d })
  })
  if (seen.length === 0) return null
  seen.sort((a, b) => a.d - b.d)
  for (const s of seen) if (hittable(sim, e, src, ox, oy, s.f)) return s.f
  return seen[0]!.f
}

/** 这条能力的破坏力 */
function breachOf(e: number): number {
  return abilityDef[e]?.breach ?? 0
}

export const BLINK_COLOR = 0xb388ff

export function blinkFlash(sim: Sim, x: number, y: number): void {
  spawnFxCircle(sim, x, y, 26, { fill: BLINK_COLOR, fillAlpha: 0.4, fromScale: 1, toScale: 1.8, durationMs: 240, depth: 14 })
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

/** 打一遍：返回真正落到身上的身体；不带伤害的形状只碰不打 */
function strikeAll(sim: Sim, src: Source, found: readonly Found[], damage: number, kb: number, from: Point, tags = 0): Struck[] {
  const struck: Struck[] = []
  for (const t of found) {
    const s = struckOf(t.eid)
    if (strike(sim, src, t.eid, damage, { knockback: kb, from, tags })) struck.push(s)
  }
  return struck
}

/** 这一下出手的附加：命中效果（基础的加上强化的）与距离倍率（按住蓄力） */
interface Mods {
  readonly onHit: readonly Effect[] | undefined
  readonly reach: number
}

/** 一次出手：按形状覆盖目标，先伤害后效果，效果只施于真正打中的身体；返回是否真的出了手 */
function fireOnce(sim: Sim, e: number, src: Source, angle: number, target: Found | null, damage: number, mods: Mods): boolean {
  const ox = anchorX(e)
  const oy = anchorY(e)
  const kb = Payload.knockback[e]!
  const color = Payload.color[e]!
  const onHit = mods.onHit

  switch (abilityDef[e]!.shape.kind) {
    case 'bolt': {
      const from = muzzle(sim, e)
      shoot(sim, e, from.x, from.y, angle, shotZ(sim, e, target), damage, onHit, target ?? undefined)
      return true
    }

    case 'segment': {
      let reach = Segment.reach[e]! * mods.reach
      const radius = Segment.radius[e]!
      // 被障碍挡的一刺、一束只伸到撞上的地方
      const wall = src.blocked ? reachBlock(sim, ox, oy, ox + Math.cos(angle) * reach, oy + Math.sin(angle) * reach) : null
      if (wall) reach *= wall.t
      const list = covered(sim, src, ox, oy, targetsWithin(sim, sweep(sim, e, src), ox, oy, reach + radius))
      const origin = { x: ox, y: oy }
      const struck = strikeAll(sim, src, thrustHitIndices(origin, angle, reach, radius, list).map((i) => list[i]!), damage, kb, origin)
      applyOnHit(sim, src, onHit, ox + Math.cos(angle) * reach, oy + Math.sin(angle) * reach, damage, struck, angle)
      if (wall) {
        impactAt(sim, wall)
        breachAt(sim, wall.x, wall.y, layerZ(muzzleLayer(sim, e)), radius, breachOf(e))
      }
      if (Segment.beam[e]) spawnFxBeam(sim, ox, oy, angle, reach, radius, color)
      Swing.startMs[e] = sim.fxMs
      Swing.durMs[e] = Segment.ms[e]!
      return true
    }

    case 'sector': {
      const radius = Sector.radius[e]!
      const list = covered(sim, src, ox, oy, targetsWithin(sim, sweep(sim, e, src), ox, oy, radius))
      const origin = { x: ox, y: oy }
      const struck = strikeAll(sim, src, sectorHitIndices(origin, angle, Sector.arcDeg[e]! * DEG2RAD, radius, list).map((i) => list[i]!), damage, kb, origin)
      applyOnHit(sim, src, onHit, ox, oy, damage, struck, angle)
      breachAt(sim, ox + Math.cos(angle) * radius * 0.5, oy + Math.sin(angle) * radius * 0.5, layerZ(muzzleLayer(sim, e)), radius * 0.5, breachOf(e))
      Swing.startMs[e] = sim.fxMs
      Swing.durMs[e] = Sector.ms[e]!
      return true
    }

    case 'disc': {
      const atTarget = Disc.at[e] === DISC_AT.target
      if (atTarget && !target) return false
      const cx = atTarget ? target!.x : ox
      const cy = atTarget ? target!.y : oy
      const r = Disc.radius[e]! * mods.reach
      if (Disc.of[e] === DISC_OF.hurt) {
        const revives = onHit?.some((fx) => fx.kind === 'revive' || fx.kind === 'reviveCut') ?? false
        const hurt: number[] = []
        // 倒下的人留在倒下的地方、不跟队，复活类的效果够得着所有倒下的同伴
        eachAlly(sim, src.faction, cx, cy, revives ? Infinity : r, revives, (t, x, y) => {
          const dx = x - cx
          const dy = y - cy
          if (Alive.v[t] && dx * dx + dy * dy > r * r) return
          if (!Alive.v[t] || Hp.v[t]! < Hp.max[t]!) hurt.push(t)
        }, src.realm)
        if (hurt.length === 0) return false
        applyOnHit(sim, src, onHit, cx, cy, damage, hurt.map(struckOf), angle)
        if (color !== 0) burst(sim, cx, cy, r, color, false)
        return true
      }
      const list = covered(sim, src, cx, cy, targetsWithin(sim, src, cx, cy, r))
      const found = circleHitIndices({ x: cx, y: cy }, r, list).map((i) => list[i]!)
      const struck = strikeAll(sim, src, found, damage, kb, { x: cx, y: cy }, HIT.area)
      applyOnHit(sim, src, onHit, cx, cy, damage, struck, angle)
      breachAt(sim, cx, cy, BLAST_M, r, breachOf(e))
      if (color !== 0) burst(sim, cx, cy, r, color, damage > 0)
      return true
    }

    case 'chain': {
      let cur = target
      if (!cur) return false
      const visited = new Set<number>()
      const struck: Struck[] = []
      const points: { x: number; y: number }[] = [{ x: ox, y: oy }]
      let dmg = damage
      let last: Found = cur
      for (let hop = 0; hop <= Chain.hops[e]! && cur; hop++) {
        visited.add(cur.eid)
        const from = points[points.length - 1]!
        points.push({ x: cur.x, y: cur.y })
        const s = struckOf(cur.eid)
        if (hit(sim, src, cur.eid, dmg, { knockback: kb, from })) struck.push(s)
        last = cur
        dmg *= Chain.decay[e]!
        // 电弧从这一跳往下一跳传：够得着就行，不看施法者看不看得见
        const at = cur
        cur = nearestTarget(sim, { ...src, sight: undefined }, at.x, at.y, Chain.hopRange[e]!, visited, src.blocked ? (eid) => reaches(sim, at.x, at.y, Transform.x[eid]!, Transform.y[eid]!) : undefined)
      }
      applyOnHit(sim, src, onHit, last.x, last.y, dmg, struck, angle)
      spawnFxBolt(sim, points, color)
      return true
    }

    case 'flyer': {
      launch(sim, e, angle, damage)
      return true
    }

    case 'drop': {
      const seen = new Set<number>()
      const nearest = targetsNear(sim, src, ox, oy, Infinity)
        .map((t) => ({ t, d2: (t.x - ox) ** 2 + (t.y - oy) ** 2 }))
        .sort((a, b) => a.d2 - b.d2)
        .filter(({ t }) => !seen.has(t.eid) && (seen.add(t.eid), true))
        .slice(0, DropShape.targets[e]!)
      if (nearest.length === 0) return false
      nearest.forEach(({ t }, i) =>
        spawnDrop(sim, e, {
          damage,
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

    case 'blink': {
      if (!target) return false
      const m = Owner.eid[e]!
      const dx = target.x - ox
      const dy = target.y - oy
      const d = Math.hypot(dx, dy) || 1
      const behind = target.radius + BlinkShape.behindDist[e]!
      const backX = Transform.x[m]!
      const backY = Transform.y[m]!
      if (!displace(sim, m, { kind: 'transit', x: target.x + (dx / d) * behind, y: target.y + (dy / d) * behind, ms: TRANSIT_MS.blink, look: 'streak', color: BLINK_COLOR }, { self: true })) return false
      BlinkState.phase[e] = BLINK.going
      BlinkState.x[e] = backX
      BlinkState.y[e] = backY
      blinkStrike[e] = { src, target: target.eid, uid: Uid.v[target.eid]!, damage, knockback: kb, onHit }
      return true
    }

    case 'sprint': {
      const m = Owner.eid[e]!
      const seek = SprintShape.seek[e] && target ? target.eid : undefined
      if (!displace(sim, m, { kind: 'dash', angle, distance: SprintShape.distance[e]! * mods.reach, ms: SprintShape.ms[e]! * Math.sqrt(mods.reach), seek }, { self: true, skill: e })) return false
      Motion.dmg[m] = damage
      Motion.breach[m] = breachOf(e)
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

    case 'leap': {
      const m = Owner.eid[e]!
      const dist = LeapShape.distance[e]! * mods.reach
      const to = { x: Transform.x[m]! + Math.cos(angle) * dist, y: Transform.y[m]! + Math.sin(angle) * dist }
      if (!displace(sim, m, { kind: 'arc', x: to.x, y: to.y, ms: LeapShape.ms[e]!, height: LeapShape.height[e]! }, { self: true, skill: e })) return false
      Motion.dmg[m] = damage
      return true
    }

    case 'all': {
      if (AllShape.of[e] === ALL_OF.foes) {
        const list = targetsWithin(sim, src, ox, oy, Infinity)
        const struck: Struck[] = []
        if (damage > 0) {
          for (const t of list) {
            const s = struckOf(t.eid)
            if (hit(sim, src, t.eid, damage, { tags: HIT.area })) struck.push(s)
          }
          sim.out.flash = { color: 0xffffff, alpha: 0.55, durationMs: 380 }
        } else {
          for (const t of list) {
            const s = struckOf(t.eid)
            if (touch(sim, src, t.eid)) struck.push(s)
          }
        }
        applyOnHit(sim, src, onHit, ox, oy, damage, struck, angle)
      } else {
        const allies: number[] = []
        eachAlly(sim, src.faction, ox, oy, Infinity, AllShape.downed[e] === 1, (t) => {
          allies.push(t)
        }, src.realm)
        applyOnHit(sim, src, onHit, ox, oy, damage, allies.map(struckOf), angle)
        for (const t of allies) {
          if (Alive.v[t]) sim.out.events.push({ kind: 'glow', eid: t, uid: Uid.v[t]!, color: color !== 0 ? color : 0xffe082, ms: 320, fxAt: sim.fxMs })
        }
      }
      const fxR = Payload.fxRadius[e]!
      if (fxR > 0) {
        spawnFxCircle(sim, ox, oy, fxR, { fill: color, fillAlpha: 0.3, stroke: color, lineWidth: 4, lineAlpha: 0.9, fromScale: 0.4, toScale: 3, durationMs: 550, depth: 20 })
      }
      return true
    }

    case 'zone': {
      const follow = ZoneShape.follow[e] === 1
      if (follow && Aura.zone[e] !== 0) return false
      const spec = {
        x: ox,
        y: oy,
        radius: ZoneShape.radius[e]!,
        src: flying(src),
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
        rules: zoneRules[e],
      }
      const pulseMs = ZoneShape.pulseMs[e]!
      // 须先落局部变量：spawnZone 可能扩容替换 Aura.zone
      const zone = spawnZone(sim, spec)
      if (follow) Aura.zone[e] = zone
      if (pulseMs > 0) {
        spawnZone(sim, { ...spec, tickMs: pulseMs, damage: 0, mend: 0, effects: abilityPulse[e], pulse: spec.color, fillAlpha: 0, lineAlpha: 0, lineWidth: 0, rules: undefined })
      }
      return true
    }

    case 'summon': {
      const count = SummonShape.count[e]!
      for (let i = 0; i < count; i++) spawnBee(sim, e, i)
      return true
    }

    case 'emplace': {
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

    case 'world': {
      applyAbilityEffects(sim, src, onHit, { x: ox, y: oy, baseDamage: damage, angle })
      return true
    }
    default:
      return unhandledShape(abilityDef[e]!.shape)
  }
}

function unhandledShape(shape: never): never {
  throw new Error(`能力的形状没有出手的处理：${JSON.stringify(shape)}`)
}

/** 能镜像的形状：从出手点打出去、不挪动施法者自己的 */
const MIRRORED = [Bolt, Segment, Sector, Disc, Chain]

/** 出手一次，影子照着再打：从每个影子朝同一个目标（没有目标就同一个方向）；返回本体这一下是否出了手 */
function fireMirrored(sim: Sim, e: number, src: Source, angle: number, target: Found | null, damage: number, mods: Mods): boolean {
  if (!fireOnce(sim, e, src, angle, target, damage, mods)) return false
  if (!hasComponent(sim.world, e, Mirror) || !MIRRORED.some((c) => hasComponent(sim.world, e, c))) return true
  const home = Anchor.eid[e]!
  for (const s of shadowsOf(sim, Owner.eid[e]!)) {
    Anchor.eid[e] = s
    const d = target ? sim.hooks.worldDelta(sim, Transform.x[s]!, Transform.y[s]!, target.x, target.y) : null
    fireOnce(sim, e, { ...src, sight: undefined }, d ? Math.atan2(d.y, d.x) : angle, target, damage, mods)
  }
  Anchor.eid[e] = home
  return true
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

/** 强化下一击：普通出手时取走宿主身上的一次强化 */
function empowered(sim: Sim, e: number): readonly Effect[] {
  if (AbilityClass.skill[e]) return []
  const s = markSlot(sim, Owner.eid[e]!, MARK.empower)
  if (s < 0) return []
  const def = EMPOWER_DEF.get(Mark.b[s]!)
  Mark.a[s] = Mark.a[s]! - 1
  if (Mark.a[s]! <= 0) Mark.kind[s] = MARK.none
  return def?.then ?? []
}

/** 出手：瞄准、第一发、即时重复或安排延迟重复、音效、施法者自身的效果；有蓄力的先蓄力，到点再带着方向回到这里 */
export function fireAbility(sim: Sim, e: number, preset?: Shot): boolean {
  const w = sim.world
  const src = sourceOf(sim, e)
  const shot = preset ?? aimAt(sim, e, sweep(sim, e, src))
  if (!shot) return false
  Aim.rad[e] = shot.angle
  if (!preset && hasComponent(w, e, Windup)) {
    startWindup(sim, e, shot)
    return true
  }
  const cast = abilityOnCast[e]
  if (cast) {
    const o = Owner.eid[e]!
    applyAbilityEffects(sim, src, cast, { x: anchorX(e), y: anchorY(e), baseDamage: 0, targets: [o], angle: shot.angle })
    controlBody(sim, o)
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
  const hold = hasComponent(w, e, Hold) ? Hold.ratio[e]! : 0
  const boost = takeBoost(sim, e)
  const extra = [...(boost?.onHit ?? []), ...empowered(sim, e), ...(hasComponent(w, e, Ammo) && Ammo.n[e] === 1 ? (ammoLast[e] ?? []) : [])]
  const base = abilityOnHit[e]
  const mods: Mods = {
    onHit: extra.length > 0 ? [...(base ?? []), ...extra] : base,
    reach: hold > 0 ? 1 + (Hold.reachMul[e]! - 1) * hold : 1,
  }
  const holdMul = hold > 0 ? 1 + (Hold.damageMul[e]! - 1) * hold : 1
  const damage = Payload.damage[e]! * holdMul * (boost?.damageMul ?? 1)
  if (count <= 1 || delay > 0) {
    if (!fireMirrored(sim, e, src, shot.angle, shot.target, damage, mods)) return false
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
      if (fireMirrored(sim, e, src, angle, shot.target, damage, mods)) fired = true
    }
    if (!fired) return false
  }
  const sfx = abilityFireSfx[e]
  if (sfx) sim.out.events.push({ kind: 'fire', sfx })
  const anchor = Anchor.eid[e]!
  if (hasComponent(w, anchor, Fired)) Fired.v[anchor] = 1
  // 潜行出手即现形，闲着的计时重来
  const o = Owner.eid[e]!
  clearMarks(o, STEALTH)
  if (hasComponent(w, o, Idle)) {
    Idle.since[o] = sim.elapsedMs
    Idle.done[o] = 0
  }
  // 自身效果放最后：消散会把宿主连同这条能力一起移除
  const self = abilityOnSelf[e]
  if (self) applyAbilityEffects(sim, src, self, { x: anchorX(e), y: anchorY(e), baseDamage: damage, targets: [Owner.eid[e]!], angle: shot.angle })
  return true
}

/** 延迟重复的下一发：重新瞄准或沿环转动，伤害按比例打折 */
export function fireRepeat(sim: Sim, e: number): boolean {
  const src = sourceOf(sim, e)
  const count = Repeat.count[e]!
  const i = count - RepeatState.left[e]!
  let angle = RepeatState.angle[e]!
  let target: Found | null = null
  const ox = anchorX(e)
  const oy = anchorY(e)
  switch (Repeat.reaim[e]) {
    case REAIM.nearest: {
      const t = nearestHittable(sim, e, sweep(sim, e, src), ox, oy, Aim.range[e]!)
      if (!t) return false
      target = t
      angle = Math.atan2(t.y - oy, t.x - ox)
      break
    }
    case REAIM.random: {
      const near = targetsNear(sim, sweep(sim, e, src), ox, oy, Aim.range[e]!)
      if (near.length === 0) return false
      target = near[Math.floor(sim.rng.next() * near.length)]!
      angle = Math.atan2(target.y - oy, target.x - ox)
      break
    }
    default:
      if (Repeat.spreadDeg[e]! >= 360 - 1e-9) angle = RepeatState.angle[e]! + (i * Math.PI * 2) / count
  }
  Aim.rad[e] = angle
  if (!fireMirrored(sim, e, src, angle, target, RepeatState.damage[e]! * Repeat.ratio[e]!, { onHit: abilityOnHit[e], reach: 1 })) return false
  const sfx = abilityFireSfx[e]
  if (sfx) sim.out.events.push({ kind: 'fire', sfx })
  return true
}
