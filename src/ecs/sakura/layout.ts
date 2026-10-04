import { UNIT } from '../../util/units.ts'
import { fbm } from '../../util/noise.ts'
import { Rng } from '../../util/rng.ts'
import { makeBasin } from '../worlds/basin.ts'
import { at, crestOf, hermite, makeReach, project, reachGround, route } from '../river/channel.ts'
import type { Basin } from '../worlds/basin'
import type { Along, Heights, Reach } from '../river/channel'
import type { SakuraConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

const DEG = Math.PI / 180
/** 地形铺到地图外多远，格：镜头边距再加设备安全区 */
export const TERRAIN_PAD_U = 6
/** 能走的地面按这么细的格子算距离场，格 */
const BASIN_CELL_U = 0.25
/** 身子离墙身至少这么远（格）：不贴进墙里 */
const WALL_CLEAR_U = 0.12
/** 墙外的溪从水门往外伸多长，格：伸出镜头能看到的范围 */
const OUTSIDE_U = 14
/** 院墙外的溪沟比院里的溪窄，水位比院里溪头高这么多米：墙下的水门是收窄的，水在门前略略壅起 */
const OUTSIDE_NARROW = 0.8
const OUTSIDE_HEAD_M = 0.12
/** 堰顶平的那一段多长，格；堰下的跌水潭两边石壁多厚，格 */
const CREST_U = 0.35
const BASIN_WALL_U = 0.35
/** 路面半宽，格 */
const PATH_HALF_U = 0.55
/** 生成不出合格的院子就换一组随机数重来，最多这么多次 */
const TRIES = 80
/** 身体中心越过堰顶这么远（格）就被冲下去了 */
export const WASH_U = 0.25
/** 堰下比堰顶低过这么多（米）的格子，水一流进去就落下去了 */
export const SINK_M = 0.5

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const len = (x: number, y: number): number => Math.sqrt(x * x + y * y)

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

/** 一面院墙：墙身中线从 a 到 b（格），朝院子里的单位法线，长 */
export interface Wall {
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
  readonly nx: number
  readonly ny: number
  readonly len: number
}

/** 水门：溪从院墙下流进或流出的地方，墙身中线上的点、顺水的单位方向、那里的水面半宽（格） */
export interface Port {
  readonly x: number
  readonly y: number
  readonly dx: number
  readonly dy: number
  readonly half: number
}

/** 石堰：堰顶上游边的中点、顺水的单位方向、水面半宽（格）、堰顶高程与堰前的设计水位（米）、它在溪上的弧长（格） */
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

/** 院门：门的中点（墙身中线上）、顺着墙的单位方向、朝院子里的单位法线、半宽（格） */
export interface Gate {
  readonly x: number
  readonly y: number
  readonly ux: number
  readonly uy: number
  readonly nx: number
  readonly ny: number
  readonly half: number
}

/** 一棵樱花：树冠的圆心、半径（格）与树高（米）；inside 是种在院子里的，树干挡人 */
export interface Tree {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly h: number
  readonly inside: boolean
}

/**
 * 地形，格子 (0, 0) 的左上角在 (x0, y0) 格：高程（米）；画地面用的几张场：最近那段溪的设计水位（米）、离它水边多远（格，水里为负）、
 * 凸岸边滩有多显，离院墙多远（格，院里为正）
 */
export interface Terrain extends Heights {
  readonly level: Float32Array
  readonly edge: Float32Array
  readonly bar: Float32Array
  readonly inside: Float32Array
}

/**
 * 按种子生成的樱庭，格与米：地图 w × h 格；四面院墙（顺时针，墙身中线）；院里的溪、墙外的上游溪沟与堰下流出去的那段；进出水的两个水门、石堰、木桥；
 * 两扇院门与通到桥头的两条路；樱花树；地形、能走的地面（像素）、开局时队伍站的地方；画画用的种子
 */
export interface SakuraPlan {
  readonly w: number
  readonly h: number
  readonly seed: number
  readonly walls: readonly Wall[]
  readonly stream: Reach
  readonly upstream: Reach
  readonly downstream: Reach
  readonly inlet: Port
  readonly outlet: Port
  readonly weir: Weir
  readonly bridge: Bridge
  readonly gates: readonly Gate[]
  readonly paths: readonly (readonly Point[])[]
  readonly trees: readonly Tree[]
  readonly terrain: Terrain
  readonly basin: Basin
  readonly start: Point
}

/** 离院墙多远（格）：院里为正，按离得最近的那面墙的墙身中线量；院子是凸的四边形，院里处处准 */
export function insideDepth(walls: readonly Wall[], x: number, y: number): number {
  let best = Infinity
  for (const w of walls) best = Math.min(best, (x - w.ax) * w.nx + (y - w.ay) * w.ny)
  return best
}

/** 离墙身中线（线段）最近多远（格），顺带记下是哪面墙、在墙的哪一侧（院里为正） */
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

/** 堰的本地坐标：along 顺水离堰顶上游边多远（堰下为正），side 离溪的中线多远（格） */
export function weirLocal(wr: Weir, x: number, y: number): { along: number; side: number } {
  const dx = x - wr.x
  const dy = y - wr.y
  return { along: dx * wr.tx + dy * wr.ty, side: Math.abs(dx * -wr.ty + dy * wr.tx) }
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

/** 院子：长宽 W × H 的长方形，四个角各自挪一点，整座转一个小角度；墙按顺时针排，法线朝院里 */
function gardenWalls(cfg: SakuraConfig, rng: Rng, area: number): Wall[] {
  const g = cfg.garden
  const aspect = between(rng, g.aspect)
  const W = Math.sqrt(area * aspect)
  const H = area / W
  const rot = (rng.next() * 2 - 1) * g.skewDeg * DEG
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  const corners = [
    [-W / 2, -H / 2],
    [W / 2, -H / 2],
    [W / 2, H / 2],
    [-W / 2, H / 2],
  ].map(([x, y]) => {
    const jx = x! + (rng.next() * 2 - 1) * g.jitterU
    const jy = y! + (rng.next() * 2 - 1) * g.jitterU
    return { x: jx * c - jy * s, y: jx * s + jy * c }
  })
  return corners.map((a, k) => {
    const b = corners[(k + 1) % 4]!
    const l = len(b.x - a.x, b.y - a.y)
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y, nx: -(b.y - a.y) / l, ny: (b.x - a.x) / l, len: l }
  })
}

/** 第 k 面墙上占墙长 t 处的点 */
function onWall(w: Wall, t: number): Point {
  return { x: w.ax + (w.bx - w.ax) * t, y: w.ay + (w.by - w.ay) * t }
}

/** 定好形状的一张图：院墙、溪、水门、石堰、桥、院门、路、树与开局站位，还没算地形 */
interface Sketch {
  readonly walls: Wall[]
  readonly stream: Reach
  readonly upstream: Reach
  readonly downstream: Reach
  readonly inlet: Port
  readonly outlet: Port
  readonly weir: Weir
  readonly bridge: Bridge
  readonly gates: Gate[]
  readonly paths: Point[][]
  readonly trees: Tree[]
  readonly start: Point
}

/**
 * 溪：进水口在随机一面墙上，出水口在对面或相邻的一面墙上，都离墙角至少 cornerU；中线是两端垂直于墙的曲线，叠上两端为零的缓弯。
 * 相邻的两个水门离共用的墙角差不多远，溪绕着墙角拐成一道圆弧。弯太急、溪岸贴着院墙就减小蜿蜒再来，减到不弯还不行就换一对水门
 */
function streamOf(cfg: SakuraConfig, rng: Rng, walls: readonly Wall[], seed: number): { stream: Reach; inlet: Port; outlet: Port } | null {
  const st = cfg.stream
  const th = cfg.wall.thickU / 2
  const iw = Math.floor(rng.next() * 4)
  const opposite = rng.next() < st.opposite
  const ow = opposite ? (iw + 2) % 4 : (iw + (rng.next() < 0.5 ? 1 : 3)) % 4
  const a = walls[iw]!
  const b = walls[ow]!
  const margin = (w: Wall): number => Math.min(0.45, st.cornerU / w.len)
  const pick = (w: Wall): number => margin(w) + (1 - 2 * margin(w)) * rng.next()
  // 相邻时，共用的墙角是进水那面墙的尾、出水那面墙的头（出水的在顺时针下一面），或者反过来
  const fromCorner = (w: Wall, tail: boolean): number => {
    const t = (Math.min(a.len, b.len) * between(rng, st.turnAt)) / w.len
    return Math.min(1 - margin(w), Math.max(margin(w), tail ? 1 - t : t))
  }
  const next = ow === (iw + 1) % 4
  const pIn = onWall(a, opposite ? pick(a) : fromCorner(a, next))
  const pOut = onWall(b, opposite ? pick(b) : fromCorner(b, !next))
  const span = len(pOut.x - pIn.x, pOut.y - pIn.y)
  const minSide = Math.min(...walls.map((w) => w.len))
  if (span < minSide * 0.55) return null
  const s0 = { x: pIn.x + a.nx * th, y: pIn.y + a.ny * th }
  const s1 = { x: pOut.x + b.nx * th, y: pOut.y + b.ny * th }
  const t0 = { x: a.nx, y: a.ny }
  const t1 = { x: -b.nx, y: -b.ny }
  // 拐弯时按圆弧取两端切向的长短：转角 θ 的圆弧，两端切向是弦长的 2·tan(θ/4)/sin(θ/2) 倍
  const turn = Math.acos(Math.max(-1, Math.min(1, t0.x * t1.x + t0.y * t1.y)))
  const reach = opposite ? undefined : (2 * Math.tan(turn / 4)) / Math.sin(turn / 2)
  for (const m of [1, 0.6, 0.3, 0]) {
    const r = makeReach(cfg, route(rng, s0, t0, s1, t1, st.meanderU * m * (0.3 + 0.7 * rng.next()), seed + 41, reach), cfg.flow.discharge, 0, seed + 43, 0)
    if (fits(cfg, walls, r)) {
      const n = r.x.length
      return {
        stream: r,
        inlet: { x: pIn.x, y: pIn.y, dx: a.nx, dy: a.ny, half: r.half[0]! },
        outlet: { x: pOut.x, y: pOut.y, dx: -b.nx, dy: -b.ny, half: r.half[n - 1]! },
      }
    }
  }
  return null
}

/** 溪合格：弯道不急过 minBend 倍水面宽；溪岸离院墙至少 edgeGapU（两个水门附近除外） */
function fits(cfg: SakuraConfig, walls: readonly Wall[], r: Reach): boolean {
  const st = cfg.stream
  const n = r.x.length
  const L = r.s[n - 1]!
  for (let i = 0; i < n; i++) {
    const s = r.s[i]!
    if (Math.abs(r.curv[i]!) * r.half[i]! * 2 * st.minBend > 1) return false
    const port = Math.min(s, L - s)
    const need = r.half[i]! + cfg.flow.bankU + st.edgeGapU
    if (port > need + 2 && insideDepth(walls, r.x[i]!, r.y[i]!) < need) return false
  }
  return true
}

/** 石堰：在溪尾离出水那面墙 backU 格处横着溪砌一道，堰顶按临界流定（漫过堰顶的水把堰前的水面托在设计水位上） */
function weirOf(cfg: SakuraConfig, r: Reach): Weir {
  const n = r.x.length
  const s = r.s[n - 1]! - cfg.weir.backU
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

/** 墙外的溪：上游从镜头外弯过来接上进水的水门，堰下的那段从出水的水门笔直流出去；都只画，不在水流的解里 */
function outsideOf(cfg: SakuraConfig, rng: Rng, inlet: Port, outlet: Port, weir: Weir, seed: number): { upstream: Reach; downstream: Reach } {
  const th = cfg.wall.thickU / 2
  const a = Math.atan2(-inlet.dy, -inlet.dx) + (rng.next() * 2 - 1) * 0.45
  const far = { x: inlet.x + Math.cos(a) * OUTSIDE_U, y: inlet.y + Math.sin(a) * OUTSIDE_U }
  const gate = { x: inlet.x - inlet.dx * th, y: inlet.y - inlet.dy * th }
  const q = cfg.flow.discharge
  const up = makeReach(cfg, route(rng, far, { x: -Math.cos(a), y: -Math.sin(a) }, gate, { x: inlet.dx, y: inlet.dy }, cfg.stream.meanderU * 0.5, seed + 47), q, 0, seed + 49, 0)
  const lift = OUTSIDE_HEAD_M - up.level[up.level.length - 1]!
  for (let i = 0; i < up.level.length; i++) {
    up.level[i] = up.level[i]! + lift
    up.half[i] = up.half[i]! * OUTSIDE_NARROW
  }
  const from = { x: weir.x, y: weir.y }
  const to = { x: outlet.x + outlet.dx * OUTSIDE_U, y: outlet.y + outlet.dy * OUTSIDE_U }
  const down = makeReach(cfg, hermite(from, { x: weir.tx, y: weir.ty }, to, { x: outlet.dx, y: outlet.dy }, len(to.x - from.x, to.y - from.y) * 0.5, 40), q, weir.crest - cfg.weir.dropM, seed + 53, 0)
  // 堰下：院里是和溪一样宽的跌水沟，出了墙收窄成一条石砌的水路
  const out = cfg.weir.backU + th
  for (let i = 0; i < down.half.length; i++) down.half[i] = weir.half + 0.15 - (weir.half * 0.5 - 0.05) * smooth(out, out + 1.5, down.s[i]!)
  return { upstream: up, downstream: down }
}

/** 木桥：在溪的中段挑一处弯得缓的地方横跨过去，两头都落在院里、离墙够远 */
function bridgeOf(cfg: SakuraConfig, rng: Rng, walls: readonly Wall[], r: Reach, weir: Weir): Bridge | null {
  const bc = cfg.bridge
  const n = r.x.length
  const L = r.s[n - 1]!
  for (let k = 0; k < 24; k++) {
    const s = L * between(rng, bc.at)
    if (s < 5 || s > weir.s - 5) continue
    let i = 0
    while (i < n - 2 && r.s[i + 1]! < s) i++
    let calm = true
    for (let j = 0; j < n; j++) if (Math.abs(r.s[j]! - s) < 2.5 && Math.abs(r.curv[j]!) * r.half[j]! * 2 > 0.45) calm = false
    if (!calm) continue
    const half = r.half[i]!
    const span = half + cfg.flow.bankU + 0.35
    const total = span + bc.rampU
    const ax = -r.ty[i]!
    const ay = r.tx[i]!
    const x = r.x[i]!
    const y = r.y[i]!
    const room = cfg.wall.thickU / 2 + 1.5
    if (insideDepth(walls, x + ax * total, y + ay * total) < room || insideDepth(walls, x - ax * total, y - ay * total) < room) continue
    return { x, y, ax, ay, span, half: total, width: bc.widthU / 2, rise: bc.riseM, level: r.level[i]! }
  }
  return null
}

/** 院门：溪两边各开一扇，开在离溪最远的那段墙上，离墙角与水门都远；到门的路从门里弯到这一边的桥头 */
function gatesOf(cfg: SakuraConfig, rng: Rng, walls: readonly Wall[], r: Reach, inlet: Port, outlet: Port, bridge: Bridge): { gates: Gate[]; paths: Point[][] } | null {
  const tmp: Along = { i: 0, t: 0, s: 0, n: 0, d: 0 }
  const th = cfg.wall.thickU / 2
  const best: ({ g: Gate; score: number } | null)[] = [null, null]
  for (const w of walls) {
    const m = Math.min(0.45, (cfg.stream.cornerU * 0.6) / w.len)
    for (let k = 0; k < 9; k++) {
      const t = m + (1 - 2 * m) * (k / 8)
      const p = onWall(w, t)
      if (len(p.x - inlet.x, p.y - inlet.y) < inlet.half + 5 || len(p.x - outlet.x, p.y - outlet.y) < outlet.half + 5) continue
      project(r, p.x + w.nx * 2, p.y + w.ny * 2, tmp)
      const side = tmp.n > 0 ? 0 : 1
      const score = Math.abs(tmp.n) - at(r.half, tmp) + rng.next() * 3
      const cur = best[side]
      if (!cur || score > cur.score) {
        const ux = (w.bx - w.ax) / w.len
        const uy = (w.by - w.ay) / w.len
        best[side] = { g: { x: p.x, y: p.y, ux, uy, nx: w.nx, ny: w.ny, half: cfg.wall.gateU / 2 }, score }
      }
    }
  }
  if (!best[0] || !best[1]) return null
  const gates = [best[0].g, best[1].g]
  const paths = gates.map((g) => {
    const from = { x: g.x + g.nx * (th + 0.3), y: g.y + g.ny * (th + 0.3) }
    project(r, from.x, from.y, tmp)
    const sign = Math.sign((from.x - bridge.x) * bridge.ax + (from.y - bridge.y) * bridge.ay) || 1
    const end = { x: bridge.x + bridge.ax * bridge.half * sign, y: bridge.y + bridge.ay * bridge.half * sign }
    const l = len(end.x - from.x, end.y - from.y)
    const pts = hermite(from, { x: g.nx, y: g.ny }, end, { x: -bridge.ax * sign, y: -bridge.ay * sign }, l * 0.8, Math.max(8, Math.ceil(l / 0.4)))
    const bend = (rng.next() * 2 - 1) * 0.12 * l
    return pts.map((p, i) => {
      const u = i / (pts.length - 1)
      const o = bend * Math.sin(Math.PI * u) ** 2
      return { x: p.x - ((end.y - from.y) / l) * o, y: p.y + ((end.x - from.x) / l) * o }
    })
  })
  return { gates, paths }
}

/** 离一组折线多近，格 */
function pathDist(paths: readonly (readonly Point[])[], x: number, y: number): number {
  let best = Infinity
  for (const line of paths) {
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]!
      const b = line[i + 1]!
      const ex = b.x - a.x
      const ey = b.y - a.y
      const t = clamp01(((x - a.x) * ex + (y - a.y) * ey) / (ex * ex + ey * ey || 1e-12))
      best = Math.min(best, len(x - a.x - ex * t, y - a.y - ey * t))
    }
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

/**
 * 樱花树：院子里几棵，离溪岸、桥、路、院门、院墙与彼此都留开地方；院墙外顺着墙种一排，树冠探过墙头，水门与院门外留空；
 * 再往外零散种些，铺满镜头看得到的地方
 */
function plantTrees(cfg: SakuraConfig, rng: Rng, s: Omit<Sketch, 'trees' | 'start'>, area: { x0: number; y0: number; x1: number; y1: number }): Tree[] {
  const tc = cfg.trees
  const th = cfg.wall.thickU / 2
  const tmp: Along = { i: 0, t: 0, s: 0, n: 0, d: 0 }
  const trees: Tree[] = []
  const free = (x: number, y: number, r: number, k: number): boolean => trees.every((o) => len(o.x - x, o.y - y) >= (o.r + r) * k)
  const add = (x: number, y: number, r: number, inside: boolean): void => {
    trees.push({ x, y, r, h: between(rng, tc.heightM) * (0.85 + 0.3 * (r - tc.crownU[0]) / Math.max(1e-6, tc.crownU[1] - tc.crownU[0])), inside })
  }
  const want = Math.round(between(rng, tc.inside))
  for (let k = 0, made = 0; k < 400 && made < want; k++) {
    const x = area.x0 + rng.next() * (area.x1 - area.x0)
    const y = area.y0 + rng.next() * (area.y1 - area.y0)
    const r = between(rng, tc.crownU)
    if (insideDepth(s.walls, x, y) < th + r * 0.9) continue
    if (waterEdge(s.stream, x, y, tmp) < cfg.flow.bankU + r - tc.overhangU + 0.4) continue
    if (bridgeDist(s.bridge, x, y) < r + 0.6) continue
    if (pathDist(s.paths, x, y) < PATH_HALF_U + r - tc.overhangU + 0.2) continue
    if (s.gates.some((g) => len(g.x - x, g.y - y) < g.half + r + 1.2)) continue
    if (!free(x, y, r, 1.05)) continue
    add(x, y, r, true)
    made++
  }
  const ports = [s.inlet, s.outlet]
  const clearOf = (x: number, y: number, r: number): boolean => {
    for (const p of ports) if (len(p.x - x, p.y - y) < p.half + r + 1.2) return false
    for (const g of s.gates) if (len(g.x - x, g.y - y) < g.half + r + 0.8) return false
    project(s.upstream, x, y, tmp)
    if (tmp.d < at(s.upstream.half, tmp) + r * 0.7 + 0.6) return false
    project(s.downstream, x, y, tmp)
    return tmp.d >= at(s.downstream.half, tmp) + r * 0.7 + 0.6
  }
  for (const w of s.walls) {
    const ux = (w.bx - w.ax) / w.len
    const uy = (w.by - w.ay) / w.len
    for (let u = -2 + rng.next() * tc.outsideGapU; u < w.len + 2; u += tc.outsideGapU * (0.75 + rng.next() * 0.5)) {
      const r = between(rng, tc.crownU) * (0.95 + rng.next() * 0.2)
      const off = th + r * (0.25 + rng.next() * 0.75)
      const x = w.ax + ux * u - w.nx * off
      const y = w.ay + uy * u - w.ny * off
      if (insideDepth(s.walls, x, y) > -th - r * 0.2 || !clearOf(x, y, r) || !free(x, y, r, 0.72)) continue
      add(x, y, r, false)
    }
  }
  const extra = (area.x1 - area.x0 + TERRAIN_PAD_U * 2) * (area.y1 - area.y0 + TERRAIN_PAD_U * 2) * 0.5
  for (let k = 0; k < extra; k++) {
    const x = area.x0 - TERRAIN_PAD_U + rng.next() * (area.x1 - area.x0 + TERRAIN_PAD_U * 2)
    const y = area.y0 - TERRAIN_PAD_U + rng.next() * (area.y1 - area.y0 + TERRAIN_PAD_U * 2)
    const r = between(rng, tc.crownU)
    if (insideDepth(s.walls, x, y) > -th - r - 1.2 || !clearOf(x, y, r) || !free(x, y, r, 0.8)) continue
    add(x, y, r, false)
  }
  return trees
}

/** 开局站位：院里的干地上，离溪、墙、树、桥都有几格，挑离院子中心最近的一处 */
function startOf(cfg: SakuraConfig, s: Omit<Sketch, 'start'>): Point | null {
  const tmp: Along = { i: 0, t: 0, s: 0, n: 0, d: 0 }
  let cx = 0
  let cy = 0
  for (const w of s.walls) {
    cx += w.ax / 4
    cy += w.ay / 4
  }
  let best: Point | null = null
  let bestD = Infinity
  for (let gy = -20; gy <= 20; gy += 0.5) {
    for (let gx = -20; gx <= 20; gx += 0.5) {
      const x = cx + gx
      const y = cy + gy
      if (insideDepth(s.walls, x, y) < 4) continue
      if (waterEdge(s.stream, x, y, tmp) < cfg.flow.bankU + 2.5) continue
      if (bridgeDist(s.bridge, x, y) < 2) continue
      if (s.trees.some((t) => t.inside && len(t.x - x, t.y - y) < t.r - cfg.trees.overhangU + 3)) continue
      const d = len(gx, gy)
      if (d < bestD) {
        bestD = d
        best = { x, y }
      }
    }
  }
  return best
}

/** 按面积 area 定一张图的形状：院墙、溪、堰、桥、院门与路、树与站位；不合格就换随机数重来 */
function sketch(cfg: SakuraConfig, rng: Rng, area: number, seed: number): Sketch | null {
  for (let k = 0; k < TRIES; k++) {
    const walls = gardenWalls(cfg, rng, area)
    const st = streamOf(cfg, rng, walls, seed + k * 131)
    if (!st) continue
    const weir = weirOf(cfg, st.stream)
    const bridge = bridgeOf(cfg, rng, walls, st.stream, weir)
    if (!bridge) continue
    const gp = gatesOf(cfg, rng, walls, st.stream, st.inlet, st.outlet, bridge)
    if (!gp) continue
    const out = outsideOf(cfg, rng, st.inlet, st.outlet, weir, seed + k * 131)
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const w of walls) {
      x0 = Math.min(x0, w.ax)
      y0 = Math.min(y0, w.ay)
      x1 = Math.max(x1, w.ax)
      y1 = Math.max(y1, w.ay)
    }
    const base = { walls, ...st, weir, bridge, ...gp, ...out }
    const trees = plantTrees(cfg, rng, base, { x0, y0, x1, y1 })
    const start = startOf(cfg, { ...base, trees })
    if (start) return { ...base, trees, start }
  }
  return null
}

/** 把一张图平移 (dx, dy) 格 */
function shifted(k: Sketch, dx: number, dy: number): Sketch {
  const move = (r: Reach): Reach => {
    for (let i = 0; i < r.x.length; i++) {
      r.x[i] = r.x[i]! + dx
      r.y[i] = r.y[i]! + dy
    }
    r.box[0] = r.box[0]! + dx
    r.box[1] = r.box[1]! + dy
    r.box[2] = r.box[2]! + dx
    r.box[3] = r.box[3]! + dy
    return r
  }
  const p = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: o.x + dx, y: o.y + dy })
  return {
    walls: k.walls.map((w) => ({ ...w, ax: w.ax + dx, ay: w.ay + dy, bx: w.bx + dx, by: w.by + dy })),
    stream: move(k.stream),
    upstream: move(k.upstream),
    downstream: move(k.downstream),
    inlet: p(k.inlet),
    outlet: p(k.outlet),
    weir: p(k.weir),
    bridge: p(k.bridge),
    gates: k.gates.map(p),
    paths: k.paths.map((l) => l.map(p)),
    trees: k.trees.map(p),
    start: p(k.start),
  }
}

