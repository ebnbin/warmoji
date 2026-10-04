import { UNIT } from '../../util/units.ts'
import { fbm } from '../../util/noise.ts'
import { Rng } from '../../util/rng.ts'
import { makeBasin } from '../worlds/basin.ts'
import { at, crestOf, hermite, hydraulics, makeReach, project, reachGround, resample } from './channel.ts'
import type { Basin } from '../worlds/basin'
import type { Along, Heights, Reach } from './channel'
import type { SakuraConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

const DEG = Math.PI / 180
/** 地形铺到地图外多远，格：镜头边距再加设备安全区 */
export const TERRAIN_PAD_U = 6
/** 能走的地面按这么细的格子算距离场，格 */
const BASIN_CELL_U = 0.25
/** 身子离墙身、林缘至少这么远（格）：不贴进墙里、林子里 */
const WALL_CLEAR_U = 0.12
const EDGE_CLEAR_U = 0.15
/** 几条林缘交汇的内角按这么大（格）磨圆 */
const CORNER_U = 2.5
/** 溪的中线两头伸出地图这么远（格）：伸出镜头看得到的范围 */
const REACH_OUT_U = TERRAIN_PAD_U + 3
/** 石组以上的溪水比石组下高这么多米：石缝把水憋起一点 */
const UPSTREAM_HEAD_M = 0.12
/** 主溪在石槛下游再多画这么长（格）：槛下两岸的坡接得上 */
const PAST_SILL_U = 2
/** 石组那条线：石头的圆心往上游让出半径的这么多倍；能走的地面停在线下游这么远（格）的地方 */
const ROCK_BACK = 0.6
export const ROCK_FACE_U = 0.35
/** 能走的地面停在石槛顶上游边往下游这么远（格）的地方：竹栅立在槛顶正中 */
const FENCE_FACE_U = 0.05
/** 石组与竹栅那条线从溪中线往两边伸到岸上这么远（格，水面半宽之外） */
const SPAN_PAST_BANK_U = 0.9
/** 林缘在溪穿过的两处按石组与竹栅那条线走：线两头再往外这么远（格）以内全按线，再往外这么宽（格）慢慢回到原来的林缘 */
const CUT_PAD_U = 0.4
const CUT_BLEND_U = 3
/** 槛顶平的那一段多长，格 */
export const CREST_U = 0.35
/** 路面半宽，格 */
export const PATH_HALF_U = 0.55
/** 寺墙两头伸进林子这么远（格）：墙头藏在树下 */
const WALL_INTO_FOREST_U = 2.5
/** 林缘按这么细的格子（格）找出那条线上的一处处 */
const RIM_STEP_U = 0.5
/** 画出来的树冠的边大约在半径的这么多倍处：外圈的花团鼓出一圈参差 */
const CROWN_EDGE = 0.9
/** 林缘上每一处都有树冠的边探出林缘至少这么远（格），盖过能走的地面的边 */
const RIM_MARGIN_U = 0.3
/** 林缘上的樱花树心至少隔开两半径之和的这么多倍：挨得很紧，树冠叠成一道 */
const RIM_OVERLAP = 0.35
/** 生成不出合格的地图就换一组随机数重来，最多这么多次 */
const TRIES = 120
/** 槛下比槛顶低过这么多（米）的格子，水一流进去就落下去了 */
export const SINK_M = 0.5

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const len = (x: number, y: number): number => Math.sqrt(x * x + y * y)
/** 多项式平滑取小：两者相差 k 以内时圆滑过渡 */
function smin(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k)
  return b + (a - b) * h - k * h * (1 - h)
}
const smax = (a: number, b: number, k: number): number => -smin(-a, -b, k)

/** 分形噪声拉开到 [−1, 1]：它大多挤在中间 */
function swing(x: number, y: number, seed: number, octaves: number): number {
  return Math.max(-1, Math.min(1, (fbm(x, y, seed, octaves) - 0.5) * 2.6))
}

