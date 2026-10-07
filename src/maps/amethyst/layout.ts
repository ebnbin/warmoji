import { UNIT } from '../../util/units.ts'
import { fbm } from '../../util/noise.ts'
import { awayFromWall, makeBasin, roomAt } from '../basin.ts'
import { FRAME, FRAME_MID } from '../frame.ts'
import type { Basin } from '../basin'
import type { Rect } from '../frame'
import type { Rng } from '../../util/rng'
import type { Point } from '../../util/vec'
import type { AmethystConfig } from '../../types/maps'

/** 距离场的格子边长，像素 */
const CELL = 0.25 * UNIT
/** 画地面的那块比地图四边各宽出几格：镜头贴着地图边时也看得到一圈岩体 */
export const FIELD_PAD_U = 2
/** 塌顶的轮廓按这么多个方位取半径 */
const RIM = 48
/** 顶缝下那道碎晶比顶缝两边各宽出几格 */
export const STRIP_PAD_U = 0.3
/** 每放一样东西最多试多少个随机位置：放不下的就少放 */
const TRIES = 60

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function ease(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 一个晶洞：圆心、平均半径（像素），轮廓按方位角起伏，wob 是三组谐波的幅度与相位 */
export interface Geode {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly wob: readonly number[]
}

/** 一条暗道：从洞厅沿折线拐进岩体，第 turn 个折点是拐角，末点是尽头小晶洞的中心；半宽与小晶洞的半径，像素 */
export interface Tunnel {
  readonly path: readonly Point[]
  readonly turn: number
  readonly half: number
  readonly pocket: number
}

/** 一处塌顶：圆心、平均半径（像素），一圈 RIM 个方位上的半径倍率 */
export interface Breach {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly rim: readonly number[]
}

/** 一道顶缝：折线上的点（像素）与各点的半宽（像素） */
export interface Rift {
  readonly pts: readonly Point[]
  readonly half: readonly number[]
}

/** 塌顶下的碎晶坡：圆心、半径（像素）、中间高多少米 */
export interface Mound {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly h: number
}

/** 一根晶体：底在 (x, y)，朝 dir（弧度）的方位斜着长出去，尖端在水平方向伸出 reach 像素、离地 top 米；截面半径 r 像素；tone 是颜色的深浅（0 淡、1 深） */
export interface Prism {
  readonly x: number
  readonly y: number
  readonly dir: number
  readonly reach: number
  readonly r: number
  readonly top: number
  readonly tone: number
}

/** 一丛晶体：中心、底半径（像素）、最高处离地（米），几根晶体按从矮到高排 */
export interface Cluster {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly h: number
  readonly prisms: readonly Prism[]
}

/** 一根巨晶：根部埋在洞壁里，尖端伸进洞厅；截面是外接圆半径 r 像素的正六边形、一面着地，根部比尖端抬高 lift 米；tone 是颜色的深浅 */
export interface Beam {
  readonly root: Point
  readonly tip: Point
  readonly r: number
  readonly lift: number
  readonly tone: number
}

/** 地上半埋的一颗晶洞：中心、半径（像素）、壳沿离地多高（米），turn 是纹路转的角 */
export interface Nodule {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly h: number
  readonly turn: number
}

/** 附近有哪些东西：一格一格的桶，start[i] 到 start[i + 1] 是第 i 格的条目，条目是 种类·65536 + 序号 */
export interface Bins {
  readonly cols: number
  readonly rows: number
  readonly x0: number
  readonly y0: number
  readonly start: Int32Array
  readonly items: Int32Array
}

/** 桶里条目的种类 */
export const BIN = { mound: 0, rift: 1, cluster: 2, beam: 3, nodule: 4, druse: 5 } as const

/** 一局的紫晶洞：按种子生成，模拟与画面都从这里读；全是数据，能整个发给画地面的线程 */
export interface AmethystLayout {
  /** 地图矩形，像素 */
  readonly map: Rect
  /** 画地面、算光的那块，像素 */
  readonly field: Rect
  readonly seed: number
  readonly ceilingM: number
  readonly wallU: number
  /** 洞厅的边按噪声起伏的幅度与波长，像素 */
  readonly wobble: number
  readonly wave: number
  /** 连成洞厅的几个晶洞，第一个是主晶洞 */
  readonly chambers: readonly Geode[]
  /** 暗道尽头的小晶洞，与 tunnels 一一对应 */
  readonly pockets: readonly Geode[]
  readonly tunnels: readonly Tunnel[]
  /** 第一处是主晶洞上的塌顶 */
  readonly breaches: readonly Breach[]
  readonly rifts: readonly Rift[]
  readonly mounds: readonly Mound[]
  readonly clusters: readonly Cluster[]
  readonly beams: readonly Beam[]
  readonly nodules: readonly Nodule[]
  readonly druse: readonly Cluster[]
  /** 身体走得到的地面：洞厅与暗道，挡路的晶体挖掉 */
  readonly basin: Basin
  /** 只算洞壁的地面：画洞壁、算洞壁的高度 */
  readonly shell: Basin
  readonly bins: Bins
  /** 能刷怪的点：离挡路的东西至少一格，像素坐标成对排；头目要的地方更宽 */
  readonly spawns: Float32Array
  readonly bossSpawns: Float32Array
}

// ————————————————————————————— 形状 —————————————————————————————

function pick(rng: Rng, r: readonly [number, number]): number {
  return r[0] + rng.next() * (r[1] - r[0])
}

function pickInt(rng: Rng, r: readonly [number, number]): number {
  return r[0] + Math.floor(rng.next() * (r[1] - r[0] + 1))
}

/** 线段 ab 上离 (px, py) 最近处的参数 t（0 到 1） */
export function along(px: number, py: number, a: Point, b: Point): number {
  const ex = b.x - a.x
  const ey = b.y - a.y
  return Math.max(0, Math.min(1, ((px - a.x) * ex + (py - a.y) * ey) / (ex * ex + ey * ey || 1)))
}

/** (px, py) 离线段 ab 多远 */
export function segDist(px: number, py: number, a: Point, b: Point): number {
  const t = along(px, py, a, b)
  return Math.hypot(px - a.x - (b.x - a.x) * t, py - a.y - (b.y - a.y) * t)
}

/** 晶洞在方位角 a 上的半径，像素 */
export function geodeRadius(g: Geode, a: number): number {
  const w = g.wob
  return g.r * (1 + w[0]! * Math.sin(a + w[1]!) + w[2]! * Math.sin(2 * a + w[3]!) + w[4]! * Math.sin(3 * a + w[5]!))
}

/** (x, y) 在晶洞的边以内多深，像素，洞外为负 */
export function geodeDepth(g: Geode, x: number, y: number): number {
  const dx = x - g.x
  const dy = y - g.y
  return geodeRadius(g, Math.atan2(dy, dx)) - Math.hypot(dx, dy)
}

/** (x, y) 在洞厅的边以内多深，像素：几个晶洞取最深的，边再按噪声起伏 */
export function hallDepth(L: Pick<AmethystLayout, 'chambers' | 'wobble' | 'wave' | 'seed'>, x: number, y: number): number {
  let best = -Infinity
  for (const g of L.chambers) best = Math.max(best, geodeDepth(g, x, y))
  return best + L.wobble * 2.4 * (fbm(x / L.wave, y / L.wave, L.seed + 11, 2) - 0.5)
}

/** (x, y) 在暗道里多深，像素，暗道外为负：洞道时宽时窄，尽头是小晶洞 */
export function tunnelDepth(t: Tunnel, seed: number, x: number, y: number): number {
  const k = 0.86 + 0.28 * fbm(x / (1.4 * UNIT), y / (1.4 * UNIT), seed + 211, 2)
  let best = -Infinity
  const p = t.path
  for (let i = 0; i + 1 < p.length; i++) best = Math.max(best, t.half * k - segDist(x, y, p[i]!, p[i + 1]!))
  const end = p[p.length - 1]!
  return Math.max(best, t.pocket * (0.92 + 0.16 * k) - Math.hypot(x - end.x, y - end.y))
}

/** 塌顶在方位角 a 上的半径，像素 */
export function breachRadius(b: Breach, a: number): number {
  const f = ((((a / (Math.PI * 2)) % 1) + 1) % 1) * RIM
  const i = Math.floor(f)
  const t = f - i
  return b.r * (b.rim[i % RIM]! * (1 - t) + b.rim[(i + 1) % RIM]! * t)
}

/** (x, y) 在塌顶以内多深，像素 */
export function breachDepth(b: Breach, x: number, y: number): number {
  const dx = x - b.x
  const dy = y - b.y
  return breachRadius(b, Math.atan2(dy, dx)) - Math.hypot(dx, dy)
}

/** (x, y) 在顶缝以内多深，像素：按最近的一段折线插出那里的半宽 */
export function riftDepth(r: Rift, x: number, y: number): number {
  let best = -Infinity
  for (let i = 0; i + 1 < r.pts.length; i++) {
    const a = r.pts[i]!
    const b = r.pts[i + 1]!
    const t = along(x, y, a, b)
    const half = r.half[i]! + (r.half[i + 1]! - r.half[i]!) * t
    best = Math.max(best, half - Math.hypot(x - a.x - (b.x - a.x) * t, y - a.y - (b.y - a.y) * t))
  }
  return best
}

/** 洞顶上 (x, y) 正上方有多少是天：开口里为 1，边上 soft 像素内平滑过渡 */
export function skyAbove(L: Pick<AmethystLayout, 'breaches' | 'rifts'>, x: number, y: number, soft: number): number {
  let best = -Infinity
  for (const b of L.breaches) {
    if (Math.abs(x - b.x) > b.r * 1.6 + soft || Math.abs(y - b.y) > b.r * 1.6 + soft) continue
    best = Math.max(best, breachDepth(b, x, y))
  }
  for (const r of L.rifts) best = Math.max(best, riftDepth(r, x, y))
  return ease(-soft, soft, best)
}

/** 伸出去不到截面半径这么多倍的晶体算直立的：俯看是个正六边形，看到的全是尖端的锥面 */
export const UPRIGHT = 0.35

/** (dx, dy) 在顶点朝 dir 摆着的单位正六边形里的“半径”：边上为 1 */
export function hexNorm(dx: number, dy: number, dir: number): number {
  let m = 0
  for (let k = 0; k < 3; k++) {
    const a = dir + Math.PI / 6 + (k * Math.PI) / 3
    m = Math.max(m, Math.abs(dx * Math.cos(a) + dy * Math.sin(a)))
  }
  return m / (Math.sqrt(3) / 2)
}

/** 一根晶体按它自己的轴量 (x, y)：s 是沿着它伸出的方向离底多远，u 是往右侧偏多远，像素 */
export function prismFrame(p: Prism, x: number, y: number): { s: number; u: number } {
  const c = Math.cos(p.dir)
  const sn = Math.sin(p.dir)
  const dx = x - p.x
  const dy = y - p.y
  return { s: dx * c + dy * sn, u: dx * -sn + dy * c }
}

/** 晶体俯看时的轮廓在 s 处有多宽（半宽，像素）：从底往外是截面那么宽，尖端那一截收成一点；轮廓外为负 */
export function prismHalf(p: Prism, s: number): number {
  const tip = Math.min(p.reach + p.r, Math.max(p.r * 1.4, (p.reach + p.r) * 0.32))
  const end = p.reach + p.r * 0.6
  if (s < -p.r * 0.7 || s > end) return -1
  if (s < end - tip) return p.r
  return (p.r * (end - s)) / tip
}

/** 一根晶体在 (x, y) 处顶上离地多高，米；不在它的轮廓里为 0 */
export function prismHeight(p: Prism, x: number, y: number): number {
  if (p.reach < p.r * UPRIGHT) {
    const d = hexNorm(x - p.x, y - p.y, p.dir) / p.r
    return d >= 1 ? 0 : p.top * (1 - 0.35 * d)
  }
  const { s, u } = prismFrame(p, x, y)
  const w = prismHalf(p, s)
  if (w <= 0 || Math.abs(u) > w) return 0
  const k = clamp01((s + p.r) / (p.reach + p.r * 1.6))
  return p.top * (0.3 + 0.7 * k) * (1 - 0.3 * (u / w) ** 2)
}

/** 巨晶按它的轴量 (x, y)：s 是从根到尖离根多远，u 是往右侧偏多远，len 是根到尖的长，像素 */
export function beamFrame(b: Beam, x: number, y: number): { s: number; u: number; len: number } {
  const ex = b.tip.x - b.root.x
  const ey = b.tip.y - b.root.y
  const len = Math.hypot(ex, ey) || 1
  const dx = x - b.root.x
  const dy = y - b.root.y
  return { s: (dx * ex + dy * ey) / len, u: (dx * -ey + dy * ex) / len, len }
}

/** 巨晶俯看时在 s 处的半宽，像素：尖端那一截收成一点；轮廓外为负 */
export function beamHalf(b: Beam, s: number, len: number): number {
  const tip = b.r * 1.15
  if (s < 0 || s > len) return -1
  return s < len - tip ? b.r : (b.r * (len - s)) / tip
}

/** 巨晶在 (x, y) 处顶上离地多高，米：一面着地的六棱柱，顶面平、两侧的斜面往外落到侧棱，根部抬起；不在轮廓里为 0 */
export function beamHeight(b: Beam, x: number, y: number): number {
  const { s, u, len } = beamFrame(b, x, y)
  const w = beamHalf(b, s, len)
  if (w <= 0 || Math.abs(u) > w) return 0
  const rm = b.r / UNIT
  const apothem = (Math.sqrt(3) / 2) * rm
  const axis = apothem + b.lift * (1 - s / len)
  const k = w / b.r
  const q = Math.abs(u) / w
  const rise = q <= 0.5 ? apothem : Math.sqrt(3) * rm * (1 - q)
  return axis * (0.6 + 0.4 * k) + rise * k
}

/** 地上那颗晶洞在 (x, y) 处离地多高，米：壳沿一圈隆起，里面凹进去；不在它上面为 0 */
export function noduleHeight(n: Nodule, x: number, y: number): number {
  const d = Math.hypot(x - n.x, y - n.y) / n.r
  if (d >= 1) return 0
  if (d > 0.62) return n.h * Math.sin(((1 - d) / 0.38) * Math.PI * 0.5) ** 0.6
  return -0.14 * (1 - d / 0.62)
}

/** 一丛晶体在 (x, y) 处顶上离地多高，米 */
export function clusterHeight(c: Cluster, x: number, y: number): number {
  let top = 0
  for (const p of c.prisms) top = Math.max(top, prismHeight(p, x, y))
  return top
}

// ————————————————————————————— 桶 —————————————————————————————

/** 按每样东西罩住的范围（像素）把它们分进一格一格的桶，桶的格子一格边长 */
function makeBins(x0: number, y0: number, w: number, h: number, groups: readonly (readonly { x: number; y: number; reach: number }[])[]): Bins {
  const cols = Math.ceil(w / UNIT)
  const rows = Math.ceil(h / UNIT)
  const lists: number[][] = Array.from({ length: cols * rows }, () => [])
  groups.forEach((g, kind) => {
    g.forEach((it, idx) => {
      const c0 = Math.max(0, Math.floor((it.x - it.reach - x0) / UNIT))
      const c1 = Math.min(cols - 1, Math.floor((it.x + it.reach - x0) / UNIT))
      const r0 = Math.max(0, Math.floor((it.y - it.reach - y0) / UNIT))
      const r1 = Math.min(rows - 1, Math.floor((it.y + it.reach - y0) / UNIT))
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) lists[r * cols + c]!.push(kind * 65536 + idx)
    })
  })
  const start = new Int32Array(cols * rows + 1)
  const items: number[] = []
  for (let i = 0; i < lists.length; i++) {
    start[i] = items.length
    for (const v of lists[i]!) items.push(v)
  }
  start[lists.length] = items.length
  return { cols, rows, x0, y0, start, items: new Int32Array(items) }
}

