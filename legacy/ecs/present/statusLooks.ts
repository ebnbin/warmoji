import Phaser from 'phaser'
import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { ELEMENTS, elementAt } from '../../data/elements'
import { AFFIXES } from '../../data/affixes'
import { Alive, Boss, Depth, Elite, MARK, MARK_SLOTS, Mark, Transform, Uid, VisOff } from '../components'
import { eliteAffixes } from '../store'
import { statusDef } from '../utils/marks'
import { elementNow } from '../utils/element'
import { facingAngle } from '../utils/facing'
import { hostShown } from '../utils/statusTint'
import { ellipse, segment } from '../render/tri'
import type { Scratch } from '../render/tri'
import { packTint, TINT_FILL } from '../render/tint'
import { footY } from '../render/foot'
import { lookKey } from '../render/lookCells'
import type { PaintSprite } from '../render/sprites'
import type { LookPuff, StatusLook } from '../../types/statuses'
import type { Sim } from '../sim'

const WORLD = new Phaser.GameObjects.Components.TransformMatrix()

/** 一次从身上冒出的粒子 */
export interface Puff {
  readonly kind: LookPuff
  readonly x: number
  readonly y: number
  readonly count: number
}

/** 精英与头目身上一直冒的元素粒子：隔多久冒一粒 */
const AURA_MS = 200
/** 冒粒子的记录里，元素那一条占的号：排在各种状态的号后面，精英词缀接在它前面 */
const AURA_KEY = 255
const AFFIX_KEY = 200
/** 粒子记录里多久没冒的就清掉 */
const STALE_MS = 10_000

/** 垫在身体后面的图比身体的 z 小这么一点：紧贴着它画在它之前 */
const BEHIND = 0.001
const COMIC = { stars: { n: 3, size: 0.2, color: 0xffeb3b, periodMs: 1600 }, zzz: { n: 3, size: 0.36, color: 0xe1d5ff, periodMs: 1500 }, hearts: { n: 3, size: 0.32, color: 0xff6f9f, periodMs: 1300 } } as const
const SHACKLE_WIDTH = 6
const SHACKLE_LINKS = 10
/** 拴着的圈比脚下的圈小一圈，压在它上面看得见 */
const SHACKLE_R = 0.3
const ARC_WIDTH = 8
/** 法印：脚下的圈放大多少、几道刻痕、转一圈多久 */
const SIGIL = { r: 1.15, ticks: 6, periodMs: 3000, width: 4 }
const FEET_R = 0.42
const FEET_FLAT = 0.38

/** 一个身体的画面：中心、宽高、z 与它此刻画出来多不透明 */
interface Body {
  readonly eid: number
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly z: number
  readonly alpha: number
}

/** 冒粒子的地方：身体中间一带随机一点、头顶或脚下 */
function spot(sim: Sim, b: Body, from: 'body' | 'head' | 'feet'): { x: number; y: number } {
  switch (from) {
    case 'body':
      return { x: b.x + (Math.random() - 0.5) * b.w * 0.6, y: b.y + (Math.random() - 0.4) * b.h * 0.6 }
    case 'head':
      return { x: b.x + (Math.random() - 0.5) * b.w * 0.2, y: b.y - b.h * 0.48 }
    case 'feet':
      return { x: b.x + (Math.random() - 0.5) * b.w * 0.5, y: footY(sim.world, b.eid) }
  }
}