/** 种子打散：相邻的种子也生成很不一样的地图 */
function scramble(seed: number): number {
  let h = Math.imul((seed ^ 0x2c1b3c6d) >>> 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

function between(rng: Rng, r: readonly [number, number]): number {
  return r[0] + (r[1] - r[0]) * rng.next()
}

/** 本地坐标：a 从寺墙那条地图边往地图里量，b 顺着那条边量，都以格计、在 [0, size] 里。地图坐标 = o + a·n + b·t */
export interface Frame {
  readonly ox: number
  readonly oy: number
  readonly nx: number
  readonly ny: number
  readonly tx: number
  readonly ty: number
}

export interface Local {
  a: number
  b: number
}

/** 寺墙在地图的哪条边（上、右、下、左）：朝地图里的法线与那条边的中点（占边长的比例） */
const NORMALS: readonly Point[] = [
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
  { x: 1, y: 0 },
]
const MIDS: readonly Point[] = [
  { x: 0.5, y: 0 },
  { x: 1, y: 0.5 },
  { x: 0.5, y: 1 },
  { x: 0, y: 0.5 },
]

function frameOf(side: number, mirror: boolean, size: number): Frame {
  const n = NORMALS[side]!
  const t = mirror ? { x: n.y, y: -n.x } : { x: -n.y, y: n.x }
  const m = MIDS[side]!
  return { ox: m.x * size - (size / 2) * t.x, oy: m.y * size - (size / 2) * t.y, nx: n.x, ny: n.y, tx: t.x, ty: t.y }
}

export function toLocal(f: Frame, x: number, y: number, out: Local): Local {
  const dx = x - f.ox
  const dy = y - f.oy
  out.a = dx * f.nx + dy * f.ny
  out.b = dx * f.tx + dy * f.ty
  return out
}

export function toMap(f: Frame, a: number, b: number): Point {
  return { x: f.ox + f.nx * a + f.tx * b, y: f.oy + f.ny * a + f.ty * b }
}

/** 本地的方向换成地图上的方向 */
function dirToMap(f: Frame, da: number, db: number): Point {
  return { x: f.nx * da + f.tx * db, y: f.ny * da + f.ty * db }
}

/** 地图上的方向换成本地的方向 */
function dirToLocal(f: Frame, dx: number, dy: number): Local {
  return { a: dx * f.nx + dy * f.ny, b: dx * f.tx + dy * f.ty }
}

/** 林缘上的一处林舌（正，伸进空地）或草湾（负）：第 k 条林缘（1 low、2 far、3 high）在 at 处探出 amp 格，宽约 width 格 */
export interface Lobe {
  readonly k: number
  readonly at: number
  readonly amp: number
  readonly width: number
}

/** 溪穿过林缘的地方，本地坐标：石组或竹栅那条线的中点、顺水的单位方向、林子在线的哪边（1 顺水往下那边，−1 上游那边）、线的半长（格） */
export interface Cut {
  readonly a: number
  readonly b: number
  readonly ua: number
  readonly ub: number
  readonly side: number
  readonly half: number
}

/**
 * 樱庭的边，本地坐标，格。寺墙在 a 小的一边，墙身中线几乎是直的：整条斜 skew（斜率）、过了 kinkAt 再拐 kink（斜率），从 b = from 砌到 b = to，两头伸进林子；
 * 另外三面（b 小的 low、a 大的 far、b 大的 high）是樱林，林缘按噪声弯，再叠上几处林舌与草湾；溪穿过林缘的两处，林缘按石组与竹栅那条线走
 */
export interface Edges {
  readonly size: number
  readonly seed: number
  readonly wall: { readonly inset: number; readonly skew: number; readonly kinkAt: number; readonly kink: number; readonly from: number; readonly to: number }
  readonly forest: { readonly low: number; readonly far: number; readonly high: number; readonly bend: number; readonly wave: number; readonly scallop: number }
  readonly lobes: readonly Lobe[]
  readonly cuts: readonly Cut[]
}

/** 墙身中线在 b 处离寺墙那条地图边多远，格 */
export function wallA(e: Edges, b: number): number {
  const w = e.wall
  return w.inset + w.skew * (b - e.size / 2) + w.kink * Math.max(0, b - w.kinkAt)
}

/** 在墙身中线的哪一侧、离它多远（格，空地那边为正，按 a 量）；墙两头以外没有墙 */
export function wallSide(e: Edges, a: number, b: number): number {
  return b < e.wall.from || b > e.wall.to ? Infinity : a - wallA(e, b)
}

/** 第 k 条林缘在 u 处往空地这边让出多少，格：大弯、一棵棵树冠排出的参差、林舌与草湾 */
function wiggle(e: Edges, u: number, k: number): number {
  const f = e.forest
  let s = f.bend * swing(u / f.wave + k * 7.1, k * 3.3, e.seed + 31 * k, 3) + f.scallop * swing(u / 2.2 + k * 1.7, 5.5, e.seed + 31 * k + 9, 2)
  for (const p of e.lobes) if (p.k === k) s += p.amp * Math.exp(-(((u - p.at) / p.width) ** 2))
  return s
}

/** 进林子多深，格，林子里为正：几条林缘交汇的内角磨圆；溪穿过的两处按石组与竹栅那条线 */
export function forestDepth(e: Edges, a: number, b: number): number {
  const S = e.size
  const f = e.forest
  let d = smax(f.low + wiggle(e, a, 1) - b, a - (S - f.far - wiggle(e, b, 2)), CORNER_U)
  d = smax(d, b - (S - f.high - wiggle(e, a, 3)), CORNER_U)
  for (const c of e.cuts) {
    const da = a - c.a
    const db = b - c.b
    const r = len(da, db)
    if (r >= c.half + CUT_BLEND_U) continue
    d += ((da * c.ua + db * c.ub) * c.side - d) * smooth(c.half + CUT_BLEND_U, c.half, r)
  }
  return d
}

/** 墙身的一段：中线从 a 到 b（格），朝空地那边的单位法线，长 */
export interface Wall {
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
  readonly nx: number
  readonly ny: number
  readonly len: number
}

/** 离墙身中线（几段折线）最近多远（格），顺带记下是哪一段、在墙的哪一侧（空地那边为正） */
export function wallDist(walls: readonly Wall[], x: number, y: number, out: { k: number; side: number }): number {
  let best = Infinity
  for (let k = 0; k < walls.length; k++) {
    const w = walls[k]!
    const ex = w.bx - w.ax
    const ey = w.by - w.ay
    const t = clamp01(((x - w.ax) * ex + (y - w.ay) * ey) / (w.len * w.len))
    const d = len(x - w.ax - ex * t, y - w.ay - ey * t)
    if (d < best) {
      best = d
      out.k = k
      out.side = (x - w.ax) * w.nx + (y - w.ay) * w.ny
    }
  }
  return best
}

/** 院门：门的中点（墙身中线上）、顺着墙的单位方向、朝空地的单位法线、半宽（格） */
export interface Gate {
  readonly x: number
  readonly y: number
  readonly ux: number
  readonly uy: number
  readonly nx: number
  readonly ny: number
  readonly half: number
}

/** 石槛：槛顶上游边的中点、顺水的单位方向、水面半宽（格）、槛顶高程与槛前的设计水位（米）、它在主溪上的弧长（格） */
export interface Weir {
  readonly x: number
  readonly y: number
  readonly tx: number
  readonly ty: number
  readonly half: number
  readonly crest: number
  readonly level: number
  readonly s: number
}

/** 一块石头：圆心与半径（格） */
export interface Rock {
  readonly x: number
  readonly y: number
  readonly r: number
}

/** 上游的石组：那条线的中点（主溪的起点）、顺水的单位方向、那里的水面半宽、整排从溪中线往两边伸多远（格）、露出水面的石顶高程（米），一块块石头 */
export interface Rocks {
  readonly x: number
  readonly y: number
  readonly tx: number
  readonly ty: number
  readonly half: number
  readonly span: number
  readonly top: number
  readonly stones: readonly Rock[]
}

/** 竹栅：立在石槛顶正中的那条线，中点、顺水的单位方向、从溪中线往两边伸多远（格） */
export interface Fence {
  readonly x: number
  readonly y: number
  readonly tx: number
  readonly ty: number
  readonly span: number
}

/**
 * 木桥：桥心、顺着桥面横跨溪的单位方向；架在水上的那段从桥心到两岸岸顶的半长 span，连两头落地的坡道的半长 half，桥面半宽 width（格）；
 * 正中拱起多高、桥心处的水面高程（米）
 */
export interface Bridge {
  readonly x: number
  readonly y: number
  readonly ax: number
  readonly ay: number
  readonly span: number
  readonly half: number
  readonly width: number
  readonly rise: number
  readonly level: number
}

/** 一棵樱花：树冠的圆心、半径（格）与高（米）；inside 是种在空地上的那几棵，树冠往里 overhangU 格以内挡人 */
export interface Tree {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly h: number
  readonly inside: boolean
}

/**
 * 地形，格子 (0, 0) 的左上角在 (x0, y0) 格：高程（米）；画地面用的几张场：最近那段溪的设计水位（米）、离它水边多远（格，水里为负）、
 * 凸岸边滩有多显，离墙身中线多远（格，空地那边为正），进林子多深（格）
 */
export interface Terrain extends Heights {
  readonly level: Float32Array
  readonly edge: Float32Array
  readonly bar: Float32Array
  readonly wall: Float32Array
  readonly forest: Float32Array
}

/**
 * 按种子生成的樱庭，格与米：地图 w × h 格；本地坐标系与边（寺墙、樱林）、墙身的两段与院门；石组到石槛之间的主溪、石组以上与石槛以下伸出地图的两段；
 * 上游的石组、下游的石槛与竹栅、木桥；从院门到桥头的路；樱花；地形、能走的地面（像素）、开局时队伍站的地方；画画用的种子
 */
export interface SakuraPlan {
  readonly w: number
  readonly h: number
  readonly seed: number
  readonly frame: Frame
  readonly edges: Edges
  readonly walls: readonly Wall[]
  readonly gate: Gate
  readonly stream: Reach
  readonly upstream: Reach
  readonly downstream: Reach
  readonly rocks: Rocks
  readonly weir: Weir
  readonly fence: Fence
  readonly bridge: Bridge
  readonly path: readonly Point[]
  readonly trees: readonly Tree[]
  readonly terrain: Terrain
  readonly basin: Basin
  readonly start: Point
}

/** 石槛的本地坐标：along 顺水离槛顶上游边多远（槛下为正），side 离溪的中线多远（格） */
export function weirLocal(wr: Weir, x: number, y: number): { along: number; side: number } {
  const dx = x - wr.x
  const dy = y - wr.y
  return { along: dx * wr.tx + dy * wr.ty, side: Math.abs(dx * -wr.ty + dy * wr.tx) }
}

/** 石组的本地坐标：along 顺水离石组那条线多远（下游为正），side 离溪的中线多远（格） */
export function rocksLocal(rk: Rocks, x: number, y: number): { along: number; side: number } {
  const dx = x - rk.x
  const dy = y - rk.y
  return { along: dx * rk.tx + dy * rk.ty, side: Math.abs(dx * -rk.ty + dy * rk.tx) }
}

/** 桥的本地坐标：a 顺着桥面离桥心多远，t 横着桥面离桥心多远（格） */
export function bridgeLocal(b: Bridge, x: number, y: number): { a: number; t: number } {
  const dx = x - b.x
  const dy = y - b.y
  return { a: dx * b.ax + dy * b.ay, t: dx * -b.ay + dy * b.ax }
}

/** 桥面在顺着桥面 a 格处比两头落地处高多少（米）：架在水上那段拱成一道弧，坡道从岸顶缓缓落到地面 */
export function deckHeight(b: Bridge, a: number): number {
  const u = Math.abs(a)
  if (u >= b.half) return 0
  const top = b.rise * 0.45
  if (u >= b.span) return top * smooth(b.half, b.span, u)
  return top + (b.rise - top) * (1 - (u / b.span) ** 2)
}

/** 一串布尔里最长的一段连续 true：起止下标；没有就是 null */
function longestRun(ok: readonly boolean[]): { from: number; to: number } | null {
  let best: { from: number; to: number } | null = null
  let from = -1
  for (let i = 0; i <= ok.length; i++) {
    if (i < ok.length && ok[i]) {
      if (from < 0) from = i
      continue
    }
    if (from >= 0 && (!best || i - 1 - from > best.to - best.from)) best = { from, to: i - 1 }
    from = -1
  }
  return best
}

/** 点到折线的距离 */
export function polylineDist(pts: readonly Point[], x: number, y: number): number {
  let best = Infinity
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const ex = b.x - a.x
    const ey = b.y - a.y
    const t = clamp01(((x - a.x) * ex + (y - a.y) * ey) / (ex * ex + ey * ey || 1e-12))
    best = Math.min(best, len(x - a.x - ex * t, y - a.y - ey * t))
  }
  return best
}

/** 离溪的水边多远，格，水里为负 */
function waterEdge(r: Reach, x: number, y: number, tmp: Along): number {
  project(r, x, y, tmp)
  return Math.abs(tmp.n) - at(r.half, tmp)
}

/** 离桥面（连坡道）多远，格，桥面上为负 */
function bridgeDist(b: Bridge, x: number, y: number): number {
  const p = bridgeLocal(b, x, y)
  const da = Math.abs(p.a) - b.half
  const dt = Math.abs(p.t) - b.width
  return da > 0 && dt > 0 ? len(da, dt) : Math.max(da, dt)
}

/** 树按位置分桶，查附近有没有挨得太近的树 */
class Crowd {
  private readonly cells = new Map<number, Tree[]>()
  private readonly span: number
  constructor(span: number) {
    this.span = span
  }

  add(t: Tree): void {
    const k = (Math.floor(t.y / this.span) + 512) * 4096 + Math.floor(t.x / this.span) + 512
    let list = this.cells.get(k)
    if (!list) this.cells.set(k, (list = []))
    list.push(t)
  }

  /** (x, y) 有没有被哪棵树的树冠盖住：离树心不到半径的 cover 倍 */
  covered(x: number, y: number, cover: number): boolean {
    const cx = Math.floor(x / this.span)
    const cy = Math.floor(y / this.span)
    for (let j = -2; j <= 2; j++) {
      for (let i = -2; i <= 2; i++) {
        const list = this.cells.get((cy + j + 512) * 4096 + cx + i + 512)
        if (!list) continue
        for (const t of list) if (len(t.x - x, t.y - y) < t.r * cover) return true
      }
    }
    return false
  }

  /** 半径 r 的树冠放在 (x, y) 会不会和已有的挤得太紧：圆心距小过两半径之和的 overlap 倍 */
  crowded(x: number, y: number, r: number, overlap: number): boolean {
    const reach = Math.ceil((r + 3) / this.span)
    const cx = Math.floor(x / this.span)
    const cy = Math.floor(y / this.span)
    for (let j = -reach; j <= reach; j++) {
      for (let i = -reach; i <= reach; i++) {
        const list = this.cells.get((cy + j + 512) * 4096 + cx + i + 512)
        if (!list) continue
        for (const t of list) if (len(t.x - x, t.y - y) < (t.r + r) * overlap) return true
      }
    }
    return false
  }
}

/** 按种子定的边，还没有溪穿过的两处 */
function edgesOf(cfg: SakuraConfig, rng: Rng): Edges {
  const S = cfg.sizeU
  const fo = cfg.forest
  const wc = cfg.wall
  const sign = (): number => (rng.next() < 0.5 ? -1 : 1)
  const lobes: Lobe[] = []
  for (const k of [1, 2, 3]) {
    const n = Math.round(between(rng, fo.lobes))
    for (let i = 0, tries = 0; i < n && tries < 20; tries++) {
      const at = S * (0.18 + rng.next() * 0.64)
      const w = between(rng, fo.lobeWidthU)
      if (lobes.some((p) => p.k === k && Math.abs(p.at - at) < (p.width + w) * 1.6)) continue
      lobes.push({ k, at, amp: sign() * between(rng, fo.lobeU), width: w })
      i++
    }
  }
  const e: Edges = {
    size: S,
    seed: Math.floor(rng.next() * 0x7fffffff),
    wall: {
      inset: between(rng, wc.insetU),
      skew: Math.tan(sign() * rng.next() * wc.skewDeg * DEG),
      kinkAt: S * (0.3 + rng.next() * 0.4),
      kink: Math.tan(sign() * rng.next() * wc.kinkDeg * DEG),
      from: -Infinity,
      to: Infinity,
    },
    forest: { low: between(rng, fo.insetU), far: between(rng, fo.insetU), high: between(rng, fo.insetU), bend: fo.bendU * (0.6 + rng.next() * 0.6), wave: fo.waveU, scallop: fo.scallopU },
    lobes,
    cuts: [],
  }
  // 墙两头伸进 low 与 high 两边的林子
  const from = e.forest.low + wiggle(e, wallA(e, 0), 1) - WALL_INTO_FOREST_U
  const to = S - e.forest.high - wiggle(e, wallA(e, S), 3) + WALL_INTO_FOREST_U
  return { ...e, wall: { ...e.wall, from, to } }
}

/** 墙身中线的两段（拐点前后），从 from 砌到 to；法线朝空地 */
function wallsOf(f: Frame, e: Edges): Wall[] {
  const w = e.wall
  const kb = Math.min(w.to - 0.5, Math.max(w.from + 0.5, w.kinkAt))
  const pts = [w.from, kb, w.to].map((b) => toMap(f, wallA(e, b), b))
  return [0, 1].map((k) => {
    const a = pts[k]!
    const b = pts[k + 1]!
    const l = len(b.x - a.x, b.y - a.y)
    let nx = -(b.y - a.y) / l
    let ny = (b.x - a.x) / l
    if (nx * f.nx + ny * f.ny < 0) {
      nx = -nx
      ny = -ny
    }
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y, nx, ny, len: l }
  })
}