/** (x, y) 所在那一格桶里的条目，从 from 到 to */
export function binAt(b: Bins, x: number, y: number): { from: number; to: number } {
  const c = Math.floor((x - b.x0) / UNIT)
  const r = Math.floor((y - b.y0) / UNIT)
  if (c < 0 || r < 0 || c >= b.cols || r >= b.rows) return { from: 0, to: 0 }
  const i = r * b.cols + c
  return { from: b.start[i]!, to: b.start[i + 1]! }
}

// ————————————————————————————— 查询 —————————————————————————————

/** (x, y) 的碎晶有多密，0 到 1：塌顶下的坡、顶缝下那一道 */
export function debrisAt(L: AmethystLayout, x: number, y: number): number {
  let cover = 0
  const { from, to } = binAt(L.bins, x, y)
  for (let k = from; k < to; k++) {
    const code = L.bins.items[k]!
    const kind = code >> 16
    if (kind === BIN.mound) {
      const m = L.mounds[code & 0xffff]!
      const d = Math.hypot(x - m.x, y - m.y) / m.r + 0.16 * (fbm(x / (0.8 * UNIT), y / (0.8 * UNIT), L.seed + 23, 2) - 0.5)
      cover = Math.max(cover, ease(1.02, 0.86, d))
    } else if (kind === BIN.rift) {
      const r = L.rifts[code & 0xffff]!
      const d = riftDepth(r, x, y) + STRIP_PAD_U * UNIT + 0.2 * UNIT * (fbm(x / (0.5 * UNIT), y / (0.5 * UNIT), L.seed + 29, 2) - 0.5)
      cover = Math.max(cover, ease(-0.05 * UNIT, 0.08 * UNIT, d))
    }
  }
  return cover
}

