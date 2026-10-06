import { FRAME_U, UNIT } from '../../util/units.ts'
import { Rng } from '../../util/rng.ts'
import { makeBasin, roomAt } from '../basin.ts'
import type { Basin } from '../basin'
import type { Landmark } from '../landmark'
import type { SavannaConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 能走的地面按这么细的格子算距离场，格 */
const BASIN_CELL_U = 0.25
/** 草地的外形是超椭圆：指数越大越方 */
const SQUARE_P = 5
/** 生成出来的草地面积不对就换一组随机数，最多试这么多次 */
const TRIES = 40
/** 山丘前排的石头一块挨一块：中心隔开半径和的这么多倍 */
const BOULDER_OVERLAP = 0.72
/** 山丘的口子：石头缝前面要有这么宽（格）的草地才摆 */
const KOPJE_FRONT_U = 0.9
/** 兽道：每走一步多远（格），最多拐多少（弧度） */
const TRAIL_STEP_U = 0.5
const TRAIL_TURN = 0.22

/** 一块圆的东西：中心、半径（格）与多高（米） */
export interface Lump {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly h: number
}

/** 金合欢：树干在 (x, y)，树冠半径 crown（格）、多高 h（米），树冠的中心偏开树干 (ox, oy) 格 */
export interface Acacia extends Lump {
  readonly crown: number
  readonly ox: number
  readonly oy: number
}

/** 草地的边：方框正中那块 half 格半宽的方地往里收的量按角度起伏，sin 的振幅、圈数与相位 */
export interface EdgeShape {
  readonly half: number
  readonly inset: number
  readonly waves: readonly { readonly amp: number; readonly k: number; readonly phase: number }[]
}

/** 水坑：中心、平均半径（格），按几道余弦扭成不圆的一汪 */
export interface Pond {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly lobes: readonly { readonly amp: number; readonly k: number; readonly phase: number }[]
}

/** 山丘：占着朝 dir（弧度，从草地往外）那一边，前排挡着草地的石头与后面堆成丘的石头 */
export interface Kopje {
  readonly dir: number
  readonly front: readonly Lump[]
  readonly back: readonly Lump[]
}

/**
 * 一局的水坑，格：开局站位在方框正中；草地的边、山丘、水坑、蚁丘、金合欢与枯树；
 * field 是草地的边以内（只算深草丛与山丘），basin 是真能走的地面（再挖掉水和障碍）；兽道、出怪的地标与风
 */
export interface SavannaPlan {
  readonly seed: number
  readonly start: Point
  readonly edge: EdgeShape
  readonly kopje: Kopje
  readonly pond: Pond
  readonly mounds: readonly Lump[]
  readonly acacias: readonly Acacia[]
  readonly snags: readonly Lump[]
  readonly field: Basin
  readonly basin: Basin
  readonly trails: readonly (readonly Point[])[]
  readonly marks: Readonly<Record<string, readonly Landmark[]>>
  readonly wind: Point
}

const between = (rng: Rng, r: readonly [number, number]): number => r[0] + rng.next() * (r[1] - r[0])

/** 草地的边在 ang 方向上离开局站位多远，格 */
export function edgeRadius(e: EdgeShape, ang: number): number {
  const c = Math.abs(Math.cos(ang))
  const s = Math.abs(Math.sin(ang))
  let r = e.half / Math.pow(c ** SQUARE_P + s ** SQUARE_P, 1 / SQUARE_P) - e.inset
  for (const w of e.waves) r -= w.amp * Math.sin(w.k * ang + w.phase)
  return r
}

/** 水坑的岸在 ang 方向上离坑心多远，格 */
export function pondRadius(p: Pond, ang: number): number {
  let k = 1
  for (const l of p.lobes) k += l.amp * Math.cos(l.k * ang + l.phase)
  return p.r * k
}

/** (x, y) 格离水坑的岸多远，格，水里为负；按顺着坑心的方向量，离岸近时够准 */
export function pondGap(p: Pond, x: number, y: number): number {
  const dx = x - p.x
  const dy = y - p.y
  return Math.hypot(dx, dy) - pondRadius(p, Math.atan2(dy, dx))
}

/** (x, y) 格离一串圆最近的边多远，格，圆里为负 */
export function lumpGap(list: readonly Lump[], x: number, y: number): number {
  let d = Infinity
  for (const l of list) d = Math.min(d, Math.hypot(x - l.x, y - l.y) - l.r)
  return d
}

/** 角度差，落在 (−π, π] */
function angDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b))
}