/**
 * 地形高程（米）：溪按断面、岸坡与滩地算，院里的地面带着轻轻的起伏；溪尾垫起一道石堰，堰下是一条石砌的跌水沟，从墙下流出去；
 * 墙外的上游溪沟也照样刻出来
 */
function terrainOf(cfg: SakuraConfig, k: Sketch, seed: number, x0: number, y0: number, cols: number, rows: number): Terrain {
  const cell = cfg.cellU
  const n = cols * rows
  const z = new Float32Array(n)
  const level = new Float32Array(n)
  const edge = new Float32Array(n)
  const bar = new Float32Array(n)
  const inside = new Float32Array(n)
  const tmp: Along = { i: 0, t: 0, s: 0, n: 0, d: 0 }
  const f = cfg.flow
  const wr = k.weir
  const wc = cfg.weir
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
      project(k.upstream, x, y, tmp)
      if (tmp.s > 0.05) {
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
      // 石堰：堰前的坡从河床升上堰顶，堰顶平着一小段；堰下是石砌的跌水沟，一路从墙下通到墙外，沟两边的石壁与岸顶一样高
      const wl = weirLocal(wr, x, y)
      if (wl.side < wr.half + f.bankU && wl.along > -wc.rampU && wl.along <= CREST_U && wr.crest > g) g += (wr.crest - g) * smooth(-wc.rampU, -wc.rampU * 0.35, wl.along)
      project(k.downstream, x, y, tmp)
      if (tmp.s > CREST_U - 0.05 && tmp.d < wr.half + f.bankU + 0.5) {
        const ditch = at(k.downstream.half, tmp)
        if (tmp.d < ditch) {
          nearLevel = at(k.downstream.level, tmp)
          g = nearLevel - 0.25 - 0.2 * smooth(wc.backU, wc.backU + 2, tmp.s)
          nearD = tmp.d - ditch
          b = 0
        } else g = Math.max(g, wr.level + f.bankM)
      }
      z[i] = g
      level[i] = nearLevel
      edge[i] = nearD
      bar[i] = b
      inside[i] = insideDepth(k.walls, x, y)
    }
  }
  return { cols, rows, cell, x0, y0, z, level, edge, bar, inside }
}