/** (x, y) 处矮得跨得过去的晶体顶多高，米：矮晶丛与地上的晶洞；没有为 0 */
export function lowAt(L: AmethystLayout, x: number, y: number): number {
  let top = 0
  const { from, to } = binAt(L.bins, x, y)
  for (let k = from; k < to; k++) {
    const code = L.bins.items[k]!
    const kind = code >> 16
    if (kind === BIN.druse) {
      const d = L.druse[code & 0xffff]!
      if (Math.hypot(x - d.x, y - d.y) < d.r) top = Math.max(top, d.h)
    } else if (kind === BIN.nodule) {
      const n = L.nodules[code & 0xffff]!
      if (Math.hypot(x - n.x, y - n.y) < n.r) top = Math.max(top, n.h)
    }
  }
  return top
}

/** (x, y) 处挡路的晶体顶多高，米：晶簇与巨晶；没有为 0 */
export function tallAt(L: AmethystLayout, x: number, y: number): number {
  let top = 0
  const { from, to } = binAt(L.bins, x, y)
  for (let k = from; k < to; k++) {
    const code = L.bins.items[k]!
    const kind = code >> 16
    if (kind === BIN.cluster) {
      const c = L.clusters[code & 0xffff]!
      if (Math.hypot(x - c.x, y - c.y) < c.r) top = Math.max(top, c.h)
    } else if (kind === BIN.beam) {
      const b = L.beams[code & 0xffff]!
      const f = beamFrame(b, x, y)
      if (f.s >= 0 && f.s <= f.len && Math.abs(f.u) < b.r) top = Math.max(top, (Math.sqrt(3) * b.r) / UNIT + b.lift * (1 - f.s / f.len))
    }
  }
  return top
}

/** (x, y) 离最近的晶洞边多远（像素，晶洞外为正）与是哪一个：洞壁上长满晶体的那一圈按它画；暗道的洞壁离哪个晶洞都远 */
export function liningAt(L: AmethystLayout, x: number, y: number): { gap: number; geode: Geode | null } {
  let gap = Infinity
  let geode: Geode | null = null
  for (const g of L.chambers) {
    const d = -geodeDepth(g, x, y)
    if (d < gap) {
      gap = d
      geode = g
    }
  }
  for (const g of L.pockets) {
    const d = -geodeDepth(g, x, y)
    if (d < gap) {
      gap = d
      geode = g
    }
  }
  return { gap, geode }
}

/**
 * 这一点的高度，米：洞底的起伏、塌顶下的碎晶坡、顶缝下那道碎晶、地上晶洞的壳沿、晶簇与巨晶；洞壁从洞底弯上洞顶，像晶洞的内壁那样起先陡、越往上越平
 */
export function heightM(L: AmethystLayout, x: number, y: number): number {
  const wall = -roomAt(L.shell, x, y)
  if (wall > 0) {
    const d = Math.min(1, wall / (L.wallU * UNIT))
    return L.ceilingM * Math.sqrt(1 - (1 - d) * (1 - d))
  }
  let z = 0.12 * (fbm(x / (2.8 * UNIT), y / (2.8 * UNIT), L.seed + 5, 2) - 0.5)
  let top = 0
  const { from, to } = binAt(L.bins, x, y)
  for (let k = from; k < to; k++) {
    const code = L.bins.items[k]!
    const kind = code >> 16
    const idx = code & 0xffff
    if (kind === BIN.mound) {
      const m = L.mounds[idx]!
      const d = Math.hypot(x - m.x, y - m.y) / m.r
      if (d < 1) z += m.h * (1 - d * d) ** 1.5 * (0.8 + 0.4 * fbm(x / (0.6 * UNIT), y / (0.6 * UNIT), L.seed + 19, 2))
    } else if (kind === BIN.rift) {
      const d = riftDepth(L.rifts[idx]!, x, y) + STRIP_PAD_U * UNIT
      if (d > 0) z += 0.16 * Math.min(1, d / (0.3 * UNIT)) * (0.6 + 0.8 * fbm(x / (0.3 * UNIT), y / (0.3 * UNIT), L.seed + 31, 2))
    } else if (kind === BIN.nodule) {
      const h = noduleHeight(L.nodules[idx]!, x, y)
      if (h > 0) top = Math.max(top, h)
      else z += h
    } else if (kind === BIN.cluster) top = Math.max(top, clusterHeight(L.clusters[idx]!, x, y))
    else if (kind === BIN.druse) top = Math.max(top, clusterHeight(L.druse[idx]!, x, y))
    else if (kind === BIN.beam) top = Math.max(top, beamHeight(L.beams[idx]!, x, y))
  }
  return Math.max(z, top)
}

