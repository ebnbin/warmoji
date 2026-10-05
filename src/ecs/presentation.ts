import Phaser from 'phaser'
import { hasComponent, query } from 'bitecs'
import { LIFT_PER_M, UNIT } from '../util/units'
import { norm } from '../util/vec'
import type { Point } from '../util/vec'
import { rewindMs } from '../data/abilities'
import { STAMINA, staminaTier } from '../data/stamina'
import type { StaminaTier } from '../data/stamina'
import type { ResourceDef } from '../types/enemies'
import { Alive, ENEMY_SET, Floor, Hp, Res, Transform, VisOff } from './components'
import { floorAt } from './utils/pass'
import { abilityDef, resDef } from './store'
import { lookOf } from './entities/shadow'
import { LEVEL_UP_COLOR, levelUpsOnField } from './entities/pickup'
import { goalSpot, holdSpot, nearestTo } from './fight/state'
import { cooled } from './systems/shared/avail'
import { revivable } from './systems/shared/combat'
import { charSize } from './systems/shared/scale'
import { dragging, staminaLeft } from './systems/shared/stamina'
import { traceAt, tracePath } from './systems/shared/trace'
import { rescuing } from './systems/tickRescue'
import { hostShown } from './utils/statusTint'
import { leaderX, leaderY } from './utils/team'
import { fan, newScratch, quad, resetScratch, ringStrip, segment, tri } from './render/tri'
import type { Scratch } from './render/tri'
import { packTint } from './render/tint'
import type { PaintSprite } from './render/sprites'
import type { Sim } from './sim'

/** 按世界坐标画：顶点原样记下，渲染时再乘镜头 */
const WORLD = new Phaser.GameObjects.Components.TransformMatrix()

/** 身体在画面上按脚下的地面抬起多少，像素 */
function lift(eid: number): number {
  return Floor.z[eid]! * LIFT_PER_M
}

const SWEAT = '1f4a6'
const SWEAT_SIZE = 0.42 * UNIT
const SWEAT_Z = 29

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

const MARK_FILL = 0.16
const MARK_LINE = 0.9
const MARK_WIDTH = 4
const INSIDE_COLOR = 0x66bb6a
const OUTSIDE_COLOR = 0xffdc5d
const GOAL_COLOR = 0xffdc5d

/** 地上的一圈：据点或救援的范围 */
interface Mark {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly color: number
}

/** 呈现：身体、队长与这一场的目标的数据画出来的样子，不是实体、不存位置，画在身体上的随身体显隐；每帧推进后按数据重画，收尾时停在最后一帧 */
export class Presentation {
  /** 按 z 排好的精灵：身体头上的汗、队长的倒带残影 */
  readonly sprites: PaintSprite[] = []
  /** 压在实体的圈下面：据点与救援的圈 */
  readonly marks: Scratch = newScratch()
  /** 盖在实体的圈上面：倒带残影下面那段路 */
  readonly trail: Scratch = newScratch()
  /** 队员的血条、资源条与体力条 */
  readonly bars: Scratch = newScratch()
  /** 队长身边指向目标的箭头 */
  readonly pointer: Scratch = newScratch()
  /** 救援圈：全队倒下那一帧起不再更新 */
  private rescue: Mark[] = []

  step(sim: Sim): void {
    this.sprites.length = 0
    for (const s of [this.marks, this.trail, this.bars, this.pointer]) resetScratch(s)
    sweats(sim, this.sprites)
    echo(sim, this.sprites, this.trail)
    this.sprites.sort((a, b) => a.z - b.z)
    bars(sim, this.bars)
    pointer(sim, this.pointer, goalSpot(sim), GOAL_COLOR)
    pointer(sim, this.pointer, nearestTo(sim, levelUpsOnField(sim)), LEVEL_UP_COLOR)
    const r = sim.fight.rules.rescue
    if (!r) this.rescue = []
    else if (!sim.over) this.rescue = rescueMarks(sim, r.radius * UNIT)
    const h = sim.fight.hold
    if (h && h.point < h.rule.points.length) {
      const p = holdSpot(sim, h.rule.points[h.point]!)
      mark(this.marks, { x: p.x, y: p.y, r: h.rule.radius * UNIT, color: h.inside ? INSIDE_COLOR : OUTSIDE_COLOR })
    }
    for (const m of this.rescue) mark(this.marks, m)
  }
}