/**
 * 能走的地面：院墙里（离墙身留一点），扣掉院里樱花的树干一圈（树冠下 overhangU 能走进去），扣掉堰下的跌水沟与两边的石壁；
 * 堰顶外 lipU 以内的溪面留着，水能把东西冲过去。只留与开局站位连通的一块
 */
function basinOf(cfg: SakuraConfig, k: Sketch, x0: number, y0: number, cols: number, rows: number, cellU: number): Basin {
  const th = cfg.wall.thickU / 2
  const wr = k.weir
  const open = (px: number, py: number): boolean => {
    const x = px / UNIT
    const y = py / UNIT
    if (insideDepth(k.walls, x, y) < th + WALL_CLEAR_U) return false
    for (const t of k.trees) if (t.inside && len(t.x - x, t.y - y) < t.r - cfg.trees.overhangU) return false
    const wl = weirLocal(wr, x, y)
    if (wl.along > 0.05 && wl.side < wr.half + 0.15 + BASIN_WALL_U) return wl.along < cfg.weir.lipU && wl.side < wr.half
    return true
  }
  return makeBasin(open, x0 * UNIT, y0 * UNIT, cols, rows, cellU * UNIT, { x: k.start.x * UNIT, y: k.start.y * UNIT }, cfg.garden.neckU * UNIT)
}