/** 一条折线：点与走过的弧长 */
interface Line {
  readonly pts: Point[]
  readonly s: number[]
}

function lineOf(pts: Point[]): Line {
  const s = [0]
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1]! + len(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y))
  return { pts, s }
}

/** 折线上弧长 q 处的点 */
function pointAt(l: Line, q: number): Point {
  let i = 0
  while (i < l.s.length - 2 && l.s[i + 1]! < q) i++
  const t = clamp01((q - l.s[i]!) / Math.max(1e-9, l.s[i + 1]! - l.s[i]!))
  const a = l.pts[i]!
  const b = l.pts[i + 1]!
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** 折线上弧长 s0 到 s1 的那一段 */
function slice(l: Line, s0: number, s1: number): Point[] {
  const out = [pointAt(l, s0)]
  for (let i = 0; i < l.pts.length; i++) if (l.s[i]! > s0 + 0.05 && l.s[i]! < s1 - 0.05) out.push(l.pts[i]!)
  out.push(pointAt(l, s1))
  return out
}

/** 一段中线合格：弯道不急过 minBend 倍水面宽 */
function gentle(cfg: SakuraConfig, r: Reach): boolean {
  for (let i = 0; i < r.x.length; i++) if (Math.abs(r.curv[i]!) * r.half[i]! * 2 * cfg.stream.minBend > 1) return false
  return true
}

/** 过一串控制点的光滑曲线（向心 Catmull–Rom），约每 step 格一点 */
function spline(ctrl: readonly Point[], step: number): Point[] {
  const out: Point[] = []
  const n = ctrl.length
  for (let i = 0; i + 1 < n; i++) {
    const p0 = ctrl[Math.max(0, i - 1)]!
    const p1 = ctrl[i]!
    const p2 = ctrl[i + 1]!
    const p3 = ctrl[Math.min(n - 1, i + 2)]!
    const t1 = Math.sqrt(len(p1.x - p0.x, p1.y - p0.y)) || 1e-3
    const t2 = t1 + (Math.sqrt(len(p2.x - p1.x, p2.y - p1.y)) || 1e-3)
    const t3 = t2 + (Math.sqrt(len(p3.x - p2.x, p3.y - p2.y)) || 1e-3)
    const m = Math.max(2, Math.ceil(len(p2.x - p1.x, p2.y - p1.y) / step))
    for (let k = 0; k < m; k++) {
      const t = t1 + ((t2 - t1) * k) / m
      const mix = (a: Point, b: Point, ta: number, tb: number): Point => {
        const u = tb - ta || 1e-3
        return { x: (a.x * (tb - t) + b.x * (t - ta)) / u, y: (a.y * (tb - t) + b.y * (t - ta)) / u }
      }
      const a1 = mix(p0, p1, 0, t1)
      const a2 = mix(p1, p2, t1, t2)
      const a3 = mix(p2, p3, t2, t3)
      const b1 = mix(a1, a2, 0, t2)
      const b2 = mix(a2, a3, t1, t3)
      out.push(mix(b1, b2, t1, t2))
    }
  }
  out.push(ctrl[n - 1]!)
  return out
}

/** 溪的中线与它进出林缘的两处（弧长，格） */
interface Course {
  readonly line: Line
  readonly sIn: number
  readonly sOut: number
}

/**
 * 溪的中线：先在三面林缘里挑两面，各取一处溪穿过林缘的地方（侧边的离寺墙够远，都离林子的拐角够远），两处连线够长、走向离横竖方向至少 slantDeg 度；
 * 中线是过这两处的光滑曲线，两头顺着连线（各再偏一点）伸出地图外，中间过两个往旁边偏开最多 meanderU 的点，弯成一道或两道缓弯。
 * 再按真的林缘找出进林缘、出林缘的两处：整条离寺墙够远，两处之间不碰林子、弯得不急，进出林子时不顺着林缘擦过去，整段的走向仍是斜的，
 * 石槛下游在地图里留出落水的地方；不合格就把弯放缓再试，还不行就是 null
 */
function courseOf(cfg: SakuraConfig, rng: Rng, f: Frame, e: Edges): Course | null {
  const st = cfg.stream
  const S = e.size
  const fo = e.forest
  const half = hydraulics(cfg, cfg.flow.discharge).half * 1.15
  const bank = cfg.flow.bankU
  const aMin = Math.max(wallA(e, 0), wallA(e, S)) + half + bank + st.wallGapU + 2
  const onSide = (k: number): Local & { k: number } => {
    if (k === 2) return { k, a: S - fo.far, b: fo.low + 6 + rng.next() * Math.max(0, S - fo.high - fo.low - 12) }
    return { k, a: aMin + rng.next() * Math.max(0, S - fo.far - 6 - aMin), b: k === 1 ? fo.low : S - fo.high }
  }
  // 先挑两处：连线够长、走向够斜
  let pa: (Local & { k: number }) | null = null
  let pb: Local & { k: number } = { k: 0, a: 0, b: 0 }
  for (let k = 0; k < 24 && !pa; k++) {
    const pair = [
      [1, 2],
      [2, 3],
      [1, 3],
    ][Math.floor(rng.next() * 3)]!
    const u = onSide(pair[0]!)
    const v = onSide(pair[1]!)
    const tilt = Math.atan2(Math.abs(v.b - u.b), Math.abs(v.a - u.a))
    if (len(v.a - u.a, v.b - u.b) < 0.62 * S || Math.min(tilt, Math.PI / 2 - tilt) < st.slantDeg * DEG) continue
    ;[pa, pb] = rng.next() < 0.5 ? [u, v] : [v, u]
  }
  if (!pa) return null
  const ca = pb.a - pa.a
  const cb = pb.b - pa.b
  const cl = len(ca, cb)
  const da = ca / cl
  const db = cb / cl
  // 两头伸出地图：顺着连线往那条林缘的外面拐一半，各再偏一点
  const turned = (o: Local & { k: number }, sign: number): Point => {
    const oa = o.k === 2 ? 1 : 0
    const ob = o.k === 1 ? -1 : o.k === 3 ? 1 : 0
    const ma = da * sign + oa
    const mb = db * sign + ob
    const ml = len(ma, mb) || 1
    const t = (rng.next() * 2 - 1) * st.turnDeg * DEG
    const ua = (ma * Math.cos(t) - mb * Math.sin(t)) / ml
    const ub = (ma * Math.sin(t) + mb * Math.cos(t)) / ml
    let k = 0
    for (;;) {
      const a = o.a + ua * k
      const b = o.b + ub * k
      if (a < -REACH_OUT_U || a > S + REACH_OUT_U || b < -REACH_OUT_U || b > S + REACH_OUT_U) return toMap(f, a, b)
      k += 0.25
    }
  }
  const p0 = turned(pa, -1)
  const p1 = turned(pb, 1)
  const A = toMap(f, pa.a, pa.b)
  const B = toMap(f, pb.a, pb.b)
  // 中间两个点往旁边偏开：同向是一道弯，反向是两道
  const nrm = dirToMap(f, -db, da)
  const o1 = (rng.next() < 0.5 ? -1 : 1) * (0.5 + 0.5 * rng.next()) * st.meanderU
  const o2 = (rng.next() < 0.5 ? -1 : 1) * (0.5 + 0.5 * rng.next()) * st.meanderU
  const f1 = 0.3 + 0.08 * rng.next()
  const f2 = 0.62 + 0.08 * rng.next()
  const L: Local = { a: 0, b: 0 }
  const walls = wallsOf(f, e)
  const WD = { k: 0, side: 0 }
  for (const m of [1, 0.6, 0.3, 0]) {
    const via = (fr: number, o: number): Point => ({ x: A.x + (B.x - A.x) * fr + nrm.x * o * m, y: A.y + (B.y - A.y) * fr + nrm.y * o * m })
    const line = lineOf(spline([p0, A, via(f1, o1), via(f2, o2), B, p1], 0.1))
    const n = line.pts.length
    const depth: number[] = []
    let near = false
    for (const p of line.pts) {
      toLocal(f, p.x, p.y, L)
      depth.push(forestDepth(e, L.a, L.b))
      if (wallDist(walls, p.x, p.y, WD) < half + bank + st.wallGapU) near = true
    }
    if (near) continue
    const first = depth.findIndex((d) => d < 0)
    let last = -1
    for (let i = n - 1; i >= 0; i--) {
      if (depth[i]! < 0) {
        last = i
        break
      }
    }
    if (first <= 0 || last >= n - 1 || last <= first) continue
    const sIn = line.s[first]!
    const sOut = line.s[last]!
    if (sOut - sIn < 0.6 * S) continue
    // 两处之间不碰林子，离开进出口几格以后离林缘远过岸
    let clear = true
    for (let i = first; i <= last && clear; i++) {
      const s = line.s[i]!
      if (s > sIn + 1.5 && s < sOut - 1.5 && depth[i]! > -0.3) clear = false
      if (s > sIn + 8 && s < sOut - 8 && depth[i]! > -(half + bank + 0.5)) clear = false
    }
    if (!clear) continue
    const g = resample(slice(line, sIn, sOut))
    if (g.curv.some((c) => Math.abs(c) * half * 2 * st.minBend > 1)) continue
    // 进出林子时离林缘的法线不超过 55 度
    const square = (i: number): boolean => {
      const p = line.pts[i]!
      const q = line.pts[Math.min(n - 1, i + 1)]!
      const o = line.pts[Math.max(0, i - 1)]!
      const d = dirToLocal(f, q.x - o.x, q.y - o.y)
      toLocal(f, p.x, p.y, L)
      const h = 0.05
      const ga = forestDepth(e, L.a + h, L.b) - forestDepth(e, L.a - h, L.b)
      const gb = forestDepth(e, L.a, L.b + h) - forestDepth(e, L.a, L.b - h)
      return Math.abs(d.a * ga + d.b * gb) >= Math.cos(55 * DEG) * len(d.a, d.b) * len(ga, gb)
    }
    if (!square(first) || !square(last)) continue
    // 整段的走向仍然斜着
    const pa = line.pts[first]!
    const pb = line.pts[last]!
    const chord = dirToLocal(f, pb.x - pa.x, pb.y - pa.y)
    const off = Math.atan2(Math.abs(chord.b), Math.abs(chord.a))
    if (Math.min(off, Math.PI / 2 - off) < st.slantDeg * 0.8 * DEG) continue
    // 石槛下游在地图里还有几格，水落得下去；石组也在地图里
    const inMap = (p: Point, m: number): boolean => p.x > m && p.y > m && p.x < S - m && p.y < S - m
    if (!inMap(pointAt(line, sOut + 2.5), 0.6) || !inMap(pointAt(line, sIn), 0.3)) continue
    return { line, sIn, sOut }
  }
  return null
}

/** 石槛：主溪上弧长 s 处横着溪砌一道，槛顶按临界流定（漫过槛顶的水把槛前的水面托在设计水位上） */
function weirAt(cfg: SakuraConfig, r: Reach, s: number): Weir {
  const n = r.x.length
  let i = 0
  while (i < n - 2 && r.s[i + 1]! < s) i++
  const t = (s - r.s[i]!) / (r.s[i + 1]! - r.s[i]!)
  const p: Along = { i, t, s, n: 0, d: 0 }
  const half = at(r.half, p)
  const level = at(r.level, p)
  const tx = at(r.tx, p)
  const ty = at(r.ty, p)
  const l = len(tx, ty)
  return { x: at(r.x, p), y: at(r.y, p), tx: tx / l, ty: ty / l, half, crest: crestOf(cfg, cfg.flow.discharge, half, level), level, s }
}

/** 石组：主溪起点横着一排大石头，从一岸排到另一岸，石缝窄得过不去人；石头的圆心往上游让一点，下游那面不越过能走的地面那条线 */
function rocksOf(cfg: SakuraConfig, rng: Rng, r: Reach): Rocks {
  const rc = cfg.rocks
  const tx = r.tx[0]!
  const ty = r.ty[0]!
  const half = r.half[0]!
  const span = half + cfg.flow.bankU + SPAN_PAST_BANK_U
  const stones: Rock[] = []
  let u = -span
  let rad = between(rng, rc.radiusU)
  u += rad * 0.6
  while (u < span) {
    const back = Math.max(rad - ROCK_FACE_U + 0.05, rad * ROCK_BACK + (rng.next() - 0.5) * 0.36)
    stones.push({ x: r.x[0]! - ty * u - tx * back, y: r.y[0]! + tx * u - ty * back, r: rad })
    const next = between(rng, rc.radiusU)
    u += rad + between(rng, rc.gapU) + next
    rad = next
  }
  return { x: r.x[0]!, y: r.y[0]!, tx, ty, half, span, top: r.level[0]! + rc.heightM, stones }
}

/** 溪穿过林缘那处的那条线，换成本地坐标 */
function cutOf(f: Frame, x: number, y: number, tx: number, ty: number, side: number, span: number): Cut {
  const L = toLocal(f, x, y, { a: 0, b: 0 })
  const u = dirToLocal(f, tx, ty)
  return { a: L.a, b: L.b, ua: u.a, ub: u.b, side, half: span + CUT_PAD_U }
}

/** 本地 (a, b) 处是不是空地（离寺墙与林缘都至少 room 格） */
function openLand(cfg: SakuraConfig, e: Edges, a: number, b: number, room: number): boolean {
  return wallSide(e, a, b) >= cfg.wall.thickU / 2 + room && forestDepth(e, a, b) <= -room
}

/** 木桥：在溪的中段挑一处弯得缓的地方横跨过去，两头都落在空地上 */
function bridgeOf(cfg: SakuraConfig, rng: Rng, f: Frame, e: Edges, r: Reach, weir: Weir): Bridge | null {
  const bc = cfg.bridge
  const n = r.x.length
  const L = r.s[n - 1]!
  const tmp: Local = { a: 0, b: 0 }
  for (let k = 0; k < 24; k++) {
    const s = L * between(rng, bc.at)
    if (s < 5 || s > weir.s - 5) continue
    let i = 0
    while (i < n - 2 && r.s[i + 1]! < s) i++
    let calm = true
    for (let j = 0; j < n; j++) if (Math.abs(r.s[j]! - s) < 2.5 && Math.abs(r.curv[j]!) * r.half[j]! * 2 > 0.45) calm = false
    if (!calm) continue
    const span = r.half[i]! + cfg.flow.bankU + 0.35
    const total = span + bc.rampU
    const ax = -r.ty[i]!
    const ay = r.tx[i]!
    const x = r.x[i]!
    const y = r.y[i]!
    const ok = [-1, 1].every((sg) => {
      toLocal(f, x + ax * total * sg, y + ay * total * sg, tmp)
      return openLand(cfg, e, tmp.a, tmp.b, 1.5)
    })
    if (!ok) continue
    return { x, y, ax, ay, span, half: total, width: bc.widthU / 2, rise: bc.riseM, level: r.level[i]! }
  }
  return null
}

/** 一条路：两端点与两端切向固定的曲线，叠上一道缓弯 */
function pathOf(rng: Rng, from: Point, tf: Point, to: Point, tt: Point): Point[] {
  const l = len(to.x - from.x, to.y - from.y)
  const pts = hermite(from, tf, to, tt, l * 0.8, Math.max(8, Math.ceil(l / 0.4)))
  const bend = (rng.next() * 2 - 1) * 0.12 * l
  return pts.map((p, i) => {
    const u = i / (pts.length - 1)
    const o = bend * Math.sin(Math.PI * u) ** 2
    return { x: p.x - ((to.y - from.y) / l) * o, y: p.y + ((to.x - from.x) / l) * o }
  })
}

/** 院门与路：门开在寺墙挨着空地的那段中间；门里的路弯到这一岸的桥头，不下水、不进林子；布置不下就是 null */
function gateOf(cfg: SakuraConfig, rng: Rng, f: Frame, e: Edges, r: Reach, bridge: Bridge): { gate: Gate; path: Point[] } | null {
  const S = e.size
  const th = cfg.wall.thickU / 2
  const tmp: Along = { i: 0, t: 0, s: 0, n: 0, d: 0 }
  const L: Local = { a: 0, b: 0 }
  const ok: boolean[] = []
  for (let b = 0; b <= S; b += 0.25) ok.push(forestDepth(e, wallA(e, b) + th + 1.2, b) < -2.5 && b > e.wall.from + 2 && b < e.wall.to - 2)
  const run = longestRun(ok)
  if (!run || (run.to - run.from) * 0.25 < cfg.wall.gateU + 6) return null
  const b = (run.from + (run.to - run.from) * (0.3 + 0.4 * rng.next())) * 0.25
  const slope = e.wall.skew + (b > e.wall.kinkAt ? e.wall.kink : 0)
  const ul = len(slope, 1)
  const u = dirToMap(f, slope / ul, 1 / ul)
  const nrm = dirToMap(f, 1 / ul, -slope / ul)
  const p = toMap(f, wallA(e, b), b)
  const gate: Gate = { x: p.x, y: p.y, ux: u.x, uy: u.y, nx: nrm.x, ny: nrm.y, half: cfg.wall.gateU / 2 }
  const from = { x: p.x + nrm.x * (th + 0.3), y: p.y + nrm.y * (th + 0.3) }
  const bank = Math.sign(project(r, from.x, from.y, tmp).n) || 1
  const end = (sg: number): Point => ({ x: bridge.x + bridge.ax * bridge.half * sg, y: bridge.y + bridge.ay * bridge.half * sg })
  const near = [-1, 1].find((sg) => Math.sign(project(r, end(sg).x, end(sg).y, tmp).n) === bank) ?? 1
  const dry = (q: Point, skip: boolean): boolean => {
    toLocal(f, q.x, q.y, L)
    if (skip) return true
    return waterEdge(r, q.x, q.y, tmp) > 0.5 && forestDepth(e, L.a, L.b) < -0.4 && wallSide(e, L.a, L.b) > th + 0.3
  }
  for (let k = 0; k < 4; k++) {
    const pts = pathOf(rng, from, nrm, end(near), { x: -bridge.ax * near, y: -bridge.ay * near })
    if (pts.every((q, i) => dry(q, i < 3 || i > pts.length - 4))) return { gate, path: pts }
  }
  return null
}

/** 定好形状的一张图：边、墙、溪与三样水上的东西、桥、门与路、树与开局站位，还没算地形 */
interface Sketch {
  readonly frame: Frame
  readonly edges: Edges
  readonly walls: Wall[]
  readonly gate: Gate
  readonly stream: Reach
  readonly upstream: Reach
  readonly downstream: Reach
  readonly rocks: Rocks
  readonly weir: Weir
  readonly fence: Fence
  readonly bridge: Bridge
  readonly path: Point[]
  readonly trees: Tree[]
  readonly start: Point
}

/** 林缘上的一处：位置与往林子里的单位法线 */
interface Rim {
  readonly x: number
  readonly y: number
  readonly nx: number
  readonly ny: number
}

/** 林缘（进林子的深度为 0 的那条线）上的一处处：在 [lo, hi]² 上按 RIM_STEP_U 的格子找过零点，大约每 RIM_STEP_U 格一处 */
function rimOf(f: Frame, e: Edges, lo: number, hi: number): Rim[] {
  const n = Math.ceil((hi - lo) / RIM_STEP_U) + 1
  const d = new Float64Array(n * n)
  const L: Local = { a: 0, b: 0 }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      toLocal(f, lo + i * RIM_STEP_U, lo + j * RIM_STEP_U, L)
      d[j * n + i] = forestDepth(e, L.a, L.b)
    }
  }
  const out: Rim[] = []
  const add = (x: number, y: number): void => {
    toLocal(f, x, y, L)
    const h = 0.05
    const g = dirToMap(f, forestDepth(e, L.a + h, L.b) - forestDepth(e, L.a - h, L.b), forestDepth(e, L.a, L.b + h) - forestDepth(e, L.a, L.b - h))
    const gl = len(g.x, g.y) || 1
    out.push({ x, y, nx: g.x / gl, ny: g.y / gl })
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = d[j * n + i]!
      if (i + 1 < n) {
        const w = d[j * n + i + 1]!
        if (v < 0 !== w < 0) add(lo + (i + v / (v - w)) * RIM_STEP_U, lo + j * RIM_STEP_U)
      }
      if (j + 1 < n) {
        const w = d[(j + 1) * n + i]!
        if (v < 0 !== w < 0) add(lo + i * RIM_STEP_U, lo + (j + v / (v - w)) * RIM_STEP_U)
      }
    }
  }
  return out
}