/** 头上的漫画符号：星星绕着头转（转到后面的垫在身体后面），Z 与心往上飘、越飘越大越淡 */
function comic(sim: Sim, out: PaintSprite[], b: Body, kind: 'stars' | 'zzz' | 'hearts'): void {
  const c = COMIC[kind]
  const frame = sim.frames.index(lookKey(kind === 'stars' ? 'star' : kind === 'zzz' ? 'zee' : 'heart'))
  const top = b.y - b.h * 0.5
  for (let i = 0; i < c.n; i++) {
    const t = (sim.fxMs / c.periodMs + i / c.n) % 1
    if (kind === 'stars') {
      const a = t * Math.PI * 2
      const s = c.size * UNIT
      out.push({ z: Math.sin(a) < 0 ? b.z - BEHIND : b.z, frame, x: b.x + Math.cos(a) * b.w * 0.32, y: top + Math.sin(a) * b.w * 0.1, w: s, h: s, color: c.color, alpha: b.alpha, outlined: true })
      continue
    }
    const s = c.size * UNIT * (0.55 + 0.45 * t)
    const side = kind === 'hearts' && i % 2 === 1 ? -1 : 1
    const x = b.x + side * b.w * (0.16 + 0.22 * t) + (kind === 'hearts' ? Math.sin(t * Math.PI * 4) * b.w * 0.04 : 0)
    out.push({ z: b.z, frame, x, y: top - t * 0.7 * UNIT, w: s, h: s, color: c.color, alpha: b.alpha * (1 - t), outlined: true })
  }
}

/** 套在身上的一层：光晕按自己的颜色填满剪影、轻轻呼吸，冰块跟着身体歪 */
function wrap(sim: Sim, out: PaintSprite[], b: Body, w: NonNullable<StatusLook['wrap']>): void {
  const glow = w.cell === 'glow'
  const k = w.scale * (glow ? 1 + 0.05 * Math.sin(sim.fxMs / 180) : 1)
  out.push({
    z: w.behind ? b.z - BEHIND : b.z,
    frame: sim.frames.index(lookKey(w.cell)),
    x: b.x,
    y: b.y,
    w: b.w * k,
    h: b.h * k,
    rot: w.cell === 'ice' ? Transform.rot[b.eid]! : 0,
    color: w.color,
    alpha: w.alpha * b.alpha,
    effect: glow ? TINT_FILL : 0,
  })
}

/** 脚下拴着的一圈：一圈粗线再压几个扣 */
function shackle(sim: Sim, feet: Scratch, b: Body, color: number): void {
  const fy = footY(sim.world, b.eid)
  const rx = b.w * SHACKLE_R
  const ry = rx * FEET_FLAT
  const c = packTint(color, 0.95 * b.alpha)
  ellipse(feet, WORLD, b.x, fy, rx, ry, SHACKLE_WIDTH, 0, c)
  for (let i = 0; i < SHACKLE_LINKS; i++) {
    const a = (i / SHACKLE_LINKS) * Math.PI * 2
    const px = b.x + Math.cos(a) * rx
    const py = fy + Math.sin(a) * ry
    segment(feet, WORLD, px - 5, py, px + 5, py, SHACKLE_WIDTH + 5, c)
  }
}

/** 身前格挡的那道弧：贴着地，按朝向张开记着的半角 */
function guardArc(sim: Sim, feet: Scratch, b: Body, half: number, color: number): void {
  const fy = footY(sim.world, b.eid)
  const r = b.w * FEET_R * 1.4
  const face = facingAngle(sim, b.eid)
  const n = 10
  const c = packTint(color, 0.9 * b.alpha)
  for (let i = 0; i < n; i++) {
    const a0 = face - half + (2 * half * i) / n
    const a1 = face - half + (2 * half * (i + 1)) / n
    segment(feet, WORLD, b.x + Math.cos(a0) * r, fy + Math.sin(a0) * r * FEET_FLAT, b.x + Math.cos(a1) * r, fy + Math.sin(a1) * r * FEET_FLAT, ARC_WIDTH, c)
  }
}

/** 脚下慢慢转的一圈法印：一圈细线、外面一圈短刻痕 */
function sigil(sim: Sim, feet: Scratch, b: Body, color: number): void {
  const fy = footY(sim.world, b.eid)
  const rx = b.w * FEET_R * SIGIL.r
  const ry = rx * FEET_FLAT
  const c = packTint(color, 0.85 * b.alpha)
  ellipse(feet, WORLD, b.x, fy, rx, ry, SIGIL.width, packTint(color, 0.12 * b.alpha), c)
  const turn = (sim.fxMs / SIGIL.periodMs) * Math.PI * 2
  for (let i = 0; i < SIGIL.ticks; i++) {
    const a = turn + (i / SIGIL.ticks) * Math.PI * 2
    const x0 = b.x + Math.cos(a) * rx
    const y0 = fy + Math.sin(a) * ry
    segment(feet, WORLD, x0, y0, b.x + Math.cos(a) * rx * 1.18, fy + Math.sin(a) * ry * 1.18, SIGIL.width, c)
  }
}