/** 山丘：沿边铺一排挡着草地的石头，越靠中间往草地里伸得越深；后面再堆两排更大的，堆成丘 */
function makeKopje(cfg: SavannaConfig, rng: Rng, e: EdgeShape, start: Point): Kopje {
  const k = cfg.kopje
  const dir = (Math.floor(rng.next() * 4) * Math.PI) / 2 + (rng.next() * 2 - 1) * 0.3
  const span = between(rng, k.spanU)
  const reach = between(rng, k.reachU)
  const r0 = edgeRadius(e, dir)
  const half = span / 2 / r0
  const front: Lump[] = []
  const back: Lump[] = []
  let a = dir - half
  while (a <= dir + half) {
    const t = (a - (dir - half)) / (2 * half)
    const bell = Math.pow(Math.sin(Math.PI * t), 0.7)
    const r = between(rng, k.boulderU) * (0.65 + 0.35 * bell)
    const depth = reach * bell + r * 0.15
    const er = edgeRadius(e, a)
    const at = er - depth + r
    front.push({ x: start.x + Math.cos(a) * at, y: start.y + Math.sin(a) * at, r, h: between(rng, k.heightM) * (0.6 + 0.4 * bell) })
    for (let row = 1; row <= 2; row++) {
      const rb = between(rng, k.boulderU) * (1 + 0.25 * row) * (0.6 + 0.4 * bell)
      const ab = a + ((rng.next() * 2 - 1) * 0.6 * r) / er
      const db = at + r * 0.4 + rb * (0.55 + row * 0.75)
      back.push({ x: start.x + Math.cos(ab) * db, y: start.y + Math.sin(ab) * db, r: rb, h: between(rng, k.heightM) * (1 + 0.35 * row) * (0.55 + 0.45 * bell) })
    }
    const next = between(rng, k.boulderU) * (0.65 + 0.35 * bell)
    a += ((r + next) * BOULDER_OVERLAP) / Math.max(1, er - depth)
  }
  return { dir, front, back }
}

/** 一条兽道：从水边往外，慢慢拐着走到草地的边上 */
function trailFrom(rng: Rng, field: Basin, p: Pond, ang: number): Point[] {
  const r = pondRadius(p, ang)
  let x = p.x + Math.cos(ang) * r
  let y = p.y + Math.sin(ang) * r
  let heading = ang
  let turn = 0
  const pts: Point[] = [{ x, y }]
  for (let i = 0; i < 120; i++) {
    turn = turn * 0.8 + (rng.next() * 2 - 1) * TRAIL_TURN
    heading += turn * 0.5
    x += Math.cos(heading) * TRAIL_STEP_U
    y += Math.sin(heading) * TRAIL_STEP_U
    pts.push({ x, y })
    if (roomAt(field, x * UNIT, y * UNIT) < -0.8 * UNIT) break
  }
  return pts
}

/** 草地上随处挑一点：离边至少 room 格，离开局站位、水坑与已有的障碍够远 */
function pick(rng: Rng, field: Basin, start: Point, half: number, ok: (x: number, y: number) => boolean): Point | null {
  for (let i = 0; i < 200; i++) {
    const x = start.x + (rng.next() * 2 - 1) * half
    const y = start.y + (rng.next() * 2 - 1) * half
    if (ok(x, y) && roomAt(field, x * UNIT, y * UNIT) > 0) return { x, y }
  }
  return null
}

let last: { cfg: SavannaConfig; seed: number; plan: SavannaPlan } | null = null

/**
 * 这一局的水坑，按种子定下：草地是方框正中一块四角圆钝的方地，边按噪声弯；一边是山丘，前排的石头挡着草地，后面的堆成丘；
 * 水坑在开局站位旁边几格，四周留得出兽群绕着走的地方；蚁丘、金合欢与枯树散在草地上，离开局站位、水坑与彼此都隔开；
 * 从水边往外踩出几条兽道。面积不对就换一组随机数
 */