/**
 * 樱花：空地上几棵，离溪岸、桥、路、院门、寺墙、林缘与彼此都留开地方；林缘上一棵挨一棵，画出来的树冠连成一道，探出林缘 RIM_MARGIN_U 到 overhangU；
 * 林缘后面的林子里密密地种满；寺墙外（寺里）隔几格一棵，树冠探过墙头。树都不种在溪里，让开石组与竹栅
 */
function plantTrees(cfg: SakuraConfig, rng: Rng, s: Omit<Sketch, 'trees' | 'start'>): Tree[] {
  const tc = cfg.trees
  const f = s.frame
  const e = s.edges
  const S = e.size
  const th = cfg.wall.thickU / 2
  const tmp: Along = { i: 0, t: 0, s: 0, n: 0, d: 0 }
  const L: Local = { a: 0, b: 0 }
  const trees: Tree[] = []
  const crowd = new Crowd(2.5)
  const height = (r: number): number => between(rng, tc.heightM) * (0.85 + (0.3 * (r - tc.crownU[0])) / Math.max(1e-6, tc.crownU[1] - tc.crownU[0]))
  const add = (t: Tree): void => {
    trees.push(t)
    crowd.add(t)
  }
  const reaches = [s.stream, s.upstream, s.downstream]
  const wet = (x: number, y: number): number => Math.min(...reaches.map((r) => waterEdge(r, x, y, tmp)))
  const clear = (x: number, y: number, r: number): boolean => {
    for (const st of s.rocks.stones) if (len(st.x - x, st.y - y) < st.r + r * 0.4 + 0.3) return false
    const fl = weirLocal(s.weir, x, y)
    return !(fl.side < s.fence.span + 0.4 && Math.abs(fl.along - CREST_U / 2) < r * 0.5 + 0.4)
  }
  /** 林子里能种一棵半径 r 的樱花：画出来的树冠探进空地不过 overhangU，在寺墙空地那边，不下水，让开石组与竹栅，不和已有的挤过 overlap */
  const fits = (x: number, y: number, r: number, overlap: number): boolean => {
    toLocal(f, x, y, L)
    if (forestDepth(e, L.a, L.b) < r * CROWN_EDGE - tc.overhangU || wallSide(e, L.a, L.b) < th + 0.4) return false
    return wet(x, y) >= r * 0.35 && clear(x, y, r) && !crowd.crowded(x, y, r, overlap)
  }
  // 空地上的樱花
  const want = Math.round(between(rng, tc.inside))
  for (let k = 0, made = 0; k < 400 && made < want; k++) {
    const a = rng.next() * S
    const b = rng.next() * S
    const r = between(rng, tc.crownU)
    if (!openLand(cfg, e, a, b, r * 0.9 + 0.8)) continue
    if (wallSide(e, a, b) < th + cfg.wall.eaveU + r * 0.9) continue
    const p = toMap(f, a, b)
    if (waterEdge(s.stream, p.x, p.y, tmp) < cfg.flow.bankU + r - tc.overhangU + 0.4) continue
    if (bridgeDist(s.bridge, p.x, p.y) < r + 0.6) continue
    if (polylineDist(s.path, p.x, p.y) < PATH_HALF_U + r - tc.overhangU + 0.2) continue
    if (len(s.gate.x - p.x, s.gate.y - p.y) < s.gate.half + r + 1.2) continue
    if (crowd.crowded(p.x, p.y, r, 1.05)) continue
    add({ x: p.x, y: p.y, r, h: height(r), inside: true })
    made++
  }
  // 林缘上的樱花：林缘上一处往空地那边 RIM_MARGIN_U 还没被树冠盖住，就顺着法线往林子里种一棵，树冠的边盖过那里；种不下就换小一点的
  const lo = -TERRAIN_PAD_U
  const hi = S + TERRAIN_PAD_U
  const rims = rimOf(f, e, lo, hi)
  for (let i = rims.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[rims[i], rims[j]] = [rims[j]!, rims[i]!]
  }
  for (const p of rims) {
    if (crowd.covered(p.x - p.nx * RIM_MARGIN_U, p.y - p.ny * RIM_MARGIN_U, CROWN_EDGE)) continue
    for (const k of [1, 0.8, 0.62]) {
      const r = between(rng, tc.crownU) * k
      const back = r * CROWN_EDGE - RIM_MARGIN_U - (tc.overhangU - RIM_MARGIN_U) * rng.next()
      const x = p.x + p.nx * back
      const y = p.y + p.ny * back
      if (!fits(x, y, r, RIM_OVERLAP)) continue
      add({ x, y, r, h: height(r), inside: false })
      break
    }
  }
  // 林缘后面的林子：密密的，树冠挨着树冠
  const area = (hi - lo) * (hi - lo)
  for (let k = 0; k < area * 1.2; k++) {
    const x = lo + rng.next() * (hi - lo)
    const y = lo + rng.next() * (hi - lo)
    const r = between(rng, tc.crownU)
    if (fits(x, y, r, 0.64)) add({ x, y, r, h: height(r), inside: false })
  }
  // 寺墙外的樱花：隔几格一棵，树冠探过墙头
  for (let b = e.wall.from + rng.next() * tc.templeGapU; b < e.wall.to; b += tc.templeGapU * (0.8 + rng.next() * 0.4)) {
    const r = between(rng, tc.crownU)
    const a = wallA(e, b) - th - r * (0.3 + rng.next() * 0.9)
    const p = toMap(f, a, b)
    if (crowd.crowded(p.x, p.y, r, 0.7)) continue
    add({ x: p.x, y: p.y, r, h: height(r), inside: false })
  }
  return trees
}

