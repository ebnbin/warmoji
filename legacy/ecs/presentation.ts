import Phaser from 'phaser'
import { entityExists, hasComponent, query } from 'bitecs'
import type { QueryTerm } from 'bitecs'
import { UNIT } from '../util/units'
import { norm } from '../util/vec'
import type { Point } from '../util/vec'
import { rewindMs } from '../data/abilities'
import { STAMINA, staminaTier } from '../data/stamina'
import type { StaminaTier } from '../data/stamina'
import type { ResourceDef } from '../types/enemies'
import {
  Aim,
  Alive,
  Bolt,
  Boss,
  Casting,
  Depth,
  Disc,
  DISC_AT,
  Elite,
  Emplacement,
  ENEMY_SET,
  FACTION,
  Facing,
  Faction,
  Hp,
  LeapShape,
  Owner,
  Radius,
  Repeat,
  Res,
  Sector,
  Segment,
  Slot,
  SprintShape,
  Sprite,
  Tint,
  TINT_SIDE,
  Transform,
  Uid,
  VisOff,
} from './components'
import { DEG2RAD } from '../util/units'
import { volleyAngle } from './systems/shared/fire'
import { anchorX, anchorY } from './utils/ability'
import { abilityDef, resDef } from './store'
import { lookOf } from './entities/shadow'
import { LEVEL_UP_COLOR, levelUpsOnField } from './entities/pickup'
import { goalSpot, holdSpot, leakRings, nearestTo, visitRings } from './fight/state'
import { cooled, turnOf } from './systems/shared/avail'
import { revivable } from './systems/shared/combat'
import { charSize } from './systems/shared/scale'
import { dragging, staminaLeft } from './systems/shared/stamina'
import { traceAt, tracePath } from './systems/shared/trace'
import { rescuing } from './systems/tickRescue'
import { hostShown } from './utils/statusTint'
import { leaderX, leaderY } from './utils/team'
import { ellipse, fan, newScratch, quad, resetScratch, ringStrip, segment, tri } from './render/tri'
import type { Scratch } from './render/tri'
import { packTint, TINT_FILL } from './render/tint'
import { SIDE } from './render/side'
import { footY } from './render/foot'
import { FOE_SHOT_Z } from './present/layerShots'
import type { PaintSprite } from './render/sprites'
import { lookKey } from './render/lookCells'
import { PuffClock, statusLooks } from './present/statusLooks'
import type { Puff } from './present/statusLooks'
import type { Sim } from './sim'

/** 按世界坐标画：顶点原样记下，渲染时再乘镜头 */
const WORLD = new Phaser.GameObjects.Components.TransformMatrix()

/** 汗滴：自己画的一滴，染成浅蓝 */
const SWEAT_COLOR = 0x81d4fa
const SWEAT_SIZE = 0.42 * UNIT
const SWEAT_Z = 29


const BAR_W = 0.8 * UNIT
const RES_COLOR: Record<ResourceDef['kind'], number> = { energy: 0xffee58, fury: 0xef5350, heat: 0xff9800, growth: 0x9ccc65 }
const STAMINA_COLOR: Record<StaminaTier, number> = { ok: 0x66bb6a, slow: 0xffa726, low: 0xef5350 }
const HP_COLOR = 0xef5350

const ECHO_COLOR = 0x80deea
const ECHO_ALPHA = 0.5
const ECHO_Z = 4
const COOLING_DIM = 0.4
const TRAIL_WIDTH = 5
const TRAIL_ALPHA_OLD = 0.16
const TRAIL_ALPHA_NEW = 0.34