export function savannaPlan(cfg: SavannaConfig, seed: number): SavannaPlan {
  if (last && last.cfg === cfg && last.seed === seed) return last.plan
  const rng = new Rng(seed)
  let plan: SavannaPlan | null = null
  for (let t = 0; t < TRIES && !plan; t++) plan = attempt(cfg, rng, seed, t === TRIES - 1)
  last = { cfg, seed, plan: plan! }
  return plan!
}

function attempt(cfg: SavannaConfig, rng: Rng, seed: number, force: boolean): SavannaPlan | null {
  const start = { x: FRAME_U / 2, y: FRAME_U / 2 }
  const ec = cfg.edge
  const waves: { amp: number; k: number; phase: number }[] = []
  for (let k = 0; k < 3; k++) waves.push({ amp: (ec.bendU / (k + 1)) * (0.5 + 0.5 * rng.next()), k: Math.max(1, Math.round(ec.waves * (k + 1) * (0.6 + 0.3 * rng.next()))), phase: rng.next() * Math.PI * 2 })
  const edge: EdgeShape = { half: cfg.sizeU / 2, inset: between(rng, ec.insetU), waves }
  const kopje = makeKopje(cfg, rng, edge, start)
  const inEdge = (x: number, y: number): boolean => Math.hypot(x - start.x, y - start.y) < edgeRadius(edge, Math.atan2(y - start.y, x - start.x)) && lumpGap(kopje.front, x, y) > 0 && lumpGap(kopje.back, x, y) > 0
  const side = Math.ceil((FRAME_U - 2) / BASIN_CELL_U)
  const b0 = (FRAME_U - side * BASIN_CELL_U) / 2
  const cell = BASIN_CELL_U * UNIT
  const neck = cfg.neckU * UNIT
  const keep = { x: start.x * UNIT, y: start.y * UNIT }
  const field = makeBasin((x, y) => inEdge(x / UNIT, y / UNIT), b0 * UNIT, b0 * UNIT, side, side, cell, keep, neck)

  // 水坑：离开局站位 offU 格，四周留得出吃草的一圈
  const pc = cfg.pond
  let pond: Pond | null = null
  for (let i = 0; i < 60 && !pond; i++) {
    const a = rng.next() * Math.PI * 2
    const off = between(rng, pc.offU)
    const r = between(rng, pc.radiusU)
    const x = start.x + Math.cos(a) * off
    const y = start.y + Math.sin(a) * off
    if (roomAt(field, x * UNIT, y * UNIT) < (r * (1 + pc.wobble) + pc.shoreU + cfg.herd.homeU[0]) * UNIT) continue
    const lobes = [2, 3, 5].map((k, j) => ({ amp: pc.wobble * [0.6, 0.35, 0.15][j]! * (0.6 + 0.4 * rng.next()), k, phase: rng.next() * Math.PI * 2 }))
    pond = { x, y, r, lobes }
  }
  if (!pond) return null
  const water = pond
  const wet = pc.shoreU + pc.flatU

  const placed: Lump[] = []
  const free = (x: number, y: number, r: number, room: number): boolean =>
    Math.hypot(x - start.x, y - start.y) > cfg.clearU + r &&
    pondGap(water, x, y) > wet + r + 0.5 &&
    roomAt(field, x * UNIT, y * UNIT) > (r + room) * UNIT &&
    placed.every((o) => Math.hypot(x - o.x, y - o.y) > o.r + r + cfg.gapU)
  const half = cfg.sizeU / 2
  const mounds: Lump[] = []
  for (let i = rng.int(cfg.mounds.count[0], cfg.mounds.count[1]); i > 0; i--) {
    const r = between(rng, cfg.mounds.radiusU)
    const p = pick(rng, field, start, half, (x, y) => free(x, y, r, 2))
    if (!p) continue
    const m = { x: p.x, y: p.y, r, h: between(rng, cfg.mounds.heightM) }
    mounds.push(m)
    placed.push(m)
  }
  const snags: Lump[] = []
  for (let i = rng.int(cfg.snags.count[0], cfg.snags.count[1]); i > 0; i--) {
    const r = cfg.snags.trunkU
    const p = pick(rng, field, start, half, (x, y) => free(x, y, 1.2, 2))
    if (!p) continue
    const s = { x: p.x, y: p.y, r, h: between(rng, cfg.snags.heightM) }
    snags.push(s)
    placed.push({ ...s, r: 1.2 })
  }
  const acacias: Acacia[] = []
  for (let i = rng.int(cfg.acacias.count[0], cfg.acacias.count[1]); i > 0; i--) {
    const crown = between(rng, cfg.acacias.crownU)
    const p = pick(rng, field, start, half, (x, y) => free(x, y, 1, 0.6))
    if (!p) continue
    const lean = rng.next() * Math.PI * 2
    const ol = crown * 0.25 * rng.next()
    acacias.push({ x: p.x, y: p.y, r: cfg.acacias.trunkU, h: between(rng, cfg.acacias.heightM), crown, ox: Math.cos(lean) * ol, oy: Math.sin(lean) * ol })
    placed.push({ x: p.x, y: p.y, r: 1, h: 0 })
  }

  const solid = (x: number, y: number): boolean => pondGap(water, x, y) < 0 || lumpGap(mounds, x, y) < 0 || lumpGap(snags, x, y) < 0 || lumpGap(acacias, x, y) < 0
  const basin = makeBasin((x, y) => inEdge(x / UNIT, y / UNIT) && !solid(x / UNIT, y / UNIT), b0 * UNIT, b0 * UNIT, side, side, cell, keep, neck)
  let open = 0
  for (const v of basin.room) if (v > 0) open++
  const area = open * BASIN_CELL_U * BASIN_CELL_U
  if (!force && (area < cfg.areaU2[0] || area > cfg.areaU2[1])) return null

  const trails: Point[][] = []
  const nt = rng.int(3, 5)
  const a0 = rng.next() * Math.PI * 2
  for (let i = 0; i < nt; i++) trails.push(trailFrom(rng, field, water, a0 + ((i + rng.next() * 0.5) / nt) * Math.PI * 2))

  const wind = rng.next() * Math.PI * 2
  return { seed, start, edge, kopje, pond: water, mounds, acacias, snags, field, basin, trails, marks: { kopje: kopjeMarks(kopje, basin) }, wind: { x: Math.cos(wind), y: Math.sin(wind) } }
}