/** 能走的地面按 cell 格的格子栅格化，量出面积，格² */
function measured(cfg: SakuraConfig, k: Sketch, w: number, h: number, cell: number): { basin: Basin; area: number } {
  const basin = basinOf(cfg, k, -cell, -cell, Math.ceil(w / cell) + 2, Math.ceil(h / cell) + 2, cell)
  let cells = 0
  for (let i = 0; i < basin.room.length; i++) if (basin.room[i]! > 0) cells++
  return { basin, area: cells * cell * cell }
}

/** 定好形状的图挪进地图：院墙的外接框四周留 padU */
function placed(cfg: SakuraConfig, k: Sketch): { k: Sketch; w: number; h: number } {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const w of k.walls) {
    x0 = Math.min(x0, w.ax)
    y0 = Math.min(y0, w.ay)
    x1 = Math.max(x1, w.ax)
    y1 = Math.max(y1, w.ay)
  }
  const pad = cfg.garden.padU + cfg.wall.thickU / 2
  const w = Math.ceil(x1 - x0 + pad * 2)
  const h = Math.ceil(y1 - y0 + pad * 2)
  return { k: shifted(k, (w - (x1 - x0)) / 2 - x0, (h - (y1 - y0)) / 2 - y0), w, h }
}

let last: { cfg: SakuraConfig; seed: number; plan: SakuraPlan } | null = null