/** 开局站位：空地上的干处，离溪、墙、林缘、树、桥都有几格，挑离地图中心最近的一处 */
function startOf(cfg: SakuraConfig, s: Omit<Sketch, 'start'>): Point | null {
  const tmp: Along = { i: 0, t: 0, s: 0, n: 0, d: 0 }
  const L: Local = { a: 0, b: 0 }
  const c = s.edges.size / 2
  let best: Point | null = null
  let bestD = Infinity
  for (let y = 1; y < s.edges.size; y += 0.5) {
    for (let x = 1; x < s.edges.size; x += 0.5) {
      const d = len(x - c, y - c)
      if (d >= bestD) continue
      toLocal(s.frame, x, y, L)
      if (!openLand(cfg, s.edges, L.a, L.b, 4)) continue
      if (waterEdge(s.stream, x, y, tmp) < cfg.flow.bankU + 2.5) continue
      if (bridgeDist(s.bridge, x, y) < 2) continue
      if (s.trees.some((t) => t.inside && len(t.x - x, t.y - y) < t.r - cfg.trees.overhangU + 3)) continue
      bestD = d
      best = { x, y }
    }
  }
  return best
}

/** 能走的地面：寺墙里（离墙身留一点）、林缘外，扣掉空地上樱花的树冠（树冠下 overhangU 能走进去）；溪面能走，石组与竹栅那两条线外不能。只留与开局站位连通的一块 */
function basinOf(cfg: SakuraConfig, k: Sketch, x0: number, y0: number, cols: number, rows: number, cellU: number): Basin {
  const th = cfg.wall.thickU / 2
  const L: Local = { a: 0, b: 0 }
  const inside = k.trees.filter((t) => t.inside)
  const open = (px: number, py: number): boolean => {
    const x = px / UNIT
    const y = py / UNIT
    toLocal(k.frame, x, y, L)
    if (wallSide(k.edges, L.a, L.b) < th + WALL_CLEAR_U) return false
    if (forestDepth(k.edges, L.a, L.b) > -EDGE_CLEAR_U) return false
    for (const t of inside) if (len(t.x - x, t.y - y) < t.r - cfg.trees.overhangU) return false
    return true
  }
  return makeBasin(open, x0 * UNIT, y0 * UNIT, cols, rows, cellU * UNIT, { x: k.start.x * UNIT, y: k.start.y * UNIT }, cfg.neckU * UNIT)
}