/** 脚下的圈：横半径是身体画面尺寸的 FEET_R，压扁成 FEET_FLAT 那么扁；线宽与填充的浓度按谁分 */
const FEET_R = 0.42
const FEET_FLAT = 0.38
const TEAM_RING = { line: 3, fill: 0.16 }
const LEAD_RING = { line: 4.5, fill: 0.22 }
const ELITE_RING = { line: 3, fill: 0.12 }
/** 头目：两圈同心的粗圈，里面那圈缩到 BOSS_INNER */
const BOSS_RING = { line: 4.5, fill: 0.12 }
const BOSS_INNER = 0.8
/** 队长圈外指着朝向的箭头：离圈多远、多长、半宽 */
const HEAD_GAP = 3
const HEAD_LEN = 9
const HEAD_W = 6

/** 队长被后画的身体盖住时，在最上面透出它的黄色剪影，只压在敌方弹体下面 */
const XRAY_Z = FOE_SHOT_Z - 1
const XRAY_ALPHA = 0.5
/** 盖住队长的身体：队长的中心落在它画面的中间这一成里 */
const XRAY_COVER = 0.35
const BODIES: QueryTerm[] = [Faction, Alive, Transform, Depth, Tint]

const MARK_FILL = 0.16
const MARK_LINE = 0.9
const MARK_WIDTH = 4
const INSIDE_COLOR = 0x66bb6a
const OUTSIDE_COLOR = 0xffdc5d
const LEAK_COLOR = 0xef5350
const GOAL_COLOR = 0xffdc5d
const BEACON_COLOR = 0x4dd0e1

/** 地上的一圈：据点、地标、要守住的地方或救援的范围 */
interface Mark {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly color: number
}

/** 呈现：身体、队长与这一场的目标的数据画出来的样子，不是实体、不存位置，画在身体上的随身体显隐；每帧推进后按数据重画，收尾时停在最后一帧 */
export class Presentation {
  /** 按 z 排好的精灵：身体头上的汗、状态在身上的样子、队长的倒带残影 */
  readonly sprites: PaintSprite[] = []
  /** 这一帧从身上冒的粒子：由场景交给粒子发射器 */
  readonly puffs: Puff[] = []
  private readonly clock = new PuffClock()
  /** 压在实体的圈下面：据点、要到访的地标、不许敌人走到的地方与救援的圈 */
  readonly marks: Scratch = newScratch()
  /** 盖在实体的圈上面：倒带残影下面那段路 */
  readonly trail: Scratch = newScratch()
  /** 队员的血条、资源条与体力条 */
  readonly bars: Scratch = newScratch()
  /** 脚下的圈：队员、队长与精英头目 */
  readonly feet: Scratch = newScratch()
  /** 队长身边指向目标的箭头 */
  readonly pointer: Scratch = newScratch()
  /** 敌方蓄力时地上的预警：压在身体与脚下的圈下面 */
  readonly warn: Scratch = newScratch()
  /** 救援圈：全队倒下那一帧起不再更新 */
  private rescue: Mark[] = []

  step(sim: Sim): void {
    this.sprites.length = 0
    this.puffs.length = 0
    for (const s of [this.marks, this.trail, this.bars, this.feet, this.pointer, this.warn]) resetScratch(s)
    sweats(sim, this.sprites)
    feet(sim, this.feet)
    statusLooks(sim, this.sprites, this.feet, this.puffs, this.clock)
    echo(sim, this.sprites, this.trail)
    xray(sim, this.sprites)
    this.sprites.sort((a, b) => a.z - b.z)
    bars(sim, this.bars)
    warnings(sim, this.warn)
    pointer(sim, this.pointer, goalSpot(sim), GOAL_COLOR)
    pointer(sim, this.pointer, nearestTo(sim, levelUpsOnField(sim)), LEVEL_UP_COLOR)
    pointer(sim, this.pointer, sim.hooks.beacon?.(sim) ?? null, BEACON_COLOR)
    const r = sim.fight.rules.rescue
    if (!r) this.rescue = []
    else if (!sim.over) this.rescue = rescueMarks(sim, r.radius * UNIT)
    const h = sim.fight.hold
    const p = h && h.point < h.rule.points.length ? holdSpot(sim, h.rule.points[h.point]!) : null
    if (h && p) mark(this.marks, { x: p.x, y: p.y, r: h.rule.radius * UNIT, color: h.inside ? INSIDE_COLOR : OUTSIDE_COLOR })
    for (const v of visitRings(sim)) if (!v.done) mark(this.marks, { x: v.x, y: v.y, r: v.r, color: v.here ? INSIDE_COLOR : OUTSIDE_COLOR })
    for (const l of leakRings(sim)) mark(this.marks, { x: l.x, y: l.y, r: l.r, color: LEAK_COLOR })
    for (const m of this.rescue) mark(this.marks, m)
  }
}