/** 💦 摆在身体右上方，上下跳着 */
function sweat(sim: Sim, out: PaintSprite[], body: number, size: number): void {
  out.push({
    z: SWEAT_Z,
    frame: sim.frames.index(SWEAT, 'player'),
    x: Transform.x[body]! + VisOff.x[body]! + size * 0.34,
    y: Transform.y[body]! + VisOff.y[body]! - lift(body) - size * 0.42 - Math.abs(Math.sin(sim.fxMs / 160)) * 4,
    w: SWEAT_SIZE,
    h: SWEAT_SIZE,
    color: 0xffffff,
    alpha: hostShown(body),
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
    let y = Transform.y[m]! + VisOff.y[m]! - lift(m) + charSize(m) * 0.62
    rect(o, x, y, BAR_W, 6, back)
    rect(o, x + 1, y + 1, (BAR_W - 2) * ratio, 4, packTint(ratio > 0.5 ? 0x66bb6a : ratio > 0.25 ? 0xffdc5d : 0xef5350, a))
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

/** 目标或最近的升级道具在屏幕外或黑幕里时，在队长身边画一个指过去的箭头 */
function pointer(sim: Sim, o: Scratch, spot: Point | null, color: number): void {
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  const d = spot ? sim.hooks.worldDelta(sim, lx, ly, spot.x, spot.y) : null
  const v = sim.view
  const lit = d !== null && Math.hypot(d.x, d.y) <= sim.fight.rules.vision * UNIT
  if (!d || (lit && lx + d.x >= v.x && lx + d.x <= v.right && ly + d.y >= v.y && ly + d.y <= v.bottom)) return
  const u = norm(d.x, d.y)
  const r = charSize(sim.leader) * 0.75 + 0.3 * UNIT
  const py = ly - lift(sim.leader)
  const tipX = lx + u.x * (r + 0.4 * UNIT)
  const tipY = py + u.y * (r + 0.4 * UNIT)
  const w = 0.25 * UNIT
  const a = hostShown(sim.leader)
  tri(o, WORLD, tipX + u.x * 3, tipY + u.y * 3, lx + u.x * r - u.y * (w + 3), py + u.y * r + u.x * (w + 3), lx + u.x * r + u.y * (w + 3), py + u.y * r - u.x * (w + 3), packTint(0x000000, 0.35 * a))
  tri(o, WORLD, tipX, tipY, lx + u.x * r - u.y * w, py + u.y * r + u.x * w, lx + u.x * r + u.y * w, py + u.y * r - u.x * w, packTint(color, 0.95 * a))
}

/** 队长的主动技能会倒带时，在倒带的落点画一个它的残影，这段路画在地上，越新越清楚；冷却中一起淡下去，也随队长显隐 */
function echo(sim: Sim, sprites: PaintSprite[], trail: Scratch): void {
  const lead = sim.leader
  const root = sim.skills[sim.characters.indexOf(lead)]
  const def = root === undefined ? undefined : abilityDef[root]
  const ms = def && Alive.v[lead] ? rewindMs(def) : 0
  const at = ms > 0 ? traceAt(sim, lead, ms) : null
  if (!at || root === undefined) return
  const dim = (cooled(sim, root) ? 1 : COOLING_DIM) * hostShown(lead)
  sprites.push({
    z: ECHO_Z,
    frame: sim.frames.index(lookOf(sim, lead), 'player'),
    x: at.x,
    y: at.y - floorAt(sim, at.x, at.y) * LIFT_PER_M,
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
    segment(trail, WORLD, ax, ay - floorAt(sim, ax, ay) * LIFT_PER_M, bx, by - floorAt(sim, bx, by) * LIFT_PER_M, TRAIL_WIDTH, packTint(ECHO_COLOR, a))
  }
}

/** 倒下又还能起来的队员身边的救援圈，队长站进来就变色 */
function rescueMarks(sim: Sim, reach: number): Mark[] {
  const out: Mark[] = []
  for (const m of sim.characters) {
    if (Alive.v[m] || !revivable(sim, m)) continue
    out.push({ x: Transform.x[m]!, y: Transform.y[m]! - lift(m), r: reach, color: rescuing(sim, m, reach) ? INSIDE_COLOR : OUTSIDE_COLOR })
  }
  return out
}

function mark(o: Scratch, m: Mark): void {
  fan(o, WORLD, m.x, m.y, m.r, packTint(m.color, MARK_FILL))
  ringStrip(o, WORLD, m.x, m.y, m.r, MARK_WIDTH, packTint(m.color, MARK_LINE))
}