/** 能走的地面按 cell 格的格子栅格化，量出面积，格² */
function measured(cfg: SakuraConfig, k: Sketch, cell: number): { basin: Basin; area: number } {
  const S = k.edges.size
  const basin = basinOf(cfg, k, -cell, -cell, Math.ceil(S / cell) + 2, Math.ceil(S / cell) + 2, cell)
  let cells = 0
  for (let i = 0; i < basin.room.length; i++) if (basin.room[i]! > 0) cells++
  return { basin, area: cells * cell * cell }
}

/** 按种子定一张图的形状：边、溪与石组石槛竹栅、桥、院门与路、树与站位；哪一步不合格就是 null */
function sketch(cfg: SakuraConfig, rng: Rng, seed: number): Sketch | null {
  const S = cfg.sizeU
  const frame = frameOf(Math.floor(rng.next() * 4), rng.next() < 0.5, S)
  const base = edgesOf(cfg, rng)
  const course = courseOf(cfg, rng, frame, base)
  if (!course) return null
  const { line, sIn, sOut } = course
  const q = cfg.flow.discharge
  const stream = makeReach(cfg, slice(line, sIn, sOut + PAST_SILL_U), q, 0, seed + 43, 0)
  if (!gentle(cfg, stream)) return null
  const weir = weirAt(cfg, stream, sOut - sIn)
  const upstream = makeReach(cfg, slice(line, 0, sIn), q, 0, seed + 47, 0)
  const lift = stream.level[0]! + UPSTREAM_HEAD_M - upstream.level[upstream.level.length - 1]!
  for (let i = 0; i < upstream.level.length; i++) upstream.level[i] = upstream.level[i]! + lift
  const downstream = makeReach(cfg, slice(line, sOut, line.s[line.s.length - 1]!), q, weir.crest - cfg.sill.dropM, seed + 53, 0)
  const rocks = rocksOf(cfg, rng, stream)
  const fenceSpan = weir.half + cfg.flow.bankU + SPAN_PAST_BANK_U
  const fence: Fence = { x: weir.x + weir.tx * (CREST_U / 2), y: weir.y + weir.ty * (CREST_U / 2), tx: weir.tx, ty: weir.ty, span: fenceSpan }
  const edges: Edges = {
    ...base,
    cuts: [
      cutOf(frame, rocks.x + rocks.tx * ROCK_FACE_U, rocks.y + rocks.ty * ROCK_FACE_U, rocks.tx, rocks.ty, -1, rocks.span),
      cutOf(frame, weir.x + weir.tx * FENCE_FACE_U, weir.y + weir.ty * FENCE_FACE_U, weir.tx, weir.ty, 1, fenceSpan),
    ],
  }
  const bridge = bridgeOf(cfg, rng, frame, edges, stream, weir)
  if (!bridge) return null
  const gp = gateOf(cfg, rng, frame, edges, stream, bridge)
  if (!gp) return null
  const walls = wallsOf(frame, edges)
  const base2 = { frame, edges, walls, stream, upstream, downstream, rocks, weir, fence, bridge, ...gp }
  const trees = plantTrees(cfg, rng, base2)
  const start = startOf(cfg, { ...base2, trees })
  if (!start) return null
  return { ...base2, trees, start }
}