/** 汗滴摆在身体右上方，上下跳着 */
function sweat(sim: Sim, out: PaintSprite[], body: number, size: number): void {
  out.push({
    z: SWEAT_Z,
    frame: sim.frames.index(lookKey('drop')),
    x: Transform.x[body]! + VisOff.x[body]! + size * 0.34,
    y: Transform.y[body]! + VisOff.y[body]! - size * 0.42 - Math.abs(Math.sin(sim.fxMs / 160)) * 4,
    w: SWEAT_SIZE,
    h: SWEAT_SIZE,
    color: SWEAT_COLOR,
    alpha: hostShown(body),
    outlined: true,
  })
}

/** 拖慢全队的队员头上冒汗；累到减速的敌人头上也冒，这是反打的时机 */
function sweats(sim: Sim, out: PaintSprite[]): void {
  for (const m of sim.characters) if (dragging(sim, m)) sweat(sim, out, m, charSize(m))
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (!Alive.v[eid] || staminaLeft(eid) >= STAMINA.slowFrom) continue
    sweat(sim, out, eid, Transform.h[eid]!)
  }
}

function rect(o: Scratch, x: number, y: number, w: number, h: number, color: number): void {
  quad(o, WORLD, x, y, x + w, y, x + w, y + h, x, y + h, color)
}

/** 队员的血条与资源条，队长再多一条体力条、满了收起；倒下的不画 */
function bars(sim: Sim, o: Scratch): void {
  for (const m of sim.characters) {
    if (!Alive.v[m]) continue
    const a = hostShown(m)
    const back = packTint(0x000000, 0.45 * a)
    const ratio = Math.max(0, Math.min(1, Hp.v[m]! / Hp.max[m]!))
    const res = hasComponent(sim.world, m, Res) ? Res.v[m]! / Math.max(1, Res.max[m]!) : -1
    const locked = res >= 0 && sim.elapsedMs < Res.lock[m]!
    const sta = m === sim.leader ? staminaLeft(m) : 1
    const x = Transform.x[m]! + VisOff.x[m]! - BAR_W / 2
    let y = Transform.y[m]! + VisOff.y[m]! + charSize(m) * 0.62
    rect(o, x, y, BAR_W, 6, back)
    rect(o, x + 1, y + 1, (BAR_W - 2) * ratio, 4, packTint(HP_COLOR, a))
    y += 7
    if (res >= 0) {
      rect(o, x, y, BAR_W, 5, back)
      rect(o, x + 1, y + 1, (BAR_W - 2) * res, 3, packTint(locked ? (Math.floor(sim.fxMs / 150) % 2 ? 0xffffff : 0xff5722) : RES_COLOR[resDef[m]!.kind], a))
      y += 6
    }
    if (sta >= 1) continue
    rect(o, x, y, BAR_W, 6, back)
    rect(o, x + 1, y + 1, (BAR_W - 2) * sta, 4, packTint(STAMINA_COLOR[staminaTier(sta)], a))
  }
}

/** 身体脚下平躺的一圈，返回它的中心与半径 */
function footRing(sim: Sim, o: Scratch, eid: number, size: number, color: number, ring: { readonly line: number; readonly fill: number }, alpha: number): { x: number; y: number; rx: number; ry: number } {
  const x = Transform.x[eid]! + VisOff.x[eid]!
  const y = footY(sim.world, eid)
  const rx = size * FEET_R
  const ry = rx * FEET_FLAT
  ellipse(o, WORLD, x, y, rx, ry, ring.line, packTint(color, ring.fill * alpha), packTint(color, 0.95 * alpha))
  return { x, y, rx, ry }
}