/**
 * 挡光的高度，米：洞厅的洞壁按 heightM 弯上洞顶，暗道与它尽头的小晶洞是在岩体里凿出来的，洞壁直上直下顶到洞顶——
 * 暗道与洞厅之间那道薄岩体也挡得住光，光照不进拐过弯的地方
 */
export function blockM(L: AmethystLayout, x: number, y: number): number {
  if (roomAt(L.shell, x, y) < 0) {
    let tunnel = -Infinity
    for (const t of L.tunnels) tunnel = Math.max(tunnel, tunnelDepth(t, L.seed, x, y))
    if (tunnel > hallDepth(L, x, y)) return L.ceilingM
  }
  return heightM(L, x, y)
}

// ————————————————————————————— 生成 —————————————————————————————

/** 三组谐波的幅度（加起来是 jitter）与相位 */
function wobbleOf(rng: Rng, jitter: number): number[] {
  const a = [rng.next(), rng.next(), rng.next()]
  const sum = a[0]! + a[1]! + a[2]!
  return [(a[0]! / sum) * jitter, rng.next() * 6.283, (a[1]! / sum) * jitter, rng.next() * 6.283, (a[2]! / sum) * jitter, rng.next() * 6.283]
}

/** 圆心从 (cx, cy) 沿方位 a 往外挪，半径 r 的圆还整个落在 box 里时最远挪多远，像素 */
function reachIn(box: Rect, cx: number, cy: number, a: number, r: number): number {
  const c = Math.cos(a)
  const s = Math.sin(a)
  let d = Infinity
  if (c > 1e-6) d = Math.min(d, (box.x + box.w - r - cx) / c)
  if (c < -1e-6) d = Math.min(d, (box.x + r - cx) / c)
  if (s > 1e-6) d = Math.min(d, (box.y + box.h - r - cy) / s)
  if (s < -1e-6) d = Math.min(d, (box.y + r - cy) / s)
  return Math.max(0, d)
}

/** 从 (cx, cy) 沿方位 a 往外走到第一次出了地面的那一点；一直没出去为 null */
function wallAlong(b: Basin, cx: number, cy: number, a: number): Point | null {
  if (roomAt(b, cx, cy) <= 0) return null
  const c = Math.cos(a)
  const s = Math.sin(a)
  for (let d = 0; d < FRAME.w; d += 0.2 * UNIT) {
    const x = cx + c * d
    const y = cy + s * d
    if (roomAt(b, x, y) <= 0) return { x, y }
  }
  return null
}

/** 塌下来的洞顶留下的轮廓：大体是圆，按谐波起伏，再一格格地参差，有几处缺口往里崩进去 */
function jaggedRim(rng: Rng, jitter: number): number[] {
  const w = wobbleOf(rng, jitter * 0.6)
  const raw: number[] = []
  for (let k = 0; k < RIM; k++) {
    const a = (k / RIM) * Math.PI * 2
    raw.push(1 + w[0]! * Math.sin(a + w[1]!) + w[2]! * Math.sin(2 * a + w[3]!) + w[4]! * Math.sin(3 * a + w[5]!) + (rng.next() - 0.5) * jitter * 0.7)
  }
  const notches = 1 + Math.floor(rng.next() * 3)
  for (let n = 0; n < notches; n++) {
    const at = Math.floor(rng.next() * RIM)
    const span = 1 + Math.floor(rng.next() * 3)
    const depth = 0.12 + rng.next() * 0.16
    for (let k = -span; k <= span; k++) raw[(at + k + RIM) % RIM]! -= depth * (1 - Math.abs(k) / (span + 1))
  }
  return raw.map((v, k) => 0.25 * raw[(k + RIM - 1) % RIM]! + 0.5 * v + 0.25 * raw[(k + 1) % RIM]!)
}

/** 一丛晶体：一两根直立在中间，其余绕着中心朝外斜着长；越往外斜得越厉害，伸出去不超过底半径 r；按从矮到高排，好让高的盖住矮的 */
function grow(rng: Rng, x: number, y: number, r: number, h: number, count: number): Prism[] {
  const out: Prism[] = []
  const tone = rng.next()
  const turn = rng.next() * Math.PI * 2
  const upright = count > 6 ? 3 : count > 4 ? 2 : 1
  for (let k = 0; k < count; k++) {
    const center = k < upright
    const dir = center ? rng.next() * Math.PI * 2 : turn + ((k - upright + 0.5 * rng.next()) / (count - upright)) * Math.PI * 2
    const top = h * (center ? 0.8 + 0.2 * rng.next() : 0.5 + 0.35 * rng.next())
    const tilt = center ? rng.next() * 0.2 : 0.25 + rng.next() * 0.5
    const pr = r * (center ? 0.32 + 0.1 * rng.next() : 0.2 + 0.1 * rng.next())
    const off = center ? r * 0.15 * rng.next() : r * 0.2 * rng.next()
    const reach = Math.min(r - pr - off, Math.tan(tilt) * top * UNIT)
    out.push({ x: x + Math.cos(dir) * off, y: y + Math.sin(dir) * off, dir, reach: Math.max(0, reach), r: pr, top, tone: clamp01(tone + (rng.next() - 0.5) * 0.4) })
  }
  return out.sort((a, b) => a.top - b.top)
}

/** 在 [lo, hi] 里按 t（0 到 1）取 */
function lerp(r: readonly [number, number], t: number): number {
  return r[0] + (r[1] - r[0]) * clamp01(t)
}

/**
 * 按种子生成紫晶洞：主晶洞摆在方框中间，几个小晶洞绕着它叠上去连成洞厅；从洞壁往岩体深处挑几条拐弯的暗道，尽头各是一颗小晶洞；
 * 主晶洞上塌开一处洞顶，小晶洞上可能也塌了，洞顶裂开几道缝，塌下来的碎晶堆在下面；巨晶从洞壁斜伸进洞厅，晶簇长在洞壁脚下与洞厅里，
 * 地上半埋着几颗小晶洞，矮晶丛散在各处；最后算出能走的地面与距离场：挡路的晶体若把哪一块地方堵死了就撤掉
 */