/**
 * 地形高程（米）：溪按断面、岸坡与滩地算，空地带着轻轻的起伏；石组以上的溪水高一点，石头顶出水面；溪尾垫起一道石槛，
 * 槛下的溪低一截，顺着林子流出去，两岸的坡接回地面
 */
function terrainOf(cfg: SakuraConfig, k: Sketch, seed: number, x0: number, y0: number, cols: number, rows: number): Terrain {
  const cell = cfg.cellU
  const n = cols * rows
  const z = new Float32Array(n)
  const level = new Float32Array(n)
  const edge = new Float32Array(n)
  const bar = new Float32Array(n)
  const wall = new Float32Array(n)
  const forest = new Float32Array(n)
  const tmp: Along = { i: 0, t: 0, s: 0, n: 0, d: 0 }
  const L: Local = { a: 0, b: 0 }
  const f = cfg.flow
  const wr = k.weir
  const rk = k.rocks
  const sc = cfg.sill
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = x0 + (cx + 0.5) * cell
      const y = y0 + (cy + 0.5) * cell
      const i = cy * cols + cx
      project(k.stream, x, y, tmp)
      let g = reachGround(cfg, k.stream, tmp)
      let nearD = Math.abs(tmp.n) - at(k.stream.half, tmp)
      let nearLevel = at(k.stream.level, tmp)
      const sh = at(k.stream.shift, tmp)
      let b = sh * tmp.n < 0 ? Math.abs(sh) / Math.max(1e-6, f.thalwegShift) : 0
      // 石组以上的那段：只在石组那条线上游算
      const rl = rocksLocal(rk, x, y)
      project(k.upstream, x, y, tmp)
      if (tmp.s > 0.05 && rl.along < 0.5) {
        const up = reachGround(cfg, k.upstream, tmp)
        if (up < g) {
          g = up
          nearD = Math.abs(tmp.n) - at(k.upstream.half, tmp)
          nearLevel = at(k.upstream.level, tmp)
          b = 0
        }
      }
      const relief = (fbm(x / 6, y / 6, seed + 5, 3) - 0.5) * 2 * f.reliefM + (fbm(x / 1.7, y / 1.7, seed + 6, 2) - 0.5) * 0.05
      g += relief * smooth(0.5, 2.5, nearD - f.bankU)
      // 石组：一块块圆顶陡边的大石头顶出水面
      if (rl.side < rk.span + 1 && Math.abs(rl.along) < 2) {
        for (const st of rk.stones) {
          const d = len(x - st.x, y - st.y)
          if (d < st.r && rk.top > g) g += (rk.top - g) * Math.sqrt(1 - (d / st.r) ** 4)
        }
      }
      // 石槛：槛前的坡从河床升上槛顶，槛顶平着一小段
      const wl = weirLocal(wr, x, y)
      if (wl.side < wr.half + f.bankU && wl.along > -sc.rampU && wl.along <= CREST_U && wr.crest > g) g += (wr.crest - g) * smooth(-sc.rampU, -sc.rampU * 0.35, wl.along)
      // 槛下：溪低一截顺着林子流出去，两岸的坡从低处的水边接回地面
      project(k.downstream, x, y, tmp)
      if (tmp.s > CREST_U - 0.05 && wl.along > CREST_U - 0.05) {
        const hd = at(k.downstream.half, tmp)
        const lv = at(k.downstream.level, tmp)
        if (tmp.d < hd) {
          g = lv - 0.3 - 0.3 * smooth(0, 4, tmp.s)
          nearLevel = lv
          nearD = tmp.d - hd
          b = 0
        } else if (tmp.d < hd + f.bankU + 1.5) {
          const slope = lv + (wr.level + f.bankM - lv) * smooth(hd, hd + f.bankU + 1.5, tmp.d)
          if (slope < g) {
            g = slope
            nearLevel = lv
            nearD = tmp.d - hd
            b = 0
          }
        }
      }
      toLocal(k.frame, x, y, L)
      z[i] = g
      level[i] = nearLevel
      edge[i] = nearD
      bar[i] = b
      wall[i] = Math.min(1e3, wallSide(k.edges, L.a, L.b))
      forest[i] = forestDepth(k.edges, L.a, L.b)
    }
  }
  return { cols, rows, cell, x0, y0, z, level, edge, bar, wall, forest }
}