/** 脚下有圈的：身体与装置 */
const FOOTED: QueryTerm[] = [Alive, Radius, Transform, Tint]
const EMPLACED: QueryTerm[] = [Emplacement, Transform, Tint]

/** 脚下的圈：队伍的身体与装置一圈黄，队长的粗一些、圈外一个箭头指着朝向；精英一圈细红，头目两圈同心的粗红；倒下的不画 */
function feet(sim: Sim, o: Scratch): void {
  for (const eid of query(sim.world, FOOTED)) {
    if (!Alive.v[eid]) continue
    const a = Tint.alpha[eid]!
    const size = hasComponent(sim.world, eid, Slot) ? charSize(eid) : Transform.w[eid]!
    if (Tint.side[eid] !== TINT_SIDE.team) {
      if (Boss.v[eid]) {
        const r = footRing(sim, o, eid, size, SIDE.strong, BOSS_RING, a)
        ellipse(o, WORLD, r.x, r.y, r.rx * BOSS_INNER, r.ry * BOSS_INNER, BOSS_RING.line, 0, packTint(SIDE.strong, 0.95 * a))
      } else if (Elite.v[eid]) footRing(sim, o, eid, size, SIDE.strong, ELITE_RING, a)
      continue
    }
    if (eid !== sim.leader) {
      footRing(sim, o, eid, size, SIDE.team, TEAM_RING, a)
      continue
    }
    const r = footRing(sim, o, eid, size, SIDE.team, LEAD_RING, a)
    const f = norm(Facing.x[eid]!, Facing.y[eid]!)
    const bx = r.x + f.x * (r.rx + HEAD_GAP)
    const by = r.y + f.y * (r.ry + HEAD_GAP * FEET_FLAT)
    const d = norm(f.x, f.y * FEET_FLAT)
    tri(o, WORLD, bx + d.x * HEAD_LEN, by + d.y * HEAD_LEN, bx - d.y * HEAD_W, by + d.x * HEAD_W, bx + d.y * HEAD_W, by - d.x * HEAD_W, packTint(SIDE.team, 0.95 * a))
  }
  for (const eid of query(sim.world, EMPLACED)) {
    if (Tint.side[eid] === TINT_SIDE.team) footRing(sim, o, eid, Transform.w[eid]!, SIDE.team, TEAM_RING, Tint.alpha[eid]!)
  }
}

/** 队长被后画的身体盖住时（按 z 排在它后面、画面中间压着它的中心），在最上面透出它的黄色剪影 */
function xray(sim: Sim, out: PaintSprite[]): void {
  const lead = sim.leader
  if (!Alive.v[lead]) return
  const x = Transform.x[lead]! + VisOff.x[lead]!
  const y = Transform.y[lead]! + VisOff.y[lead]!
  const z = Depth.z[lead]!
  let covered = false
  for (const eid of query(sim.world, BODIES)) {
    if (eid === lead || !Alive.v[eid] || Depth.z[eid]! <= z || Tint.alpha[eid]! < 0.5) continue
    if (Math.abs(Transform.x[eid]! + VisOff.x[eid]! - x) > Transform.w[eid]! * XRAY_COVER) continue
    if (Math.abs(Transform.y[eid]! + VisOff.y[eid]! - y) > Transform.h[eid]! * XRAY_COVER) continue
    covered = true
    break
  }
  if (!covered) return
  out.push({
    z: XRAY_Z,
    frame: Sprite.frame[lead]!,
    x,
    y,
    w: Transform.w[lead]!,
    h: Transform.h[lead]!,
    rot: Transform.rot[lead]!,
    flipX: Sprite.flipX[lead]!,
    color: SIDE.team,
    alpha: XRAY_ALPHA * hostShown(lead),
    effect: TINT_FILL,
  })
}