export function makeAmethyst(cfg: AmethystConfig, map: Rect, rng: Rng): AmethystLayout {
  const seed = Math.floor(rng.next() * 0x7fffffff)
  const ch = cfg.chambers
  const cx = FRAME_MID.x
  const cy = FRAME_MID.y
  const rim = ch.rimU * UNIT
  const inner: Rect = { x: map.x + rim, y: map.y + rim, w: map.w - rim * 2, h: map.h - rim * 2 }
  const wobble = ch.wobbleU * UNIT
  const wave = ch.waveU * UNIT
  const spill = (r: number): number => r * (1 + ch.jitter) + wobble
  // 主晶洞：偏离方框中心一点，整个落在地图里
  const a0 = rng.next() * Math.PI * 2
  const d0 = rng.next() * ch.driftU * UNIT
  let mainR = pick(rng, ch.mainU) * UNIT
  const mx = cx + Math.cos(a0) * d0
  const my = cy + Math.sin(a0) * d0
  for (let k = 0; k < 8; k++) {
    const room = Math.min(mx - inner.x, inner.x + inner.w - mx, my - inner.y, inner.y + inner.h - my)
    if (spill(mainR) <= room) break
    mainR = (room - wobble) / (1 + ch.jitter)
  }
  const chambers: Geode[] = [{ x: mx, y: my, r: mainR, wob: wobbleOf(rng, ch.jitter) }]
  // 小晶洞：各朝地图的一条边叠出去，往外挪到地图边为止；四个角留给暗道
  const sides = pickInt(rng, ch.sideCount)
  const turn0 = (rng.next() - 0.5) * 0.5
  const axes = [0, 1, 2, 3].sort(() => rng.next() - 0.5).slice(0, sides)
  for (const axis of axes) {
    const a = turn0 + (axis + (rng.next() - 0.5) * 0.2) * Math.PI * 0.5
    let r = pick(rng, ch.sideU) * UNIT
    for (let t = 0; t < 6; t++) {
      const want = mainR + r - pick(rng, ch.overlapU) * UNIT
      const most = reachIn(inner, mx, my, a, spill(r))
      const d = Math.min(want, most)
      if (d >= mainR + r - ch.overlapU[1] * UNIT * 1.6 && d > mainR - r * 0.2) {
        chambers.push({ x: mx + Math.cos(a) * d, y: my + Math.sin(a) * d, r, wob: wobbleOf(rng, ch.jitter) })
        break
      }
      r *= 0.88
    }
  }
  const hall = { chambers, wobble, wave, seed }
  const inMap = (x: number, y: number): boolean => x > map.x + 0.5 * UNIT && y > map.y + 0.5 * UNIT && x < map.x + map.w - 0.5 * UNIT && y < map.y + map.h - 0.5 * UNIT
  const cols = Math.ceil(FRAME.w / CELL)
  const rows = Math.ceil(FRAME.h / CELL)
  const neck = ch.neckU * UNIT
  const bare = makeBasin((x, y) => inMap(x, y) && hallDepth(hall, x, y) > 0, FRAME.x, FRAME.y, cols, rows, CELL, FRAME_MID, neck)
  const tunnels = digTunnels(cfg, rng, bare, inner, chambers)
  const pockets: Geode[] = tunnels.map((t) => {
    const end = t.path[t.path.length - 1]!
    return { x: end.x, y: end.y, r: t.pocket, wob: wobbleOf(rng, 0.08) }
  })
  const inTunnel = (x: number, y: number): boolean => tunnels.some((t) => tunnelDepth(t, seed, x, y) > 0)
  // 洞顶的开口
  const op = cfg.openings
  const breaches: Breach[] = []
  const fits = (b: Breach, pad: number): boolean => {
    if (roomAt(bare, b.x, b.y) < pad) return false
    for (let k = 0; k < RIM; k += 2) {
      const a = (k / RIM) * Math.PI * 2
      const r = b.r * b.rim[k]!
      if (roomAt(bare, b.x + Math.cos(a) * r, b.y + Math.sin(a) * r) < pad) return false
    }
    return true
  }
  // 主晶洞上的塌顶：离出生点不远不近，整个开在洞厅上方；落不下就一点点缩小，实在落不下就开在主晶洞正中
  for (let tries = 0; tries < TRIES * 2 && breaches.length === 0; tries++) {
    const a = rng.next() * Math.PI * 2
    const off = pick(rng, op.breachOffsetU) * UNIT
    const r = pick(rng, op.breachU) * UNIT * (1 - tries / (TRIES * 4))
    const b = { x: cx + Math.cos(a) * off, y: cy + Math.sin(a) * off, r, rim: jaggedRim(rng, op.jitter) }
    if (fits(b, 0.8 * UNIT)) breaches.push(b)
  }
  if (breaches.length === 0) breaches.push({ x: mx, y: my, r: op.breachU[0] * UNIT * 0.6, rim: jaggedRim(rng, op.jitter) })
  const mainBreachR = breaches[0]!.r
  const apart = (x: number, y: number, r: number): boolean => breaches.every((b) => Math.hypot(b.x - x, b.y - y) - (b.r + r) * (1 + op.jitter) >= op.gapU * UNIT)
  const sideBreaches = Math.min(pickInt(rng, op.sideBreaches), chambers.length - 1)
  const order = chambers.slice(1).sort(() => rng.next() - 0.5)
  for (const g of order.slice(0, sideBreaches)) {
    for (let tries = 0; tries < TRIES; tries++) {
      const a = rng.next() * Math.PI * 2
      const off = rng.next() * g.r * 0.35
      const r = pick(rng, op.sideBreachU) * UNIT
      const b = { x: g.x + Math.cos(a) * off, y: g.y + Math.sin(a) * off, r, rim: jaggedRim(rng, op.jitter) }
      if (!fits(b, 0.6 * UNIT) || !apart(b.x, b.y, r)) continue
      breaches.push(b)
      break
    }
  }
  const rifts: Rift[] = []
  const riftCount = pickInt(rng, op.rifts)
  const riftGap = (r: Rift, other: Rift): number => {
    let gap = Infinity
    r.pts.forEach((p, i) => other.pts.forEach((q, j) => (gap = Math.min(gap, Math.hypot(p.x - q.x, p.y - q.y) - r.half[i]! - other.half[j]!))))
    return gap
  }
  for (let tries = 0; tries < riftCount * TRIES * 2 && rifts.length < riftCount; tries++) {
    const x = inner.x + rng.next() * inner.w
    const y = inner.y + rng.next() * inner.h
    if (roomAt(bare, x, y) < 2 * UNIT) continue
    const a = rng.next() * Math.PI
    const len = pick(rng, op.riftLenU) * UNIT
    const width = pick(rng, op.riftWidthU) * UNIT
    const n = 7
    const pts: Point[] = []
    const half: number[] = []
    let zig = 0
    for (let i = 0; i < n; i++) {
      zig = zig * 0.4 + (rng.next() - 0.5) * 0.55 * UNIT
      const t = i / (n - 1) - 0.5
      pts.push({ x: x + Math.cos(a) * t * len - Math.sin(a) * zig, y: y + Math.sin(a) * t * len + Math.cos(a) * zig })
      half.push(Math.max(0.05 * UNIT, (width / 2) * Math.sin((Math.PI * i) / (n - 1)) ** 0.7 * (0.75 + 0.5 * rng.next())))
    }
    const r = { pts, half }
    const over = pts.every((p, i) => roomAt(bare, p.x, p.y) >= (i === 0 || i === n - 1 ? -0.35 * ch.wallU * UNIT : 0.25 * UNIT))
    if (!over) continue
    if (!pts.every((p, i) => apart(p.x, p.y, half[i]!) && tunnels.every((t) => tunnelDepth(t, seed, p.x, p.y) < -(half[i]! + 2 * UNIT)))) continue
    if (rifts.some((o) => riftGap(r, o) < op.gapU * UNIT)) continue
    rifts.push(r)
  }
  const mounds: Mound[] = breaches.map((b) => ({ x: b.x, y: b.y, r: b.r * op.debrisSpread, h: (op.debrisM * b.r) / mainBreachR }))
  const onDebris = (x: number, y: number, pad: number): boolean =>
    mounds.some((m) => Math.hypot(m.x - x, m.y - y) < m.r + pad) || rifts.some((r) => riftDepth(r, x, y) + (STRIP_PAD_U + 0.15) * UNIT + pad > 0)
  const nearTunnel = (x: number, y: number, pad: number): boolean => tunnels.some((t) => tunnelDepth(t, seed, x, y) + pad > 0)
  // 晶体
  const cr = cfg.crystals
  const clear = cr.clearU * UNIT
  const beams: Beam[] = []
  const beamCount = pickInt(rng, cr.beams)
  const beamGap = (b: Beam, x: number, y: number): number => segDist(x, y, b.root, b.tip) - b.r
  for (let tries = 0; tries < beamCount * TRIES * 2 && beams.length < beamCount; tries++) {
    const home = chambers[Math.floor(rng.next() * chambers.length)]!
    const wall = wallAlong(bare, home.x, home.y, rng.next() * Math.PI * 2)
    if (!wall) continue
    const n = awayFromWall(bare, wall.x, wall.y)
    if (n.x === 0 && n.y === 0) continue
    const turn = (rng.next() - 0.5) * 1.2
    const dir = { x: n.x * Math.cos(turn) - n.y * Math.sin(turn), y: n.x * Math.sin(turn) + n.y * Math.cos(turn) }
    const len = pick(rng, cr.beamLenU) * UNIT
    const r = pick(rng, cr.beamU) * UNIT
    const root = { x: wall.x - dir.x * 0.9 * UNIT, y: wall.y - dir.y * 0.9 * UNIT }
    const tip = { x: wall.x + dir.x * len, y: wall.y + dir.y * len }
    const b: Beam = { root, tip, r, lift: 0.4 + rng.next() * 0.7, tone: rng.next() }
    if (roomAt(bare, tip.x, tip.y) < r + 1.2 * UNIT) continue
    let open = true
    for (let s = r + 1.5 * UNIT; s <= len && open; s += 0.25 * UNIT) open = roomAt(bare, wall.x + dir.x * s, wall.y + dir.y * s) >= r + 0.9 * UNIT
    if (!open) continue
    if (segDist(cx, cy, root, tip) < clear + r) continue
    if (tunnels.some((t) => t.path.some((p) => segDist(p.x, p.y, root, tip) < r + t.half + 2 * UNIT))) continue
    if (beams.some((o) => Math.min(segDist(o.root.x, o.root.y, root, tip), segDist(o.tip.x, o.tip.y, root, tip), segDist(tip.x, tip.y, o.root, o.tip)) < r + o.r + 1.6 * UNIT)) continue
    beams.push(b)
  }
  const clusters: Cluster[] = []
  const clusterCount = pickInt(rng, cr.clusters)
  const [u0, u1] = cr.clusterU
  for (let tries = 0; tries < clusterCount * TRIES && clusters.length < clusterCount; tries++) {
    const r = pick(rng, cr.clusterU) * UNIT
    const x = inner.x + rng.next() * inner.w
    const y = inner.y + rng.next() * inner.h
    const room = roomAt(bare, x, y)
    const byWall = rng.next() < 0.6
    if (byWall ? room < r + 0.6 * UNIT || room > r + 2.2 * UNIT : room < r + 1.4 * UNIT) continue
    if (Math.hypot(x - cx, y - cy) < clear + r || onDebris(x, y, r) || nearTunnel(x, y, r + 1.5 * UNIT)) continue
    if (beams.some((b) => beamGap(b, x, y) < r + 1.4 * UNIT)) continue
    if (clusters.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + r + 1.5 * UNIT)) continue
    const h = lerp(cr.clusterM, ((r / UNIT - u0) / (u1 - u0 || 1)) * (0.8 + 0.4 * rng.next()))
    clusters.push({ x, y, r, h, prisms: grow(rng, x, y, r, h, 5 + Math.round((r / UNIT) * 6)) })
  }
  const nodules: Nodule[] = []
  const noduleCount = pickInt(rng, cr.geodes)
  for (let tries = 0; tries < noduleCount * TRIES * 2 && nodules.length < noduleCount; tries++) {
    const r = pick(rng, cr.geodeU) * UNIT
    const x = inner.x + rng.next() * inner.w
    const y = inner.y + rng.next() * inner.h
    if (roomAt(bare, x, y) < r + 0.8 * UNIT || Math.hypot(x - cx, y - cy) < clear + UNIT + r) continue
    if (onDebris(x, y, r) || nearTunnel(x, y, r + UNIT)) continue
    if (beams.some((b) => beamGap(b, x, y) < r + UNIT) || clusters.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + r + UNIT)) continue
    if (nodules.some((n) => Math.hypot(n.x - x, n.y - y) < 4 * UNIT)) continue
    nodules.push({ x, y, r, h: cr.geodeM, turn: rng.next() * Math.PI * 2 })
  }
  const druse: Cluster[] = []
  const druseCount = pickInt(rng, cr.druse)
  const [d0u, d1u] = cr.druseU
  for (let tries = 0; tries < druseCount * TRIES && druse.length < druseCount; tries++) {
    const r = pick(rng, cr.druseU) * UNIT
    let x: number
    let y: number
    const roll = rng.next()
    if (roll < 0.45 && clusters.length > 0) {
      const c = clusters[Math.floor(rng.next() * clusters.length)]!
      const a = rng.next() * Math.PI * 2
      const d = c.r + r + (0.15 + rng.next() * 1.1) * UNIT
      x = c.x + Math.cos(a) * d
      y = c.y + Math.sin(a) * d
    } else {
      x = inner.x + rng.next() * inner.w
      y = inner.y + rng.next() * inner.h
    }
    const room = roomAt(bare, x, y)
    if (roll >= 0.45 && roll < 0.75 ? room < r + 0.25 * UNIT || room > r + 1.2 * UNIT : room < r + 0.4 * UNIT) continue
    if (Math.hypot(x - cx, y - cy) < clear * 0.6 + r || onDebris(x, y, r) || nearTunnel(x, y, r + 0.6 * UNIT)) continue
    if (clusters.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + r + 0.1 * UNIT) || beams.some((b) => beamGap(b, x, y) < r + 0.15 * UNIT)) continue
    if (nodules.some((n) => Math.hypot(n.x - x, n.y - y) < n.r + r + 0.3 * UNIT) || druse.some((d) => Math.hypot(d.x - x, d.y - y) < d.r + r + 0.15 * UNIT)) continue
    const h = lerp(cr.druseM, ((r / UNIT - d0u) / (d1u - d0u || 1)) * (0.75 + 0.5 * rng.next()))
    druse.push({ x, y, r, h, prisms: grow(rng, x, y, r, h, 3 + Math.floor(rng.next() * 3)) })
  }
  // 能走的地面：挡路的晶体若把哪一块地方与出生点隔开了，就撤掉离那里最近的一个
  const walkable = (x: number, y: number): boolean => inMap(x, y) && (hallDepth(hall, x, y) > 0 || inTunnel(x, y))
  const shell = makeBasin(walkable, FRAME.x, FRAME.y, cols, rows, CELL, FRAME_MID, neck)
  let basin = carveBlockers(shell, walkable, clusters, beams, cols, rows, neck)
  for (let k = 0; k < 6; k++) {
    const lost = lostCells(shell, basin, clusters, beams)
    if (lost.length * CELL * CELL <= 1.5 * UNIT * UNIT) break
    // 堵住那块地方的是离被隔开的格子最近的那个
    const stride = Math.max(1, Math.floor(lost.length / 200))
    const closest = (gap: (x: number, y: number) => number): number => {
      let best = Infinity
      for (let i = 0; i < lost.length; i += stride) best = Math.min(best, gap(lost[i]!.x, lost[i]!.y))
      return best
    }
    const cGaps = clusters.map((c) => closest((x, y) => Math.hypot(x - c.x, y - c.y) - c.r))
    const bGaps = beams.map((b) => closest((x, y) => beamGap(b, x, y)))
    const ci = cGaps.indexOf(Math.min(...cGaps))
    const bi = bGaps.indexOf(Math.min(...bGaps))
    if (ci < 0 && bi < 0) break
    if (bi >= 0 && (ci < 0 || bGaps[bi]! < cGaps[ci]!)) beams.splice(bi, 1)
    else clusters.splice(ci, 1)
    basin = carveBlockers(shell, walkable, clusters, beams, cols, rows, neck)
  }
  const field: Rect = { x: map.x - FIELD_PAD_U * UNIT, y: map.y - FIELD_PAD_U * UNIT, w: map.w + FIELD_PAD_U * 2 * UNIT, h: map.h + FIELD_PAD_U * 2 * UNIT }
  const bins = makeBins(field.x, field.y, field.w, field.h, [
    mounds.map((m) => ({ x: m.x, y: m.y, reach: m.r * 1.2 })),
    rifts.map((r) => {
      const a = r.pts[0]!
      const b = r.pts[r.pts.length - 1]!
      const mid = r.pts[r.pts.length >> 1]!
      return { x: mid.x, y: mid.y, reach: Math.hypot(b.x - a.x, b.y - a.y) / 2 + (STRIP_PAD_U + 1.2) * UNIT }
    }),
    clusters.map((c) => ({ x: c.x, y: c.y, reach: c.r * 1.25 + 0.6 * UNIT })),
    beams.map((b) => ({ x: (b.root.x + b.tip.x) / 2, y: (b.root.y + b.tip.y) / 2, reach: Math.hypot(b.tip.x - b.root.x, b.tip.y - b.root.y) / 2 + b.r + 0.6 * UNIT })),
    nodules.map((n) => ({ x: n.x, y: n.y, reach: n.r * 1.3 + 0.3 * UNIT })),
    druse.map((d) => ({ x: d.x, y: d.y, reach: d.r * 1.3 + 0.3 * UNIT })),
  ])
  const spawns: number[] = []
  const bossSpawns: number[] = []
  const step = 0.5 * UNIT
  for (let y = map.y + step / 2; y < map.y + map.h; y += step) {
    for (let x = map.x + step / 2; x < map.x + map.w; x += step) {
      const room = roomAt(basin, x, y)
      if (room >= UNIT) spawns.push(x, y)
      if (room >= 1.6 * UNIT) bossSpawns.push(x, y)
    }
  }
  return {
    map,
    field,
    seed,
    ceilingM: ch.ceilingM,
    wallU: ch.wallU,
    wobble,
    wave,
    chambers,
    pockets,
    tunnels,
    breaches,
    rifts,
    mounds,
    clusters,
    beams,
    nodules,
    druse,
    basin,
    shell,
    bins,
    spawns: new Float32Array(spawns),
    bossSpawns: new Float32Array(bossSpawns),
  }
}