/** 记着各个身体上各种粒子上次冒的时刻，按 Uid 认身体 */
export class PuffClock {
  private readonly last = new Map<number, number>()
  private swept = 0

  /** 到点了就记下这一次，返回该不该冒 */
  due(uid: number, key: number, now: number, everyMs: number): boolean {
    const id = uid * 256 + key
    const at = this.last.get(id)
    if (at !== undefined && now - at < everyMs && now >= at) return false
    this.last.set(id, now)
    return true
  }

  sweep(now: number): void {
    if (now - this.swept < STALE_MS) return
    this.swept = now
    for (const [id, at] of this.last) if (now - at > STALE_MS || at > now) this.last.delete(id)
  }
}

/**
 * 状态与元素在身上的样子：套在身上的图、头上的漫画符号、脚下拴的圈、法印与身前的弧、冒出来的粒子；精英的词缀一直带着自己的样子，精英与头目身上一直冒自己元素的粒子。
 * 只按身体的画面大小与位置摆，不看画的是什么；倒下的、几乎看不见的不画
 */
export function statusLooks(sim: Sim, out: PaintSprite[], feet: Scratch, puffs: Puff[], clock: PuffClock): void {
  const now = sim.elapsedMs
  const fx = sim.fxMs
  clock.sweep(fx)
  const kinds: number[] = []
  for (const eid of query(sim.world, [Mark, Transform, Depth, VisOff])) {
    if (!Alive.v[eid]) continue
    const alpha = hostShown(eid)
    if (alpha < 0.05) continue
    const b: Body = { eid, x: Transform.x[eid]! + VisOff.x[eid]!, y: Transform.y[eid]! + VisOff.y[eid]!, w: Transform.w[eid]!, h: Transform.h[eid]!, z: Depth.z[eid]!, alpha }
    const uid = Uid.v[eid]!
    const puff = (kind: LookPuff, key: number, everyMs: number, count: number, from: 'body' | 'head' | 'feet'): void => {
      if (alpha < 0.5 || !clock.due(uid, key, fx, everyMs)) return
      puffs.push({ kind, count, ...spot(sim, b, from) })
    }
    const show = (look: StatusLook, key: number, s: number): void => {
      if (look.wrap) wrap(sim, out, b, look.wrap)
      if (look.comic) comic(sim, out, b, look.comic)
      if (look.shackle !== undefined) shackle(sim, feet, b, look.shackle)
      if (look.sigil !== undefined) sigil(sim, feet, b, look.sigil)
      if (look.guardArc !== undefined && s >= 0 && Mark.kind[s] === MARK.frontGuard) guardArc(sim, feet, b, Mark.b[s]!, look.guardArc)
      const e = look.emit
      if (!e) return
      const el = e.puff === 'element' && s >= 0 ? elementAt(Mark.a[s]!) : undefined
      const kind = e.puff === 'element' ? (el ? ELEMENTS[el].aura : undefined) : e.puff
      if (kind) puff(kind, key, e.everyMs, e.count, e.from)
    }
    kinds.length = 0
    for (let s = eid * MARK_SLOTS; s < (eid + 1) * MARK_SLOTS; s++) {
      const k = Mark.kind[s]!
      const look = statusDef(k)?.look
      if (!look || Mark.until[s]! <= now || kinds.includes(k)) continue
      kinds.push(k)
      show(look, k, s)
    }
    const affixes = eliteAffixes[eid] ?? []
    affixes.forEach((id, i) => {
      const look = AFFIXES[id].look
      if (look) show(look, AFFIX_KEY + i, -1)
    })
    if (hasComponent(sim.world, eid, Elite) && (Elite.v[eid] || Boss.v[eid])) {
      const el = elementAt(elementNow(sim, eid))
      if (el) puff(ELEMENTS[el].aura, AURA_KEY, AURA_MS, 2, 'body')
    }
  }
}