/** 目标、最近的升级道具或地图要盯住的那一处在屏幕外或黑幕里时，在队长身边画一个指过去的箭头 */
function pointer(sim: Sim, o: Scratch, spot: Point | null, color: number): void {
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  const d = spot ? sim.hooks.worldDelta(sim, lx, ly, spot.x, spot.y) : null
  const v = sim.view
  const lit = d !== null && Math.hypot(d.x, d.y) <= sim.fight.rules.vision * UNIT
  if (!d || (lit && lx + d.x >= v.x && lx + d.x <= v.right && ly + d.y >= v.y && ly + d.y <= v.bottom)) return
  const u = norm(d.x, d.y)
  const r = charSize(sim.leader) * 0.75 + 0.3 * UNIT
  const tipX = lx + u.x * (r + 0.4 * UNIT)
  const tipY = ly + u.y * (r + 0.4 * UNIT)
  const w = 0.25 * UNIT
  const a = hostShown(sim.leader)
  tri(o, WORLD, tipX + u.x * 3, tipY + u.y * 3, lx + u.x * r - u.y * (w + 3), ly + u.y * r + u.x * (w + 3), lx + u.x * r + u.y * (w + 3), ly + u.y * r - u.x * (w + 3), packTint(0x000000, 0.35 * a))
  tri(o, WORLD, tipX, tipY, lx + u.x * r - u.y * w, ly + u.y * r + u.x * w, lx + u.x * r + u.y * w, ly + u.y * r - u.x * w, packTint(color, 0.95 * a))
}

/** 队长的主动技能会倒带时，在倒带的落点画一个它的残影，这段路画在地上，越新越清楚；冷却中一起淡下去，也随队长显隐 */
function echo(sim: Sim, sprites: PaintSprite[], trail: Scratch): void {
  const lead = sim.leader
  const root = sim.skills[sim.characters.indexOf(lead)]
  const cur = root === undefined ? undefined : turnOf(sim, root)
  const def = cur === undefined ? undefined : abilityDef[cur]
  const ms = def && Alive.v[lead] ? rewindMs(def) : 0
  const at = ms > 0 ? traceAt(sim, lead, ms) : null
  if (!at || cur === undefined) return
  const dim = (cooled(sim, cur) ? 1 : COOLING_DIM) * hostShown(lead)
  sprites.push({
    z: ECHO_Z,
    frame: sim.frames.index(lookOf(sim, lead)),
    x: at.x,
    y: at.y,
    w: Transform.w[lead]!,
    h: Transform.h[lead]!,
    color: ECHO_COLOR,
    alpha: ECHO_ALPHA * dim,
  })
  const pts = tracePath(sim, lead, ms)
  if (!pts) return
  const n = pts.length / 2
  for (let i = 1; i < n; i++) {
    const a = (TRAIL_ALPHA_OLD + ((TRAIL_ALPHA_NEW - TRAIL_ALPHA_OLD) * i) / (n - 1)) * dim
    const ax = pts[i * 2 - 2]!
    const ay = pts[i * 2 - 1]!
    const bx = pts[i * 2]!
    const by = pts[i * 2 + 1]!
    segment(trail, WORLD, ax, ay, bx, by, TRAIL_WIDTH, packTint(ECHO_COLOR, a))
  }
}

/** 倒下又还能起来的队员身边的救援圈，队长站进来就变色 */
function rescueMarks(sim: Sim, reach: number): Mark[] {
  const out: Mark[] = []
  for (const m of sim.characters) {
    if (Alive.v[m] || !revivable(sim, m)) continue
    out.push({ x: Transform.x[m]!, y: Transform.y[m]!, r: reach, color: rescuing(sim, m, reach) ? INSIDE_COLOR : OUTSIDE_COLOR })
  }
  return out
}