/** 山丘的口子，像素：前排相邻两块石头的缝前面，朝草地里；缝前空得开才摆 */
function kopjeMarks(k: Kopje, basin: Basin): Landmark[] {
  const out: Landmark[] = []
  for (let i = 1; i < k.front.length; i++) {
    const a = k.front[i - 1]!
    const b = k.front[i]!
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const ang = k.dir + Math.PI
    let nx = Math.cos(ang)
    let ny = Math.sin(ang)
    // 缝的法向朝草地：沿着两块石头连线的垂线，挑朝外法向反着的那一侧
    const tx = b.x - a.x
    const ty = b.y - a.y
    const tl = Math.hypot(tx, ty) || 1
    const px = -ty / tl
    const py = tx / tl
    if (px * nx + py * ny > 0) {
      nx = px
      ny = py
    } else {
      nx = -px
      ny = -py
    }
    for (let s = 0; s < 6; s += 0.25) {
      const x = mx + nx * s
      const y = my + ny * s
      if (roomAt(basin, x * UNIT, y * UNIT) < 0.3 * UNIT) continue
      if (roomAt(basin, (x + nx * KOPJE_FRONT_U) * UNIT, (y + ny * KOPJE_FRONT_U) * UNIT) < 0.5 * UNIT) break
      if (out.every((o) => Math.hypot(o.x - x * UNIT, o.y - y * UNIT) > 1.5 * UNIT)) out.push({ x: x * UNIT, y: y * UNIT, r: 0, nx, ny })
      break
    }
  }
  return out
}

/** 开局站位到 (x, y) 的方向是不是朝着山丘那一边（差在 half 弧度以内） */
export function towardKopje(plan: SavannaPlan, x: number, y: number, half: number): boolean {
  return Math.abs(angDiff(Math.atan2(y - plan.start.y, x - plan.start.x), plan.kopje.dir)) < half
}