/**
 * 暗道：从每个晶洞的中心朝四面八方看出去，洞壁上的每一点都试着往岩体里走 outU 格上下、再朝左或朝右拐过去（拐得越急越好），
 * 拐过去的那一段与尽头的小晶洞离洞厅都隔着至少 rockU 格岩体、整个落在地图里；先挑岩体最厚的，彼此从主晶洞看过去在方位上分开
 */
function digTunnels(cfg: AmethystConfig, rng: Rng, bare: Basin, inner: Rect, chambers: readonly Geode[]): Tunnel[] {
  const tn = cfg.tunnels
  const half = (tn.widthU * UNIT) / 2
  const pocket = tn.pocketU * UNIT
  const rock = tn.rockU * UNIT
  const main = chambers[0]!
  const inside = (p: Point, pad: number): boolean => p.x - pad >= inner.x && p.y - pad >= inner.y && p.x + pad <= inner.x + inner.w && p.y + pad <= inner.y + inner.h
  // 拐过弯以后从尽头的小晶洞看不见洞厅：小晶洞里的几点到洞口一带的直线都要穿过岩体
  const hidden = (wall: Point, n: Point, p1: Point, p2: Point): boolean => {
    const inPassage = (x: number, y: number): boolean => roomAt(bare, x, y) > 0 || segDist(x, y, wall, p1) < half || segDist(x, y, p1, p2) < half || Math.hypot(x - p2.x, y - p2.y) < pocket
    const targets = [
      { x: wall.x, y: wall.y },
      { x: wall.x - n.y * half * 0.9, y: wall.y + n.x * half * 0.9 },
      { x: wall.x + n.y * half * 0.9, y: wall.y - n.x * half * 0.9 },
      { x: wall.x + n.x * 2 * UNIT, y: wall.y + n.y * 2 * UNIT },
    ]
    const eyes = [p2, ...[0, 1, 2, 3].map((k) => ({ x: p2.x + Math.cos((k * Math.PI) / 2) * pocket * 0.7, y: p2.y + Math.sin((k * Math.PI) / 2) * pocket * 0.7 }))]
    return eyes.every((e) =>
      targets.every((q) => {
        const len = Math.hypot(q.x - e.x, q.y - e.y)
        for (let s = 0; s < len; s += 0.2 * UNIT) if (!inPassage(e.x + ((q.x - e.x) * s) / len, e.y + ((q.y - e.y) * s) / len)) return true
        return false
      }),
    )
  }
  const cands: { a: number; path: Point[]; score: number }[] = []
  const steps = 72
  for (const home of chambers) {
    for (let i = 0; i < steps; i++) {
      const wall = wallAlong(bare, home.x, home.y, (i / steps) * Math.PI * 2)
      if (!wall) continue
      const n = awayFromWall(bare, wall.x, wall.y)
      if (n.x === 0 && n.y === 0) continue
      const ox = -n.x
      const oy = -n.y
      for (const side of rng.next() < 0.5 ? [-1, 1] : [1, -1]) {
        let found: Point[] | null = null
        for (const bend of [Math.PI / 2, Math.PI * 0.42]) {
          for (const reach of [1, 1.3]) {
            for (const f of [1, 0.5, 0]) {
              if (found) break
              const out = tn.outU * reach * UNIT
              const turn = (tn.turnU[0] + (tn.turnU[1] - tn.turnU[0]) * f) * UNIT
              const tx = ox * Math.cos(bend) - oy * Math.sin(bend) * side
              const ty = oy * Math.cos(bend) + ox * Math.sin(bend) * side
              const p0 = { x: wall.x + n.x * 0.4 * UNIT, y: wall.y + n.y * 0.4 * UNIT }
              const p1 = { x: wall.x + ox * out, y: wall.y + oy * out }
              const p2 = { x: p1.x + tx * turn, y: p1.y + ty * turn }
              let ok = inside(p1, half) && inside(p2, pocket) && roomAt(bare, p2.x, p2.y) <= -(pocket + rock)
              for (let s = 0.75 * UNIT; ok && s <= out; s += 0.25 * UNIT) ok = roomAt(bare, wall.x + ox * s, wall.y + oy * s) <= -0.5 * s
              for (let s = 0; ok && s <= turn; s += 0.25 * UNIT) {
                const p = { x: p1.x + tx * s, y: p1.y + ty * s }
                ok = inside(p, half) && roomAt(bare, p.x, p.y) <= -(half + rock)
              }
              if (ok && hidden(wall, n, p1, p2)) found = [p0, p1, p2]
            }
          }
        }
        if (!found) continue
        const end = found[2]!
        cands.push({ a: Math.atan2(end.y - main.y, end.x - main.x), path: found, score: -roomAt(bare, end.x, end.y) + rng.next() * 0.5 * UNIT })
      }
    }
  }
  const want = pickInt(rng, tn.count)
  const chosen: { a: number; path: Point[]; dots: Point[] }[] = []
  const minTurn = (Math.PI * 2) / (tn.count[1] + 1)
  const da = (p: number, q: number): number => Math.abs(((p - q + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
  // 洞道上每隔半格一点，出了洞厅一格半以后的才比：两条暗道的洞口可以挨着，进了岩体就要分开
  const dotsOf = (path: readonly Point[]): Point[] => {
    const out: Point[] = []
    let walked = 0
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i]!
      const b = path[i + 1]!
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      for (let s = 0; s < len; s += 0.5 * UNIT) if (walked + s >= 1.5 * UNIT) out.push({ x: a.x + ((b.x - a.x) * s) / len, y: a.y + ((b.y - a.y) * s) / len })
      walked += len
    }
    out.push(path[path.length - 1]!)
    return out
  }
  for (const c of cands.sort((p, q) => q.score - p.score)) {
    if (chosen.length >= want) break
    if (chosen.some((o) => da(o.a, c.a) < minTurn * 0.9)) continue
    const dots = dotsOf(c.path)
    if (!chosen.every((o) => o.dots.every((p) => dots.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= 2 * (pocket + rock))))) continue
    chosen.push({ ...c, dots })
  }
  return chosen.map(({ path: [p0, p1, p2] }) => {
    const a = p0!
    const b = p1!
    const c = p2!
    const ux = (c.x - b.x) / (Math.hypot(c.x - b.x, c.y - b.y) || 1)
    const uy = (c.y - b.y) / (Math.hypot(c.x - b.x, c.y - b.y) || 1)
    const vx = (b.x - a.x) / (Math.hypot(b.x - a.x, b.y - a.y) || 1)
    const vy = (b.y - a.y) / (Math.hypot(b.x - a.x, b.y - a.y) || 1)
    // 洞道不是直的：往外那段在中间朝拐弯的那侧歪一点，拐过去那段朝岩体深处歪一点
    const m0 = { x: (a.x + b.x) / 2 + ux * (rng.next() - 0.3) * 0.35 * UNIT, y: (a.y + b.y) / 2 + uy * (rng.next() - 0.3) * 0.35 * UNIT }
    const m1 = { x: (b.x + c.x) / 2 + vx * rng.next() * 0.3 * UNIT, y: (b.y + c.y) / 2 + vy * rng.next() * 0.3 * UNIT }
    return { path: [a, m0, b, m1, c], turn: 2, half, pocket }
  })
}