function mark(o: Scratch, m: Mark): void {
  fan(o, WORLD, m.x, m.y, m.r, packTint(m.color, MARK_FILL))
  ringStrip(o, WORLD, m.x, m.y, m.r, MARK_WIDTH, packTint(m.color, MARK_LINE))
}

/** 预警：底下一层淡红标出要打到的范围，再一层随蓄力从里往外填满，填满的那一刻出手；快出手时描边亮起来 */
const WARN = { color: SIDE.foe, base: 0.1, fill: 0.3, line: 0.75, width: 3, hotMs: 120 } as const
/** 弹体的预警只画一段，免得一条线横穿整个屏幕 */
const WARN_SHOT_MAX = 6 * UNIT
/** 瞬袭的预警：目标脚下一个准星 */
const WARN_MARK_R = 0.45 * UNIT

interface Warn {
  readonly o: Scratch
  readonly p: number
  readonly alpha: number
  readonly hot: boolean
}

function warnLine(w: Warn): number {
  return packTint(WARN.color, (w.hot ? 1 : WARN.line) * w.alpha)
}

function warnCircle(w: Warn, x: number, y: number, r: number): void {
  fan(w.o, WORLD, x, y, r, packTint(WARN.color, WARN.base * w.alpha))
  if (w.p > 0) fan(w.o, WORLD, x, y, r * w.p, packTint(WARN.color, WARN.fill * w.alpha))
  ringStrip(w.o, WORLD, x, y, r, WARN.width, warnLine(w))
}

function wedgeFan(o: Scratch, x: number, y: number, r: number, a0: number, a1: number, color: number): void {
  const n = Math.max(4, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 40))
  const d = (a1 - a0) / n
  for (let k = 0; k < n; k++) {
    const a = a0 + k * d
    const b = a + d
    tri(o, WORLD, x, y, x + Math.cos(a) * r, y + Math.sin(a) * r, x + Math.cos(b) * r, y + Math.sin(b) * r, color)
  }
}

function warnWedge(w: Warn, x: number, y: number, r: number, angle: number, half: number): void {
  const a0 = angle - half
  const a1 = angle + half
  wedgeFan(w.o, x, y, r, a0, a1, packTint(WARN.color, WARN.base * w.alpha))
  if (w.p > 0) wedgeFan(w.o, x, y, r * w.p, a0, a1, packTint(WARN.color, WARN.fill * w.alpha))
  const line = warnLine(w)
  ringStrip(w.o, WORLD, x, y, r, WARN.width, line, a0, a1)
  segment(w.o, WORLD, x, y, x + Math.cos(a0) * r, y + Math.sin(a0) * r, WARN.width, line)
  segment(w.o, WORLD, x, y, x + Math.cos(a1) * r, y + Math.sin(a1) * r, WARN.width, line)
}

/** 从 (x, y) 朝 angle 伸出 len、半宽 half 的一条 */
function warnLane(w: Warn, x: number, y: number, angle: number, len: number, half: number): void {
  const ca = Math.cos(angle)
  const sa = Math.sin(angle)
  const rect = (l: number, color: number): void =>
    quad(w.o, WORLD, x - sa * half, y + ca * half, x + sa * half, y - ca * half, x + ca * l + sa * half, y + sa * l - ca * half, x + ca * l - sa * half, y + sa * l + ca * half, color)
  rect(len, packTint(WARN.color, WARN.base * w.alpha))
  if (w.p > 0) rect(len * w.p, packTint(WARN.color, WARN.fill * w.alpha))
  const line = warnLine(w)
  const ex = x + ca * len
  const ey = y + sa * len
  segment(w.o, WORLD, x - sa * half, y + ca * half, ex - sa * half, ey + ca * half, WARN.width, line)
  segment(w.o, WORLD, x + sa * half, y - ca * half, ex + sa * half, ey - ca * half, WARN.width, line)
  segment(w.o, WORLD, ex - sa * half, ey + ca * half, ex + sa * half, ey - ca * half, WARN.width, line)
}

