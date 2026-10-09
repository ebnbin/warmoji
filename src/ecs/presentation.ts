import Phaser from 'phaser'
import { hasComponent, query } from 'bitecs'
import type { QueryTerm } from 'bitecs'
import { UNIT } from '../util/units'
import { norm } from '../util/vec'
import type { Point } from '../util/vec'
import { rewindMs } from '../data/abilities'
import { AFFIXES } from '../data/affixes'
import { ELEMENTS, elementAt } from '../data/elements'
import { STAMINA, staminaTier } from '../data/stamina'
import type { StaminaTier } from '../data/stamina'
import type { ResourceDef } from '../types/enemies'
import { Alive, Boss, Depth, Elite, ENEMY_SET, Facing, Faction, Hp, MARK_SLOTS, Mark, Res, RIM, Slot, Sprite, Tint, Transform, VisOff } from './components'
import { abilityDef, eliteAffixes, resDef } from './store'
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
import { statusDef } from './utils/marks'
import { elementNow } from './utils/element'
import { leaderX, leaderY } from './utils/team'
import { ellipse, fan, newScratch, quad, resetScratch, ringStrip, segment, tri } from './render/tri'
import type { Scratch } from './render/tri'
import { packTint, TINT_FILL } from './render/tint'
import { SIDE } from './render/side'
import { footY } from './utils/ground'
import { FOE_SHOT_Z } from './present/layerShots'
import type { PaintSprite } from './render/sprites'
import type { Sim } from './sim'

/** 按世界坐标画：顶点原样记下，渲染时再乘镜头 */
const WORLD = new Phaser.GameObjects.Components.TransformMatrix()

const SWEAT = '1f4a6'
const SWEAT_SIZE = 0.42 * UNIT
const SWEAT_Z = 29

const ICON_SIZE = 0.34 * UNIT
const ICON_MAX = 3

const BAR_W = 0.8 * UNIT
const RES_COLOR: Record<ResourceDef['kind'], number> = { energy: 0xffee58, fury: 0xef5350, heat: 0xff9800, growth: 0x9ccc65 }
const STAMINA_COLOR: Record<StaminaTier, number> = { ok: 0x4dd0e1, slow: 0xffa726, low: 0xef5350 }

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
/** 队长圈外指着朝向的箭头：离圈多远、多长、半宽 */
const HEAD_GAP = 3
const HEAD_LEN = 9
const HEAD_W = 6

/** 队长被后画的身体盖住时，在最上面透出它的金色剪影，只压在敌方弹体下面 */
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
  /** 按 z 排好的精灵：身体头上的汗与状态图标、队长的倒带残影 */
  readonly sprites: PaintSprite[] = []
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
  /** 救援圈：全队倒下那一帧起不再更新 */
  private rescue: Mark[] = []

  step(sim: Sim): void {
    this.sprites.length = 0
    for (const s of [this.marks, this.trail, this.bars, this.feet, this.pointer]) resetScratch(s)
    sweats(sim, this.sprites)
    statusIcons(sim, this.sprites)
    echo(sim, this.sprites, this.trail)
    xray(sim, this.sprites)
    this.sprites.sort((a, b) => a.z - b.z)
    bars(sim, this.bars)
    feet(sim, this.feet)
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

/** 💦 摆在身体右上方，上下跳着 */
function sweat(sim: Sim, out: PaintSprite[], body: number, size: number): void {
  out.push({
    z: SWEAT_Z,
    frame: sim.frames.index(SWEAT),
    x: Transform.x[body]! + VisOff.x[body]! + size * 0.34,
    y: Transform.y[body]! + VisOff.y[body]! - size * 0.42 - Math.abs(Math.sin(sim.fxMs / 160)) * 4,
    w: SWEAT_SIZE,
    h: SWEAT_SIZE,
    color: 0xffffff,
    alpha: hostShown(body),
    rim: RIM.item,
  })
}

/** 拖慢全队的队员头上冒 💦；累到减速的敌人头上也冒，这是反打的时机 */
function sweats(sim: Sim, out: PaintSprite[]): void {
  for (const m of sim.characters) if (dragging(sim, m)) sweat(sim, out, m, charSize(m))
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (!Alive.v[eid] || staminaLeft(eid) >= STAMINA.slowFrom) continue
    sweat(sim, out, eid, Transform.h[eid]!)
  }
}