/** 挡路的晶体：晶簇是圆，巨晶是两头圆的长条；按精确的距离挖进能走的地面，栅格化出来的边是锯齿 */
function carveBlockers(shell: Basin, walkable: (x: number, y: number) => boolean, clusters: readonly Cluster[], beams: readonly Beam[], cols: number, rows: number, neck: number): Basin {
  const blocked = (x: number, y: number): boolean => clusters.some((c) => Math.hypot(x - c.x, y - c.y) < c.r) || beams.some((b) => segDist(x, y, b.root, b.tip) < b.r)
  const basin = makeBasin((x, y) => walkable(x, y) && !blocked(x, y), shell.x0, shell.y0, cols, rows, CELL, FRAME_MID, neck)
  const fix = (x0: number, y0: number, x1: number, y1: number, sdf: (x: number, y: number) => number): void => {
    const c0 = Math.max(0, Math.floor((x0 - basin.x0) / CELL))
    const c1 = Math.min(cols - 1, Math.ceil((x1 - basin.x0) / CELL))
    const r0 = Math.max(0, Math.floor((y0 - basin.y0) / CELL))
    const r1 = Math.min(rows - 1, Math.ceil((y1 - basin.y0) / CELL))
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * cols + c
        const d = sdf(basin.x0 + (c + 0.5) * CELL, basin.y0 + (r + 0.5) * CELL)
        if (d < basin.room[i]!) basin.room[i] = d
      }
    }
  }
  const pad = 2 * UNIT
  for (const c of clusters) fix(c.x - c.r - pad, c.y - c.r - pad, c.x + c.r + pad, c.y + c.r + pad, (x, y) => Math.hypot(x - c.x, y - c.y) - c.r)
  for (const b of beams) {
    fix(Math.min(b.root.x, b.tip.x) - b.r - pad, Math.min(b.root.y, b.tip.y) - b.r - pad, Math.max(b.root.x, b.tip.x) + b.r + pad, Math.max(b.root.y, b.tip.y) + b.r + pad, (x, y) => segDist(x, y, b.root, b.tip) - b.r)
  }
  return basin
}

/** 洞厅里本该走得到、却被挡路的晶体隔开的格子（格心，像素）：紧贴着晶体的不算，窄缝本来就填平 */
function lostCells(shell: Basin, basin: Basin, clusters: readonly Cluster[], beams: readonly Beam[]): Point[] {
  const out: Point[] = []
  for (let r = 0; r < shell.rows; r++) {
    for (let c = 0; c < shell.cols; c++) {
      const i = r * shell.cols + c
      if (shell.room[i]! <= CELL || basin.room[i]! > 0) continue
      const x = shell.x0 + (c + 0.5) * CELL
      const y = shell.y0 + (r + 0.5) * CELL
      if (clusters.some((k) => Math.hypot(x - k.x, y - k.y) - k.r < 0.6 * UNIT) || beams.some((b) => segDist(x, y, b.root, b.tip) - b.r < 0.6 * UNIT)) continue
      out.push({ x, y })
    }
  }
  return out
}