/** 同时打出去的几发各朝哪：散开的按扇面分，其余就是瞄着的方向 */
function volley(e: number, angle: number): number[] {
  const n = Repeat.count[e]!
  if (n <= 1 || Repeat.delayMs[e]! > 0 || Repeat.everyN[e]! > 0) return [angle]
  return Array.from({ length: n }, (_, i) => volleyAngle(angle, Repeat.spreadDeg[e]!, i, n))
}

/**
 * 敌方身体蓄力时，按在蓄的那条能力的形状在地上画出要打到的地方：一圈、一扇、一条、落点或准星，随蓄力填满；
 * 每种形状都要说清画不画，同一种形状在哪张图都是同一种预警；只画打得到队伍的，随身体显隐
 */
function warnings(sim: Sim, o: Scratch): void {
  const now = sim.elapsedMs
  for (const b of query(sim.world, ENEMY_SET)) {
    const until = Casting.until[b]!
    const e = Casting.ability[b]!
    if (!Alive.v[b] || now >= until || e < 0 || !entityExists(sim.world, e) || Uid.v[e] !== Casting.abilityUid[b] || Owner.eid[e] !== b) continue
    if (Faction.v[e] !== FACTION.enemy) continue
    const def = abilityDef[e]
    if (!def) continue
    const from = Casting.from[b]!
    const w: Warn = { o, p: until > from ? Math.min(1, Math.max(0, (now - from) / (until - from))) : 1, alpha: Tint.alpha[b]!, hot: until - now <= WARN.hotMs }
    const x = anchorX(e)
    const y = anchorY(e)
    const angle = Casting.angle[b]!
    const shape = def.shape
    switch (shape.kind) {
      case 'disc':
        if (Disc.at[e] === DISC_AT.self) warnCircle(w, x, y, Disc.radius[e]!)
        else warnCircle(w, Casting.tx[b]!, Casting.ty[b]!, Disc.radius[e]!)
        break
      case 'segment':
        for (const a of volley(e, angle)) warnLane(w, x, y, a, Segment.reach[e]!, Math.max(Segment.radius[e]!, 0.15 * UNIT))
        break
      case 'sector':
        for (const a of volley(e, angle)) warnWedge(w, x, y, Sector.radius[e]!, a, (Sector.arcDeg[e]! * DEG2RAD) / 2)
        break
      case 'sprint':
        warnLane(w, x, y, angle, SprintShape.distance[e]!, SprintShape.radius[e]! || Radius.v[b]!)
        break
      case 'leap':
        segment(o, WORLD, x, y, x + Math.cos(angle) * LeapShape.distance[e]!, y + Math.sin(angle) * LeapShape.distance[e]!, WARN.width, packTint(WARN.color, WARN.line * 0.5 * w.alpha))
        warnCircle(w, x + Math.cos(angle) * LeapShape.distance[e]!, y + Math.sin(angle) * LeapShape.distance[e]!, LeapShape.radius[e]!)
        break
      case 'bolt': {
        const reach = Math.min(WARN_SHOT_MAX, Aim.range[e]! || WARN_SHOT_MAX, (Bolt.speed[e]! * Bolt.lifeMs[e]!) / 1000)
        for (const a of volley(e, angle)) warnLane(w, x, y, a, reach, Math.max(Bolt.radius[e]!, 0.1 * UNIT))
        break
      }
      case 'blink':
      case 'chain':
        warnCircle(w, Casting.tx[b]!, Casting.ty[b]!, WARN_MARK_R)
        break
      // 打全场的靠全屏的闪光交代；场、召唤、装置与世界效果各有自己的样子，飞返体、坠物出手后看得见
      case 'all':
      case 'zone':
      case 'summon':
      case 'emplace':
      case 'world':
      case 'flyer':
      case 'drop':
        break
      default:
        unwarned(shape)
    }
  }
}

function unwarned(shape: never): never {
  throw new Error(`能力的形状没有说清画不画预警：${JSON.stringify(shape)}`)
}