/**
 * 按种子生成樱庭：先按目标面积定院子的大小，粗量能走的面积，不在范围里就按面积比缩放重来；形状定了再算地形与细的距离场。
 * 同一张图的视图与规则各要一次，记住最近一张
 */
export function sakuraPlan(cfg: SakuraConfig, seed: number): SakuraPlan {
  if (last && last.cfg === cfg && last.seed === seed) return last.plan
  const [lo, hi] = cfg.garden.areaU2
  const want = (lo + hi) / 2
  let area = want * 1.12
  let got: { k: Sketch; w: number; h: number } | null = null
  for (let n = 0; n < 6; n++) {
    const raw = sketch(cfg, new Rng(scramble(seed)), area, scramble(seed) % 100000)
    if (!raw) throw new Error(`樱庭生成不出来：种子 ${seed}`)
    got = placed(cfg, raw)
    const a = measured(cfg, got.k, got.w, got.h, BASIN_CELL_U * 2).area
    if (Math.abs(a - want) < (hi - lo) * 0.3) break
    area *= want / a
  }
  const { k, w, h } = got!
  const terrainSeed = scramble(seed) % 100000
  const terrain = terrainOf(cfg, k, terrainSeed, -TERRAIN_PAD_U, -TERRAIN_PAD_U, Math.ceil((w + TERRAIN_PAD_U * 2) / cfg.cellU), Math.ceil((h + TERRAIN_PAD_U * 2) / cfg.cellU))
  const { basin } = measured(cfg, k, w, h, BASIN_CELL_U)
  const plan: SakuraPlan = { w, h, seed: terrainSeed, ...k, terrain, basin }
  last = { cfg, seed, plan }
  return plan
}