/** 头顶横排的一排图标，row 是从头顶往上数的第几排 */
function iconRow(sim: Sim, out: PaintSprite[], eid: number, emojis: readonly string[], row: number): void {
  const h = hasComponent(sim.world, eid, Slot) ? charSize(eid) : Transform.h[eid]!
  const x0 = Transform.x[eid]! + VisOff.x[eid]! - ((emojis.length - 1) * ICON_SIZE) / 2
  const y = Transform.y[eid]! + VisOff.y[eid]! - h * 0.5 - ICON_SIZE * (0.55 + row)
  const alpha = hostShown(eid)
  emojis.forEach((emoji, j) => out.push({ z: SWEAT_Z, frame: sim.frames.index(emoji), x: x0 + j * ICON_SIZE, y, w: ICON_SIZE, h: ICON_SIZE, color: 0xffffff, alpha, rim: RIM.item }))
}

/** 精英与头目头顶第一排打头的元素图标：小怪太多不标，靠图鉴认 */
function elementIcon(sim: Sim, eid: number): string[] {
  const el = elementAt(hasComponent(sim.world, eid, Elite) && (Elite.v[eid] || Boss.v[eid]) ? elementNow(sim, eid) : 0)
  return el ? [ELEMENTS[el].icon] : []
}

/** 头顶的图标：精英与头目的元素和精英的词缀贴着头顶一排；带时限、正生效的状态按图标的轻重排，最多三个，再上面一排；倒下的不画 */
function statusIcons(sim: Sim, out: PaintSprite[]): void {
  const now = sim.elapsedMs
  const kinds: number[] = []
  for (const eid of query(sim.world, [Mark, Transform])) {
    if (!Alive.v[eid]) continue
    const head = [...elementIcon(sim, eid), ...(eliteAffixes[eid] ?? []).map((id) => AFFIXES[id].icon)]
    iconRow(sim, out, eid, head, 0)
    kinds.length = 0
    for (let s = eid * MARK_SLOTS; s < (eid + 1) * MARK_SLOTS; s++) {
      const k = Mark.kind[s]!
      const until = Mark.until[s]!
      if (statusDef(k)?.icon && until > now && until !== Infinity && !kinds.includes(k)) kinds.push(k)
    }
    kinds.sort((a, b) => statusDef(a)!.icon!.rank - statusDef(b)!.icon!.rank)
    iconRow(sim, out, eid, kinds.slice(0, ICON_MAX).map((k) => statusDef(k)!.icon!.emoji), head.length > 0 ? 1 : 0)
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
    rect(o, x + 1, y + 1, (BAR_W - 2) * ratio, 4, packTint(ratio > 0.5 ? SIDE.team : ratio > 0.25 ? 0xffdc5d : 0xef5350, a))
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

/** 脚下的圈：队员蓝圈，队长金圈、圈外一个箭头指着朝向，精英与头目琥珀圈；倒下的不画 */
function feet(sim: Sim, o: Scratch): void {
  for (const m of sim.characters) {
    if (!Alive.v[m]) continue
    const lead = m === sim.leader
    const a = hostShown(m)
    const r = footRing(sim, o, m, charSize(m), lead ? SIDE.lead : SIDE.team, lead ? LEAD_RING : TEAM_RING, a)
    if (!lead) continue
    const f = norm(Facing.x[m]!, Facing.y[m]!)
    const bx = r.x + f.x * (r.rx + HEAD_GAP)
    const by = r.y + f.y * (r.ry + HEAD_GAP * FEET_FLAT)
    const s = norm(f.x, f.y * FEET_FLAT)
    tri(o, WORLD, bx + s.x * HEAD_LEN, by + s.y * HEAD_LEN, bx - s.y * HEAD_W, by + s.x * HEAD_W, bx + s.y * HEAD_W, by - s.x * HEAD_W, packTint(SIDE.lead, 0.95 * a))
  }
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (!Alive.v[eid] || !(Elite.v[eid] || Boss.v[eid])) continue
    footRing(sim, o, eid, Transform.w[eid]!, SIDE.elite, ELITE_RING, Tint.alpha[eid]!)
  }
}

/** 队长被后画的身体盖住时（按 z 排在它后面、画面中间压着它的中心），在最上面透出它的金色剪影 */
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
    color: SIDE.lead,
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