let last: { cfg: SakuraConfig; seed: number; plan: SakuraPlan } | null = null

/**
 * 按种子生成樱庭：先定形状，粗量能走的面积，不在范围里就换一组随机数；形状定了再算地形与细的距离场。
 * 同一张图的视图与规则各要一次，记住最近一张
 */
export function sakuraPlan(cfg: SakuraConfig, seed: number): SakuraPlan {
  if (last && last.cfg === cfg && last.seed === seed) return last.plan
  const rng = new Rng(scramble(seed))
  const terrainSeed = scramble(seed) % 100000
  for (let tries = 0; tries < TRIES; tries++) {
    const k = sketch(cfg, rng, terrainSeed + tries * 131)
    if (!k) continue
    const a = measured(cfg, k, BASIN_CELL_U * 2).area
    if (a < cfg.areaU2[0] || a > cfg.areaU2[1]) continue
    const S = cfg.sizeU
    const terrain = terrainOf(cfg, k, terrainSeed, -TERRAIN_PAD_U, -TERRAIN_PAD_U, Math.ceil((S + TERRAIN_PAD_U * 2) / cfg.cellU), Math.ceil((S + TERRAIN_PAD_U * 2) / cfg.cellU))
    const { basin } = measured(cfg, k, BASIN_CELL_U)
    const plan: SakuraPlan = { w: S, h: S, seed: terrainSeed, ...k, terrain, basin }
    last = { cfg, seed, plan }
    return plan
  }
  throw new Error(`樱庭生成不出来：种子 ${seed}`)
}
