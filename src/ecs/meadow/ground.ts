import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { cellEdge, cellNearest, fbm, valueNoise } from '../../util/noise'
import { Rng } from '../../util/rng'
import { beyondFence, footAt, forestDepth, toLocal, toMap, WALL_U } from './layout'
import type { Local, MeadowPlan, Tree } from './layout'
import type { MeadowConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 树冠贴图每格多少像素：树冠边是软的，用不着地面那么细 */
export const CANOPY_PPU = 16
/** 草浪着色器用的草地遮罩每格多少像素 */
export const MASK_PPU = 4
/** 山脚碎石坡的坡顶比草地高多少，米：再往上是岩壁 */
const SCREE_M = 0.6
/** 往太阳方向最远找这么远（格）挡光的地形：岩壁两三米高，影子拖不了这么远 */
const TERRAIN_SHADOW_U = 9
/** 上山路口的石堆：半径（格）与高（米） */
const CAIRN = { r: 0.24, h: 0.8 } as const
/** 边界与高度的场按这么细的格子先算好，画的时候插值，格 */
const FIELD_U = 0.25
/** 树与投影按这么大（格）的格子分桶，画一个像素只看附近几桶 */
const BUCKET_U = 2
/** 树影最多拖出这么远（格） */
const TREE_SHADOW_U = 4.5

const LX = SUN.x
const LY = SUN.y
const LZ = SUN.z
/** 太阳在地面上的方向（单位向量） */
const SUN_LEN = Math.hypot(LX, LY)
const TO_SUN = { x: LX / SUN_LEN, y: LY / SUN_LEN }

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const fract = (v: number): number => v - Math.floor(v)
/** 两个数据位置的整数哈希，落在 [0, 1) */
function hash1(a: number, b: number): number {
  return fract(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453)
}

/** 画地面与树冠用到的那部分地图：只有数据，能整个发给画画的线程 */
export interface PaintScene {
  readonly cfg: MeadowConfig
  readonly plan: MeadowPlan
}

/** 地图上以格计的一块：左上角与宽高 */
export interface Area {
  readonly x0: number
  readonly y0: number
  readonly w: number
  readonly h: number
}

/** 贴图上以像素计的一块：[x0, x1) × [y0, y1) */
export interface PixelRect {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

export type PaintLayer = 'ground' | 'canopy'

/** 发给画画的线程：先 setup 一次，再一块一块要 paint */
export type PaintJob = { readonly kind: 'setup'; readonly scene: PaintScene } | { readonly kind: 'paint'; readonly index: number; readonly layer: PaintLayer; readonly rect: PixelRect }

/** 画好的一块：像素在 rect 的范围里逐行排；index 是它在这批活里的序号 */
export interface PaintPiece {
  readonly index: number
  readonly layer: PaintLayer
  readonly rect: PixelRect
  readonly pixels: Uint8ClampedArray<ArrayBuffer>
}

/** 装得下一块像素的缓冲：按 rect 逐行排 */
export function pixelBuffer(rect: PixelRect): Uint8ClampedArray<ArrayBuffer> {
  return new Uint8ClampedArray((rect.x1 - rect.x0) * (rect.y1 - rect.y0) * 4)
}

/** 地面与树冠铺满地图外 padU 格 */
export function groundArea(sc: PaintScene): Area {
  const pad = sc.cfg.padU
  return { x0: -pad, y0: -pad, w: sc.plan.size + pad * 2, h: sc.plan.size + pad * 2 }
}

const PPU: Record<PaintLayer, number> = { ground: GROUND_PPU, canopy: CANOPY_PPU }

/** 一层贴图的大小，像素 */
export function textureSize(sc: PaintScene, layer: PaintLayer): { w: number; h: number } {
  const a = groundArea(sc)
  return { w: Math.round(a.w * PPU[layer]), h: Math.round(a.h * PPU[layer]) }
}

/**
 * 地形上一格的场：离山脚多远（格，草地那边为正）、山脚在这里的斜率（顺着山脚每格往里多少格）、这一段山脚的碎石坡多宽（格），
 * 林缘、栅栏各离多远（格），地面多高（米），被地形挡住多少太阳；格点 (i, j) 在 (x0 + i·cell, y0 + j·cell)
 */
interface Fields {
  readonly x0: number
  readonly y0: number
  readonly cell: number
  readonly cols: number
  readonly rows: number
  readonly foot: Float32Array
  readonly slope: Float32Array
  readonly apron: Float32Array
  readonly forest: Float32Array
  readonly fence: Float32Array
  readonly height: Float32Array
  readonly shade: Float32Array
}

/** 一段投影或一段细东西：从 a 到 b、半宽 w（格），影子的浓淡 */
interface Segment {
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
  readonly w: number
  readonly k: number
}

/** 按位置分桶：键是桶的行列，值是条目的序号 */
interface Buckets {
  readonly x0: number
  readonly y0: number
  readonly cols: number
  readonly map: Map<number, number[]>
}

const NONE: readonly number[] = []

function bucketKey(bk: Buckets, x: number, y: number): number {
  return Math.floor((y - bk.y0) / BUCKET_U) * bk.cols + Math.floor((x - bk.x0) / BUCKET_U)
}

function near(bk: Buckets, x: number, y: number): readonly number[] {
  return bk.map.get(bucketKey(bk, x, y)) ?? NONE
}

/** 把一个外接框为 [x0, x1] × [y0, y1] 的条目记进它罩住的每一桶 */
function file(bk: Buckets, k: number, x0: number, y0: number, x1: number, y1: number): void {
  for (let by = Math.floor((y0 - bk.y0) / BUCKET_U); by <= Math.floor((y1 - bk.y0) / BUCKET_U); by++) {
    for (let bx = Math.floor((x0 - bk.x0) / BUCKET_U); bx <= Math.floor((x1 - bk.x0) / BUCKET_U); bx++) {
      const key = by * bk.cols + bx
      let list = bk.map.get(key)
      if (!list) bk.map.set(key, (list = []))
      list.push(k)
    }
  }
}

function buckets(area: Area): Buckets {
  return { x0: area.x0 - BUCKET_U * 2, y0: area.y0 - BUCKET_U * 2, cols: Math.ceil(area.w / BUCKET_U) + 8, map: new Map() }
}

function segmentBuckets(area: Area, segs: readonly Segment[], reach: number): Buckets {
  const bk = buckets(area)
  segs.forEach((s, k) => file(bk, k, Math.min(s.ax, s.bx) - s.w - reach, Math.min(s.ay, s.by) - s.w - reach, Math.max(s.ax, s.bx) + s.w + reach, Math.max(s.ay, s.by) + s.w + reach))
  return bk
}

/** 点到线段的距离 */
function segDist(s: Segment, x: number, y: number): number {
  const ex = s.bx - s.ax
  const ey = s.by - s.ay
  const l2 = ex * ex + ey * ey || 1e-12
  const t = clamp01(((x - s.ax) * ex + (y - s.ay) * ey) / l2)
  const dx = x - s.ax - ex * t
  const dy = y - s.ay - ey * t
  return Math.sqrt(dx * dx + dy * dy)
}

/** 一团叶簇：圆心、半径（格）与顶高（米） */
interface Clump {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly top: number
}

/** 云杉从上往下看：几层枝轮一层压一层，越往上越小越高；每层一圈枝条，几条、转多少（圈） */
interface Spruce {
  readonly tiers: number
  readonly n: readonly number[]
  readonly phase: readonly number[]
}

/** 山脚的一块石头：圆心、半径（格）与高（米）；新落下的发白，老的长着地衣 */
interface Boulder {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly h: number
  readonly fresh: boolean
}

/** 画之前先算一次的东西 */
export interface Prepared {
  readonly fields: Fields
  readonly crowns: Buckets
  readonly treeShadows: Buckets
  readonly shadowAt: readonly { readonly x: number; readonly y: number; readonly r: number; readonly soft: number }[]
  readonly clumps: readonly (readonly Clump[])[]
  readonly spruce: readonly Spruce[]
  readonly casts: readonly Segment[]
  readonly castBuckets: Buckets
  readonly paths: readonly Segment[]
  readonly pathBuckets: Buckets
  readonly trail: readonly Segment[]
  readonly trailBuckets: Buckets
  readonly climb: readonly Segment[]
  readonly climbBuckets: Buckets
  readonly wood: readonly Segment[]
  readonly woodBuckets: Buckets
  readonly stones: readonly Boulder[]
  readonly stoneBuckets: Buckets
  readonly cairn: Point
  readonly flowerCdf: readonly number[]
}

/** 每米高的东西在地上投下多长的影子（格）：背着太阳 */
function shadowPerM(cfg: MeadowConfig): Point {
  return { x: -LX / LZ / cfg.meterPerU, y: -LY / LZ / cfg.meterPerU }
}

/** 上山路口在本地坐标里顺着山脚的位置 */
function headB(plan: MeadowPlan): number {
  return toLocal(plan.frame, plan.trailhead.x, plan.trailhead.y, { a: 0, b: 0 }).b
}

/** 一段山脚：碎石坡多宽（格）、岩壁多高（米）、岩壁在这里塌下去多少（0 到 1） */
interface Wall {
  readonly apron: number
  readonly wallH: number
  readonly notch: number
}

/** 顺着山脚 b 处这一段：上山路口那儿岩壁塌下去一个豁口，落石把碎石坡堆宽了 */
function wallAt(sc: PaintScene, b: number, head: number): Wall {
  const c = sc.cfg.cliff
  const seed = sc.plan.seed
  const fill = Math.exp(-(((b - head) / 1.8) ** 2))
  const apron = c.screeU[0] + (c.screeU[1] - c.screeU[0]) * clamp01((fbm(b / 4.5, 1.3, seed + 211, 2) - 0.3) * 2.5) + 0.7 * fill
  const wallH = c.heightM[0] + (c.heightM[1] - c.heightM[0]) * clamp01((fbm(b / 6, 7.7, seed + 213, 2) - 0.3) * 2.5)
  return { apron, wallH, notch: 0.6 * Math.exp(-(((b - head) / 1.2) ** 2)) }
}

/** 山坡上顺着坡向的石棱与沟：顺着山脚 b、出了山脚 s 格处，石棱上大、沟里小，在 [0, 1] 里；棱与沟弯弯曲曲、时宽时窄 */
function ribAt(seed: number, b: number, s: number): number {
  const bb = b + (fbm(b * 0.3, s * 0.3, seed + 219, 2) - 0.5) * 2.2
  return valueNoise(bb * 1.3, s * 0.35, seed + 215) * 0.7 + valueNoise(bb * 3.1, s * 0.6, seed + 217) * 0.3
}

/**
 * 草地与山的高度，米。草地从山脚往外缓缓降低、带着起伏，林子里的地面略高；顺着山脚 b、出了山脚 s 格（顺着山脚的法向量量）：
 * 碎石坡越往里越陡，接着一级岩壁，再往上是顺着坡向一道道石棱与沟的山坡
 */
function heightAt(sc: PaintScene, foot: number, b: number, s: number, wall: Wall, forest: number, x: number, y: number): number {
  const t = sc.cfg.turf
  const seed = sc.plan.seed
  const base = (fbm(x / t.waveU, y / t.waveU, seed + 5, 3) - 0.5) * 2 * t.reliefM + 0.25 * smooth(0, 3, forest)
  if (s <= 0) return base - t.riseM * foot
  if (s < wall.apron) return base + SCREE_M * (s / wall.apron) ** 1.5
  const w = s - wall.apron
  if (w < WALL_U) return base + SCREE_M + wall.wallH * (1 - wall.notch) * smooth(0, WALL_U, w)
  const up = w - WALL_U
  // 豁口只在崖顶一截：往上一格多就回到整面山坡的高度
  return base + SCREE_M + wall.wallH * (1 - wall.notch * smooth(1.4, 0, up)) + sc.cfg.cliff.riseM * up + (ribAt(seed, b, s) - 0.5) * 0.18 * smooth(0, 1.2, up)
}

function makeFields(sc: PaintScene): Fields {
  const area = groundArea(sc)
  const cell = FIELD_U
  const cols = Math.ceil(area.w / cell) + 2
  const rows = Math.ceil(area.h / cell) + 2
  const n = cols * rows
  const foot = new Float32Array(n)
  const slope = new Float32Array(n)
  const apron = new Float32Array(n)
  const forest = new Float32Array(n)
  const fence = new Float32Array(n)
  const height = new Float32Array(n)
  const shade = new Float32Array(n)
  const plan = sc.plan
  const e = plan.edges
  const head = headB(plan)
  const L: Local = { a: 0, b: 0 }
  // 山总沿着地图的一条边，b 只随行或列变：山脚与这一段的岩壁按 b 记下来，同一个 b 只算一次
  const feet = new Map<number, number>()
  const footOf = (b: number): number => {
    let v = feet.get(b)
    if (v === undefined) feet.set(b, (v = footAt(e, b)))
    return v
  }
  const walls = new Map<number, Wall>()
  const wallOf = (b: number): Wall => {
    let v = walls.get(b)
    if (v === undefined) walls.set(b, (v = wallAt(sc, b, head)))
    return v
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = area.x0 + i * cell
      const y = area.y0 + j * cell
      toLocal(plan.frame, x, y, L)
      const k = j * cols + i
      const ft = L.a - footOf(L.b)
      const sl = (footOf(L.b + 0.05) - footOf(L.b - 0.05)) / 0.1
      const w = wallOf(L.b)
      const fd = forestDepth(e, L.a, L.b)
      foot[k] = ft
      slope[k] = sl
      apron[k] = w.apron
      forest[k] = fd
      fence[k] = beyondFence(e, L.a, L.b)
      height[k] = heightAt(sc, ft, L.b, -ft / Math.sqrt(1 + sl * sl), w, fd, x, y)
    }
  }
  const f: Fields = { x0: area.x0, y0: area.y0, cell, cols, rows, foot, slope, apron, forest, fence, height, shade }
  // 每格往太阳方向找挡光的地形：岩壁与山坡比太阳的光线高出越多越暗
  const rise = (LZ / SUN_LEN) * sc.cfg.meterPerU
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = area.x0 + i * cell
      const y = area.y0 + j * cell
      const z = height[j * cols + i]!
      let over = 0
      for (let st = cell; st <= TERRAIN_SHADOW_U; st += cell) over = Math.max(over, sample(f, height, x + TO_SUN.x * st, y + TO_SUN.y * st) - z - st * rise)
      shade[j * cols + i] = smooth(0.02, 0.12, over)
    }
  }
  return f
}

/** 场里 (x, y) 格处按格点双线性取值 */
function sample(f: Fields, a: Float32Array, x: number, y: number): number {
  const u = Math.min(f.cols - 1.001, Math.max(0, (x - f.x0) / f.cell))
  const v = Math.min(f.rows - 1.001, Math.max(0, (y - f.y0) / f.cell))
  const ix = Math.floor(u)
  const iy = Math.floor(v)
  const fx = u - ix
  const fy = v - iy
  const i = iy * f.cols + ix
  const p = a[i]!
  const q = a[i + 1]!
  const r = a[i + f.cols]!
  const s = a[i + f.cols + 1]!
  return p + (q - p) * fx + (r - p) * fy + (p - q - r + s) * fx * fy
}

/** 一棵阔叶树或灌木的树冠由几团叶簇叠成：中间一团最高，外圈几团低一些；按树的序号定，每次画都一样 */
function clumpsOf(tr: Tree, k: number): Clump[] {
  const out: Clump[] = [{ x: tr.x, y: tr.y, r: tr.r * 0.62, top: tr.h }]
  const n = 6 + Math.floor(tr.r * 3)
  for (let i = 0; i < n; i++) {
    const h1 = hash1(k * 1.37, i * 2.11)
    const h2 = hash1(k * 3.91, i * 0.73 + 5)
    const a = i * 2.39996 + h1 * 0.8
    const rr = tr.r * (0.36 + 0.16 * h2)
    const dist = (tr.r - rr) * (0.55 + 0.45 * Math.sqrt(h1))
    out.push({ x: tr.x + Math.cos(a) * dist, y: tr.y + Math.sin(a) * dist, r: rr, top: tr.h * (0.92 - 0.1 * (dist / tr.r)) })
  }
  return out
}

/** 栅栏、门、饮水槽与倒木：顶视的木头与投在地上的影子；山脚的石头与路口的石堆也投下影子 */
function woodAndCasts(sc: PaintScene, stones: readonly Boulder[], cairn: Point): { wood: Segment[]; casts: Segment[] } {
  const { plan, cfg } = sc
  const sh = shadowPerM(cfg)
  const wood: Segment[] = []
  const casts: Segment[] = []
  const hM = cfg.fence.heightM
  const rails = [hM * 0.42, hM * 0.88]
  const posts = plan.posts
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i]!
    const w = p.gate ? 0.16 : 0.12
    const top = p.gate ? hM * 1.12 : hM
    wood.push({ ax: p.x, ay: p.y, bx: p.x + p.lx, by: p.y + p.ly, w, k: p.gate ? 2 : 1 })
    casts.push({ ax: p.x, ay: p.y, bx: p.x + p.lx + sh.x * top, by: p.y + p.ly + sh.y * top, w: w * 0.7, k: 0.22 })
    const q = posts[i + 1]
    if (!q) continue
    if (i === plan.gate.index) {
      // 门：上下两道横档、一道斜撑，顶视只看得见最上面那道，影子把整扇门的样子投在地上
      wood.push({ ax: p.x, ay: p.y, bx: q.x, by: q.y, w: 0.08, k: 2 })
      const bars: [number, number, number, number][] = [
        [0, 0.3, 1, 0.3],
        [0, hM * 0.95, 1, hM * 0.95],
        [0, 0.3, 1, hM * 0.95],
        [0.02, 0.3, 0.02, hM * 0.95],
        [0.98, 0.3, 0.98, hM * 0.95],
      ]
      for (const [s0, h0, s1, h1] of bars) {
        casts.push({
          ax: p.x + (q.x - p.x) * s0 + sh.x * h0,
          ay: p.y + (q.y - p.y) * s0 + sh.y * h0,
          bx: p.x + (q.x - p.x) * s1 + sh.x * h1,
          by: p.y + (q.y - p.y) * s1 + sh.y * h1,
          w: 0.04,
          k: 0.24,
        })
      }
      continue
    }
    wood.push({ ax: p.x + p.lx, ay: p.y + p.ly, bx: q.x + q.lx, by: q.y + q.ly, w: 0.065, k: 4 })
    for (const h of rails) casts.push({ ax: p.x + sh.x * h, ay: p.y + sh.y * h, bx: q.x + sh.x * h, by: q.y + sh.y * h, w: 0.04, k: 0.15 })
  }
  // 饮水槽
  const tr = plan.trough
  if (tr) {
    const h = 0.5
    const ax = tr.x - tr.ux * tr.len * 0.5
    const ay = tr.y - tr.uy * tr.len * 0.5
    casts.push({ ax: ax + sh.x * h, ay: ay + sh.y * h, bx: ax + tr.ux * tr.len + sh.x * h, by: ay + tr.uy * tr.len + sh.y * h, w: tr.wid * 0.5, k: 0.3 })
  }
  // 倒木：树干贴着地，影子很短；翻起的根盘立着，影子拖得长
  const lg = plan.log
  const dia = lg.r * 2 * cfg.meterPerU
  casts.push({ ax: lg.x - lg.ux * lg.len * 0.5 + sh.x * dia, ay: lg.y - lg.uy * lg.len * 0.5 + sh.y * dia, bx: lg.x + lg.ux * lg.len * 0.5 + sh.x * dia, by: lg.y + lg.uy * lg.len * 0.5 + sh.y * dia, w: lg.r * 0.8, k: 0.45 })
  const rx = lg.x + lg.ux * lg.root * (lg.len * 0.5 + 0.15)
  const ry = lg.y + lg.uy * lg.root * (lg.len * 0.5 + 0.15)
  casts.push({ ax: rx - lg.uy * 0.9, ay: ry + lg.ux * 0.9, bx: rx + lg.uy * 0.9 + sh.x * 1.2, by: ry - lg.ux * 0.9 + sh.y * 1.2, w: 0.45, k: 0.5 })
  // 石头与石堆：影子从脚下背着太阳拖出去
  for (const s of stones) casts.push({ ax: s.x, ay: s.y, bx: s.x + sh.x * s.h * 0.6, by: s.y + sh.y * s.h * 0.6, w: s.r * 0.85, k: 0.4 })
  casts.push({ ax: cairn.x, ay: cairn.y, bx: cairn.x + sh.x * CAIRN.h * 0.6, by: cairn.y + sh.y * CAIRN.h * 0.6, w: CAIRN.r * 0.7, k: 0.4 })
  return { wood, casts }
}

/** 路：草地上踩出来的路，加上门外伸进牧场的那段车辙；林子里的小路另算；山坡上还看得见那条之字形的上山小路，从岩壁的豁口往上拐出画面 */
function pathSegments(sc: PaintScene, head: number): { paths: Segment[]; trail: Segment[]; climb: Segment[] } {
  const plan = sc.plan
  const paths: Segment[] = []
  for (const line of plan.paths) for (let i = 0; i + 1 < line.length; i++) paths.push({ ax: line[i]!.x, ay: line[i]!.y, bx: line[i + 1]!.x, by: line[i + 1]!.y, w: 0.3, k: 1 })
  const g = plan.gate
  for (let s = 0; s < 4.8; s += 0.3) {
    const bend = Math.sin(s * 0.5) * 0.25
    const a = { x: g.x + g.ox * s + g.ux * bend, y: g.y + g.oy * s + g.uy * bend }
    const b = { x: g.x + g.ox * (s + 0.3) + g.ux * Math.sin((s + 0.3) * 0.5) * 0.25, y: g.y + g.oy * (s + 0.3) + g.uy * Math.sin((s + 0.3) * 0.5) * 0.25 }
    paths.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, w: 0.3, k: 1 - s / 4.8 })
  }
  const trail: Segment[] = []
  for (let i = 0; i + 1 < plan.trail.length; i++) trail.push({ ax: plan.trail[i]!.x, ay: plan.trail[i]!.y, bx: plan.trail[i + 1]!.x, by: plan.trail[i + 1]!.y, w: 0.34, k: 1 })
  const e = plan.edges
  const rng = new Rng(plan.seed ^ 0x2c1f)
  const pts: Point[] = []
  let b = head
  let s = wallAt(sc, head, head).apron + WALL_U - 0.15
  let dir = rng.next() < 0.5 ? -1 : 1
  pts.push(toMap(plan.frame, footAt(e, b) - s, b))
  while (s < sc.cfg.padU + 6) {
    const len = 2.2 + rng.next() * 1.4
    const rise = 0.9 + rng.next() * 0.5
    const steps = Math.ceil(len / 0.25)
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const bb = b + dir * len * t
      pts.push(toMap(plan.frame, footAt(e, bb) - s - rise * t, bb))
    }
    b += dir * len
    s += rise
    dir = -dir
  }
  const climb: Segment[] = []
  for (let i = 0; i + 1 < pts.length; i++) climb.push({ ax: pts[i]!.x, ay: pts[i]!.y, bx: pts[i + 1]!.x, by: pts[i + 1]!.y, w: 0.08, k: 1 })
  return { paths, trail, climb }
}

/** 山脚的石头：上山路口那儿新塌下来一片落石，堆在碎石坡上、堵着岩壁上的豁口；别处的碎石坡上零星躺着几块老石头 */
function stonesOf(sc: PaintScene, head: number): Boulder[] {
  const { plan, cfg } = sc
  const e = plan.edges
  const rng = new Rng(plan.seed ^ 0x5a17)
  const out: Boulder[] = []
  const put = (b: number, s: number, r: number, fresh: boolean): void => {
    const p = toMap(plan.frame, footAt(e, b) - s, b)
    if (out.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < (o.r + r) * 0.9)) return
    out.push({ x: p.x, y: p.y, r, h: r * 2 * cfg.meterPerU * 0.9, fresh })
  }
  for (let i = 0; i < 80 && out.length < 18; i++) {
    const b = head + (rng.next() + rng.next() - 1) * 2.6
    const w = wallAt(sc, b, head)
    put(b, 0.2 + rng.next() * (w.apron + WALL_U * 0.5 - 0.2), 0.1 + rng.next() * rng.next() * 0.24, true)
  }
  for (let b = -cfg.padU; b < plan.size + cfg.padU; b += 0.8) {
    if (rng.next() > 0.3 || Math.abs(b - head) < 3.2) continue
    const w = wallAt(sc, b, head)
    put(b, 0.25 + rng.next() * (w.apron - 0.4), 0.1 + rng.next() * 0.14, false)
  }
  return out
}

export function prepare(sc: PaintScene): Prepared {
  const area = groundArea(sc)
  const plan = sc.plan
  const crowns = buckets(area)
  plan.trees.forEach((t, k) => file(crowns, k, t.x - t.r - 0.1, t.y - t.r - 0.1, t.x + t.r + 0.1, t.y + t.r + 0.1))
  const sh = shadowPerM(sc.cfg)
  const shLen = Math.hypot(sh.x, sh.y)
  const shadowAt = plan.trees.map((t) => {
    const off = Math.min(TREE_SHADOW_U, t.h * 0.62 * shLen)
    return { x: t.x + (sh.x / shLen) * off, y: t.y + (sh.y / shLen) * off, r: t.r * 0.9, soft: 0.35 + t.h * 0.06 }
  })
  const treeShadows = buckets(area)
  shadowAt.forEach((s, k) => file(treeShadows, k, s.x - s.r - s.soft, s.y - s.r - s.soft, s.x + s.r + s.soft, s.y + s.r + s.soft))
  const head = headB(plan)
  const stones = stonesOf(sc, head)
  const stoneBuckets = buckets(area)
  stones.forEach((s, k) => file(stoneBuckets, k, s.x - s.r - 0.1, s.y - s.r - 0.1, s.x + s.r + 0.1, s.y + s.r + 0.1))
  const cairn = toMap(plan.frame, footAt(plan.edges, head + 0.6) + 0.42, head + 0.6)
  const { wood, casts } = woodAndCasts(sc, stones, cairn)
  const { paths, trail, climb } = pathSegments(sc, head)
  let acc = 0
  const flowerCdf = plan.flowers.map((w) => (acc += w))
  return {
    fields: makeFields(sc),
    crowns,
    treeShadows,
    shadowAt,
    clumps: plan.trees.map((t, k) => (t.kind === 'spruce' ? [] : clumpsOf(t, k))),
    spruce: plan.trees.map((t, k) => {
      const tiers = 3 + Math.min(2, Math.floor(t.r))
      const n0 = 10 + hash1(k, 9) * 4
      return {
        tiers,
        n: Array.from({ length: tiers }, (_, j) => Math.max(6, Math.round(n0 * (1 - (j / tiers) * 0.55)))),
        phase: Array.from({ length: tiers }, (_, j) => hash1(k + j * 3.1, 11)),
      }
    }),
    casts,
    castBuckets: segmentBuckets(area, casts, 0.3),
    paths,
    pathBuckets: segmentBuckets(area, paths, 0.4),
    trail,
    trailBuckets: segmentBuckets(area, trail, 0.4),
    climb,
    climbBuckets: segmentBuckets(area, climb, 0.2),
    wood,
    woodBuckets: segmentBuckets(area, wood, 0.2),
    stones,
    stoneBuckets,
    cairn,
    flowerCdf,
  }
}

/** 离一组分了桶的线段最近多远：返回距离减半宽，没有就是 Infinity；顺带记下最近那条的序号与权重 */
function nearestSeg(segs: readonly Segment[], bk: Buckets, x: number, y: number, out: { i: number; k: number }): number {
  let best = Infinity
  for (const i of near(bk, x, y)) {
    const s = segs[i]!
    const d = segDist(s, x, y) - s.w
    if (d < best) {
      best = d
      out.i = i
      out.k = s.k
    }
  }
  return best
}

const PICK = { i: 0, k: 0 }

/** 几种野花：花瓣与花心的颜色 */
const FLOWER_PETAL = [
  [242, 240, 230],
  [246, 206, 46],
  [150, 138, 214],
  [228, 168, 192],
  [214, 86, 138],
] as const
const FLOWER_EYE = [
  [236, 192, 52],
  [214, 164, 28],
  [112, 98, 182],
  [244, 214, 226],
  [240, 160, 190],
] as const

/** 几种石色：暖灰、冷灰、带铁锈的褐灰 */
const STONES = [
  [128, 124, 114],
  [108, 112, 112],
  [122, 110, 96],
] as const

function pickFlower(cdf: readonly number[], u: number): number {
  for (let i = 0; i < cdf.length; i++) if (u < cdf[i]!) return i
  return cdf.length - 1
}

/**
 * 地面：草地是一片片深浅不一的草，叶子顺着山风斜着长，成片地开着几种野花；靠林子的一边草更深更绿、长着蕨，靠山的一边草短、散着碎石。
 * 出了山脚是山：碎石坡、一级岩壁，再往上是石棱与沟交错的山坡，石缝里长着高山草甸，高处的洼地里积着残雪；上山路口新塌下来一片落石，
 * 盖住碎石坡、堵着岩壁上的豁口，豁口上面那条之字形的上山小路还看得见。草地上有踩出来的路通向栅栏门、林间小路与上山路口，路口垒着一堆石头。
 * 栅栏外是羊啃过的牧场，草短而匀，有羊踩出的小道，栅栏底下一溜没啃到的高草；林子里是针叶与苔藓，小路被一棵倒下的云杉横着拦住。
 * 栅栏、门与饮水槽是木头的。按高度场打光，往太阳方向找挡光的地形投下影子，树、栅栏、倒木与石头也背着太阳投下影子；离草地越远越暗。只画 rect 那一块
 */
export function paintGround(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const area = groundArea(sc)
  const plan = sc.plan
  const cfg = sc.cfg
  const f = prep.fields
  const seed = plan.seed
  const ppu = GROUND_PPU
  const w = rect.x1 - rect.x0
  const wx = plan.wind.x
  const wy = plan.wind.y
  const fl = cfg.flowers
  const bloomAt = 0.5 + (0.5 - fl.cover) * 0.3
  const lg = plan.log
  const tr = plan.trough
  const mpu = cfg.meterPerU
  const e = FIELD_U
  const frame = plan.frame
  const L: Local = { a: 0, b: 0 }
  const head = headB(plan)
  const snowAt = 0.72 - cfg.cliff.snow * 0.3
  const cairn = prep.cairn
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = area.x0 + (px + 0.5) / ppu
      const y = area.y0 + (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      const foot = sample(f, f.foot, x, y)
      // 出了山脚多远（格，顺着山脚的法向量量），草地这边是负的
      const slope = foot < 0 ? sample(f, f.slope, x, y) : 0
      const s = -foot / Math.sqrt(1 + slope * slope)
      const forest = sample(f, f.forest, x, y)
      const fence = sample(f, f.fence, x, y)
      let r = 0
      let g = 0
      let b = 0
      const patch = fbm(x / 7, y / 7, seed + 3, 2)
      const mid = fbm(x / 2.2, y / 2.2, seed + 5, 2)
      const grain = valueNoise(x * 7, y * 7, seed + 9) * 0.5 + valueNoise(x * 17, y * 17, seed + 11) * 0.5
      const wForest = smooth(0, 0.9, forest)
      const wPasture = smooth(-0.08, 0.08, fence) * (1 - wForest)
      const wMeadow = Math.max(0, 1 - wForest - wPasture)
      const along = x * wx + y * wy
      const across = y * wx - x * wy
      const blade = valueNoise(along * 6 + across * 0.8, across * 22 - along * 2, seed + 13)
      const tuft = valueNoise(x * 3.3 + 7.1, y * 3.3, seed + 15)
      const tex = (0.93 + 0.08 * blade) * (0.94 + 0.12 * grain) * (0.93 + 0.12 * tuft)

      // 草地：大片的深浅按低频噪声，靠林子更深更绿，靠山更干更短
      if (wMeadow > 0) {
        const lush = smooth(-3, -0.4, forest)
        const stony = smooth(2.2, 0.3, foot)
        const dry = clamp01(smooth(0.42, 0.74, patch) * 0.75 - lush * 0.45 + stony * 0.25)
        const green = clamp01(0.5 + (mid - 0.5) * 1.2 + lush * 0.3)
        let mr = (94 + (66 - 94) * green + (150 - 94) * dry) * tex
        let mg = (126 + (106 - 126) * green + (140 - 126) * dry) * tex
        let mb = (50 + (42 - 50) * green + (78 - 50) * dry) * tex
        // 野花：成片地开，每片有一种开得最多
        const bloom = fbm(x / fl.patchU, y / fl.patchU, seed + 19, 2)
        const dens = smooth(bloomAt - 0.02, bloomAt + 0.12, bloom) * (1 - lush * 0.7) * smooth(0.4, 1.4, foot)
        if (dens > 0) {
          const q = cellNearest(x * 4, y * 4, seed + 17)
          if (q.h < dens * 0.6) {
            const rad = 0.17 + 0.09 * fract(q.h * 13.7)
            const d = Math.sqrt(q.dx * q.dx + q.dy * q.dy)
            if (d < rad) {
              const main = cellNearest(x / (fl.patchU * 0.8), y / (fl.patchU * 0.8), seed + 23).h
              const kind = pickFlower(prep.flowerCdf, fract(q.h * 7.31) < 0.72 ? main : fract(q.h * 3.17 + 0.5))
              const eye = d < rad * (kind === 1 ? 0.25 : 0.38)
              const c = eye ? FLOWER_EYE[kind]! : FLOWER_PETAL[kind]!
              const lit = 0.88 + 0.22 * ((-q.dx * LX - q.dy * LY) / (d + 1e-6)) * smooth(0, rad, d)
              const a = smooth(rad, rad * 0.75, d)
              mr += (c[0] * lit - mr) * a
              mg += (c[1] * lit - mg) * a
              mb += (c[2] * lit - mb) * a
            }
          }
        }
        // 林缘的蕨：一丛丛羽状的叶子
        const fern = smooth(-1.7, -0.7, forest) * smooth(0.5, 0, forest)
        if (fern > 0) {
          const q = cellNearest(x * 1.4, y * 1.4, seed + 61)
          if (q.h > 0.25) {
            const ang = q.h * 40
            const cu = q.dx * Math.cos(ang) + q.dy * Math.sin(ang)
            const cv = -q.dx * Math.sin(ang) + q.dy * Math.cos(ang)
            const len = 0.55
            const t = cu / len
            const width = 0.2 * (1 - t * t)
            if (Math.abs(t) < 1 && Math.abs(cv) < width) {
              const pinna = 0.55 + 0.45 * Math.abs(Math.sin(cu * 55 + Math.sign(cv) * 1.2))
              const lit = 0.8 + 0.35 * clamp01(0.5 - cv / width)
              const a = fern * smooth(width, width * 0.6, Math.abs(cv)) * pinna
              mr += (76 * lit - mr) * a
              mg += (112 * lit - mg) * a
              mb += (42 * lit - mb) * a
            }
          }
        }
        r += mr * wMeadow
        g += mg * wMeadow
        b += mb * wMeadow
      }

      // 牧场：羊啃过的草短而匀，羊踩出一条条小道；栅栏底下一溜没啃到的高草
      if (wPasture > 0) {
        const p2 = fbm(x / 5, y / 5, seed + 81, 2)
        let pr = (122 + (p2 - 0.5) * 30) * (0.94 + 0.1 * grain)
        let pg = (136 + (p2 - 0.5) * 22) * (0.94 + 0.1 * grain)
        let pb = (70 + (p2 - 0.5) * 12) * (0.94 + 0.1 * grain)
        const track = smooth(0.02, 0, Math.abs(fbm(x / 3.2, y / 3.2, seed + 83, 2) - 0.5)) * 0.3
        pr += (150 - pr) * track
        pg += (138 - pg) * track
        pb += (100 - pb) * track
        const rough = smooth(0.45, 0.1, Math.abs(fence)) * (0.7 + 0.3 * tuft)
        pr += (78 * tex - pr) * rough
        pg += (104 * tex - pg) * rough
        pb += (46 * tex - pb) * rough
        r += pr * wPasture
        g += pg * wPasture
        b += pb * wPasture
      }

      // 林子里：针叶铺地，一片片苔藓，落着球果
      if (wForest > 0) {
        const needle = 0.82 + 0.3 * valueNoise(x * 14 + y * 3, y * 14 - x * 3, seed + 87)
        let fr = 66 * needle
        let fg = 52 * needle
        let fb = 38 * needle
        const moss = smooth(0.5, 0.68, fbm(x / 2.5, y / 2.5, seed + 91, 2))
        fr += (62 * needle - fr) * moss
        fg += (86 * needle - fg) * moss
        fb += (42 * needle - fb) * moss
        const cone = cellNearest(x * 2.2, y * 2.2, seed + 93)
        if (cone.h > 0.7) {
          const d = Math.hypot(cone.dx * 1.6, cone.dy)
          const a = smooth(0.12, 0.08, d)
          fr += (92 - fr) * a
          fg += (64 - fg) * a
          fb += (40 - fb) * a
        }
        // 林子里那段小路
        const td = nearestSeg(prep.trail, prep.trailBuckets, x, y, PICK)
        if (td < 0.15) {
          const a = smooth(0.15, -0.05, td + (valueNoise(x * 4, y * 4, seed + 95) - 0.5) * 0.12)
          fr += (98 * (0.9 + 0.2 * grain) - fr) * a
          fg += (80 * (0.9 + 0.2 * grain) - fg) * a
          fb += (60 * (0.9 + 0.2 * grain) - fb) * a
        }
        r += fr * wForest
        g += fg * wForest
        b += fb * wForest
      }

      // 踩出来的路：中间是光秃的土，夹着碎石子，两边的草被踩得发黄
      if (wForest < 1) {
        const pd = nearestSeg(prep.paths, prep.pathBuckets, x, y, PICK)
        if (pd < 0.3) {
          const fade = PICK.k
          const core = smooth(0.0, -0.16, pd + (valueNoise(x * 3, y * 3, seed + 97) - 0.5) * 0.14) * fade
          const edge = smooth(0.3, 0.02, pd) * fade
          r += (r * 1.12 + 10 - r) * edge * 0.6
          g += (g * 1.04 - g) * edge * 0.6
          b += (b * 0.9 - b) * edge * 0.6
          const pebble = cellNearest(x * 9, y * 9, seed + 99)
          const stone = pebble.h > 0.6 ? smooth(0.32, 0.2, Math.hypot(pebble.dx, pebble.dy)) : 0
          const soil = 0.88 + 0.22 * grain
          let sr = 132 * soil
          let sg = 108 * soil
          let sb = 78 * soil
          sr += (168 - sr) * stone
          sg += (158 - sg) * stone
          sb += (142 - sb) * stone
          r += (sr - r) * core
          g += (sg - g) * core
          b += (sb - b) * core
        }
      }

      // 山脚下：草里散着从山上滚下来的碎石，越靠山越多，石面长着地衣
      if (foot >= 0 && foot < 1.6) {
        const exposed = smooth(1.3, 0.1, foot + (fbm(x * 0.9, y * 0.9, seed + 71, 2) - 0.5) * 0.9)
        const q = cellNearest(x * 1.6, y * 1.6, seed + 73)
        const dome = 1 - Math.sqrt(q.dx * q.dx + q.dy * q.dy) / (0.55 + 0.25 * q.h)
        const rock = smooth(0.05, 0.35, dome) * exposed
        if (rock > 0) {
          const c = STONES[Math.floor(q.h * 2.999)]!
          const speck = 1 + (valueNoise(x * 12, y * 12, seed + 77) - 0.5) * 0.16
          let rr = c[0] * speck
          let rg = c[1] * speck
          let rb = c[2] * speck
          const lichen = smooth(0.58, 0.7, fbm(x * 1.4, y * 1.4, seed + 79, 2))
          const orange = fract(q.h * 17.3) > 0.7
          rr += ((orange ? 196 : 174) - rr) * lichen * 0.55
          rg += ((orange ? 136 : 170) - rg) * lichen * 0.55
          rb += ((orange ? 72 : 120) - rb) * lichen * 0.55
          const lit = 0.82 + 0.3 * clamp01((-q.dx * LX - q.dy * LY) * 1.4 + 0.3)
          r += (rr * lit - r) * clamp01(rock)
          g += (rg * lit - g) * clamp01(rock)
          b += (rb * lit - b) * clamp01(rock)
        }
      }

      // 山：碎石坡、一级岩壁，再往上是顺着坡向一道道石棱与沟的山坡
      if (s > -0.1) {
        toLocal(frame, x, y, L)
        const apron = sample(f, f.apron, x, y)
        const top = apron + WALL_U
        // 碎石坡：碎石块大大小小，越往下越大，石缝暗；上山路口那儿是新塌下来的石渣，发白，没长地衣
        const q = cellNearest(x * (5 - 1.5 * smooth(0, apron, s)), y * (5 - 1.5 * smooth(0, apron, s)), seed + 151)
        const c = STONES[Math.floor(q.h * 2.999)]!
        const fresh = Math.exp(-(((L.b - head) / 1.9) ** 2)) * (0.65 + 0.35 * valueNoise(x * 3, y * 3, seed + 153))
        const lit = 0.8 + 0.3 * clamp01((-q.dx * LX - q.dy * LY) * 1.8 + 0.4)
        const gap = 1 - 0.3 * smooth(0.3, 0.5, Math.hypot(q.dx, q.dy))
        const grit = 0.94 + 0.12 * valueNoise(x * 9, y * 9, seed + 155)
        const k0 = lit * gap * grit * (1 - 0.3 * smooth(apron - 0.5, apron, s))
        let mr = (c[0] + (172 - c[0]) * fresh) * k0
        let mg = (c[1] + (168 - c[1]) * fresh) * k0
        let mb = (c[2] + (158 - c[2]) * fresh) * k0
        // 岩壁：顺着坡向一道道竖的水痕与裂缝，几道横的岩坎；崖脚压暗，崖顶一道亮边
        const wWall = smooth(apron - 0.06, apron + 0.06, s)
        if (wWall > 0) {
          const face = (s - apron) / WALL_U
          const streak = valueNoise(L.b * 5.5, s * 0.7, seed + 157) * 0.6 + valueNoise(L.b * 13, s * 1.1, seed + 159) * 0.4
          const crack = smooth(0.8, 0.9, valueNoise(L.b * 3.3, s * 0.12, seed + 161)) * smooth(0.35, 0.6, valueNoise(L.b * 3.3 + 5.2, s * 1.6, seed + 179))
          const ledge = smooth(0.62, 0.72, valueNoise(L.b * 0.8, s * 6, seed + 163))
          const rim = smooth(0.82, 0.97, face) * (1 - smooth(0.97, 1.02, face))
          const k = (0.72 + 0.42 * streak) * (1 - 0.3 * crack) * (0.78 + 0.22 * smooth(0, 0.35, face)) * (1 + 0.12 * ledge)
          mr += ((126 + 40 * rim) * k - mr) * wWall
          mg += ((120 + 40 * rim) * k - mg) * wWall
          mb += ((110 + 36 * rim) * k - mb) * wWall
        }
        // 山坡：石棱上是裸岩，沟里是碎石，低处的石缝里长着高山草甸，越往上草越少；高处的沟里积着残雪；之字形的上山小路
        const wUp = smooth(top - 0.06, top + 0.06, s)
        if (wUp > 0) {
          const up = s - top
          const rib = ribAt(seed, L.b, s)
          const streak = 0.9 + 0.2 * valueNoise(L.b * 9, s * 0.8, seed + 165)
          const rock = STONES[Math.floor(valueNoise(x * 0.45, y * 0.45, seed + 167) * 2.999)]!
          const kr = (0.82 + 0.36 * rib) * streak * (0.92 + 0.16 * grain)
          let ur = rock[0] * kr
          let ug = rock[1] * kr
          let ub = rock[2] * kr
          const turf = smooth(0.55, 0.65, fbm(x / 2, y / 2, seed + 169, 3) + 0.1 * smooth(5, 0.5, up) - 0.15 * rib) * 0.85
          ur += (100 * tex - ur) * turf
          ug += (110 * tex - ug) * turf
          ub += (62 * tex - ub) * turf
          const drift = smooth(snowAt, snowAt + 0.06, (0.55 - rib) + 0.35 * smooth(1.5, 7, up) + (valueNoise(x * 2.2, y * 2.2, seed + 171) - 0.5) * 0.1)
          ur += (232 - ur) * drift
          ug += (236 - ug) * drift
          ub += (240 - ub) * drift
          const cd = nearestSeg(prep.climb, prep.climbBuckets, x, y, PICK)
          if (cd < 0.08) {
            const a = smooth(0.08, -0.04, cd + (valueNoise(x * 6, y * 6, seed + 173) - 0.5) * 0.06) * (1 - drift) * 0.7
            ur += (150 * (0.9 + 0.2 * grain) - ur) * a
            ug += (136 * (0.9 + 0.2 * grain) - ug) * a
            ub += (112 * (0.9 + 0.2 * grain) - ub) * a
          }
          mr += (ur - mr) * wUp
          mg += (ug - mg) * wUp
          mb += (ub - mb) * wUp
        }
        // 碎石往草里撒进来一点，交界参差
        const into = smooth(-0.1, 0.18, s + (valueNoise(x * 2.5, y * 2.5, seed + 175) - 0.5) * 0.24)
        r += (mr - r) * into
        g += (mg - g) * into
        b += (mb - b) * into
      }

      // 倒木：顺着树干的树皮纹，顶上长着苔藓；断开的那头露出发白的木茬，另一头翻起带泥的根盘
      {
        const dx = x - lg.x
        const dy = y - lg.y
        const s = dx * lg.ux + dy * lg.uy
        const t = -dx * lg.uy + dy * lg.ux
        const half = lg.len * 0.5
        const taper = lg.r * (1 - 0.18 * ((s * lg.root) / half + 1) * 0.5)
        if (Math.abs(s) < half && Math.abs(t) < taper) {
          const nz = Math.sqrt(Math.max(0, 1 - (t / taper) ** 2))
          const nx = -lg.uy * (t / taper)
          const ny = lg.ux * (t / taper)
          const lit = clamp01(nx * LX + ny * LY + nz * LZ)
          const bark = 0.8 + 0.3 * valueNoise(s * 1.5, t * 14, seed + 101) + 0.12 * smooth(0.04, 0, cellEdge(s * 2, t * 6, seed + 103))
          let lr = 92 * bark
          let lgc = 70 * bark
          let lb = 52 * bark
          const moss = smooth(0.55, 0.75, fbm(s * 0.9, t * 3, seed + 105, 2)) * smooth(0.2, 0.9, nz)
          lr += (78 - lr) * moss
          lgc += (102 - lgc) * moss
          lb += (46 - lb) * moss
          const snap = smooth(half - 0.25, half - 0.05, s * -lg.root)
          lr += (170 - lr) * snap * (0.6 + 0.4 * valueNoise(t * 20, s * 8, seed + 107))
          lgc += (138 - lgc) * snap * 0.8
          lb += (96 - lb) * snap * 0.8
          const k = 0.45 + 0.8 * lit
          r = lr * k
          g = lgc * k
          b = lb * k
        }
        // 根盘：立着的一圈泥土与根，旁边是翻出来的坑
        const rcx = lg.x + lg.ux * lg.root * (half + 0.15)
        const rcy = lg.y + lg.uy * lg.root * (half + 0.15)
        const rs = (x - rcx) * lg.ux + (y - rcy) * lg.uy
        const rt = -(x - rcx) * lg.uy + (y - rcy) * lg.ux
        const plate = (rs * lg.root) / 0.32
        const span = rt / 1.15
        const ragged = 1 + (valueNoise(rt * 5, rs * 5, seed + 109) - 0.5) * 0.5
        if (plate * plate + span * span < ragged) {
          const root = smooth(0.06, 0, Math.abs(Math.sin(Math.atan2(rt, rs) * 7 + rs * 6))) * 0.5
          const k = 0.6 + 0.35 * clamp01(0.5 - plate * 0.5)
          r = (88 + root * 40) * k
          g = (66 + root * 26) * k
          b = (46 + root * 14) * k
        }
        const pit = ((rs * lg.root + 0.75) / 0.42) ** 2 + (rt / 0.95) ** 2
        if (pit < 1 && rs * lg.root < -0.2) {
          const k = 0.55 + 0.3 * Math.sqrt(pit)
          r = 72 * k
          g = 56 * k
          b = 40 * k
        }
      }

      if (tr) {
        const dx = x - tr.x
        const dy = y - tr.y
        const s = Math.abs(dx * tr.ux + dy * tr.uy)
        const t = Math.abs(-dx * tr.uy + dy * tr.ux)
        if (s < tr.len * 0.5 && t < tr.wid * 0.5) {
          const rim = s > tr.len * 0.5 - 0.07 || t > tr.wid * 0.5 - 0.07
          const sky = 0.8 + 0.3 * smooth(0, tr.wid * 0.5, t)
          r = rim ? 118 : 74 * sky
          g = rim ? 96 : 94 * sky
          b = rim ? 70 : 104 * sky
        }
      }
      // 栅栏的木头：风吹日晒发灰的圆木，按太阳打光，边上一圈暗线把它从草里勾出来；门柱颜色深一些
      {
        const wd = nearestSeg(prep.wood, prep.woodBuckets, x, y, PICK)
        if (wd < 0.02) {
          const s = prep.wood[PICK.i]!
          const ex = s.bx - s.ax
          const ey = s.by - s.ay
          const t = clamp01(((x - s.ax) * ex + (y - s.ay) * ey) / (ex * ex + ey * ey || 1e-12))
          const qx = (x - s.ax - ex * t) / s.w
          const qy = (y - s.ay - ey * t) / s.w
          const qz = Math.sqrt(Math.max(0, 1 - qx * qx - qy * qy))
          const lit = clamp01(qx * LX + qy * LY + qz * LZ)
          const a = smooth(0.02, -0.015, wd)
          const weather = 0.85 + 0.25 * valueNoise(x * 18, y * 18, seed + 111)
          const k = (0.5 + 0.75 * lit) * weather * (1 - 0.45 * smooth(-0.025, 0.01, wd))
          const dark = PICK.k === 2
          r += ((dark ? 110 : 150) * k - r) * a
          g += ((dark ? 88 : 136) * k - g) * a
          b += ((dark ? 64 : 112) * k - b) * a
        }
      }

      // 光：朝太阳的坡亮、背阴的坡暗；山与岩壁挡住的地方落在影子里；树影与栅栏、倒木、石头的影子；林缘下暗一些，离草地越远越暗
      const zx = (sample(f, f.height, x + e, y) - sample(f, f.height, x - e, y)) / (2 * e * mpu)
      const zy = (sample(f, f.height, x, y + e) - sample(f, f.height, x, y - e)) / (2 * e * mpu)
      const lambert = Math.max(0, (-zx * LX - zy * LY + LZ) / Math.sqrt(zx * zx + zy * zy + 1))
      let shade = sample(f, f.shade, x, y) * 0.55
      for (const k of near(prep.treeShadows, x, y)) {
        const c = prep.shadowAt[k]!
        const d = Math.sqrt((x - c.x) ** 2 + (y - c.y) ** 2)
        shade = Math.max(shade, smooth(c.r + c.soft, c.r - c.soft, d) * 0.4)
      }
      for (const k of near(prep.castBuckets, x, y)) {
        const c = prep.casts[k]!
        const d = segDist(c, x, y)
        shade = Math.max(shade, smooth(c.w + 0.05, c.w - 0.03, d) * c.k)
      }
      const under = 1 - 0.22 * smooth(-1.4, 0.4, forest)
      const far = (1 - 0.38 * smooth(1.5, 7, forest)) * (1 - 0.3 * smooth(3, 9, s))
      const light = (0.44 + 0.84 * lambert) * (1 - shade) * under * far
      r *= light
      g *= light
      b *= light
      // 山脚的石头与路口的石堆自己按太阳打光，只落在山的影子里，不叫自己投下的影子盖住
      const keep = (1 - sample(f, f.shade, x, y) * 0.55) * far
      for (const k of near(prep.stoneBuckets, x, y)) {
        const st = prep.stones[k]!
        const dx = (x - st.x) / st.r
        const dy = (y - st.y) / st.r
        const d = Math.sqrt(dx * dx + dy * dy) * (1 + 0.22 * (valueNoise(Math.atan2(dy, dx) * 1.6 + k * 7.1, 0.5, seed + 177) - 0.5))
        if (d >= 1.05) continue
        const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d) ** 2))
        const lit = (0.55 + 0.55 * clamp01(dx * LX + dy * LY + nz * LZ)) * keep
        const lichen = st.fresh ? 0 : smooth(0.55, 0.7, fbm(x * 2, y * 2, seed + 173, 2)) * 0.5
        const a = smooth(1.05, 0.9, d)
        r += (((st.fresh ? 170 : 124) + (170 - 124) * lichen) * lit - r) * a
        g += (((st.fresh ? 166 : 120) + (166 - 120) * lichen) * lit - g) * a
        b += (((st.fresh ? 156 : 110) + (118 - 110) * lichen) * lit - b) * a
      }
      {
        const d = Math.hypot(x - cairn.x, y - cairn.y) / CAIRN.r
        if (d < 1.05) {
          const lit = (0.55 + 0.6 * clamp01(((x - cairn.x) / CAIRN.r) * LX + ((y - cairn.y) / CAIRN.r) * LY + LZ * 0.8)) * keep
          const tier = d > 0.66 ? 0 : d > 0.36 ? 1 : 2
          const seam = 1 - 0.4 * smooth(0.05, 0, Math.abs(d - 0.66)) - 0.4 * smooth(0.05, 0, Math.abs(d - 0.36))
          const k = (0.72 + 0.14 * tier) * lit * seam
          const a = smooth(1.05, 0.92, d)
          r += (148 * k - r) * a
          g += (144 * k - g) * a
          b += (136 * k - b) * a
        }
      }
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = 255
    }
  }
}

/** 云杉第 j 层枝轮（0 是最外最低的一层）的半径，占树冠半径的比例 */
function tierRadius(sp: Spruce, j: number): number {
  return 1 - (0.76 * j) / sp.tiers
}

/** 偏离枝脊多少：−1…1，0 在枝脊上 */
const SIDE = { v: 0 }

/** 云杉第 j 层枝轮在 ang 方位上枝梢离树心多远（占树冠半径的比例）：一圈长短不一的枝条，相邻的叠在一起，枝梢之间凹进去一点；顺带记下这一方位偏离最近那条枝的脊多少 */
function tierEdge(sp: Spruce, k: number, j: number, ang: number): number {
  const n = sp.n[j]!
  const u = (ang / (Math.PI * 2) + 1) * n + sp.phase[j]!
  const i0 = Math.floor(u)
  let edge = 0
  SIDE.v = 1
  for (let i = i0 - 1; i <= i0 + 1; i++) {
    const id = ((i % n) + n) % n
    const d = (u - i - 0.5 - (hash1(k * 7.3 + id, j + 1.7) - 0.5) * 0.35) / 0.75
    if (Math.abs(d) >= 1) continue
    const e = (0.86 + 0.14 * hash1(k * 3.1 + id, j + 9.4)) * (1 - 0.32 * Math.abs(d) - 0.05 * d * d)
    if (e > edge) {
      edge = e
      SIDE.v = d
    }
  }
  return edge * tierRadius(sp, j)
}

/** 几种树冠的颜色：背阴与向阳 */
const CROWN = {
  spruce: { dark: [22, 48, 40], lit: [80, 116, 78] },
  birch: { dark: [74, 100, 46], lit: [158, 176, 86] },
  shrub: { dark: [48, 74, 36], lit: [112, 140, 62] },
} as const

/**
 * 树冠：云杉是几层枝轮一层压一层，每层一圈参差的枝条，上一层在下一层背光的那边投下影子，枝梢向阳的一面亮；白桦与灌木由几团叶簇叠成。
 * 每一点取最高的那个面，按太阳打光：向阳的一面偏暖偏亮、背阴的一面偏冷偏暗，低处被上面的枝叶遮着更暗；林子深处暗下去。边缘柔和，像素带透明度，只画 rect 那一块
 */
export function paintCanopy(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const area = groundArea(sc)
  const plan = sc.plan
  const seed = plan.seed
  const ppu = CANOPY_PPU
  const w = rect.x1 - rect.x0
  const f = prep.fields
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = area.x0 + (px + 0.5) / ppu
      const y = area.y0 + (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      let best = -Infinity
      let alpha = 0
      let nx = 0
      let ny = 0
      let nz = 1
      let tree = -1
      let groove = 0
      let tip = 0
      for (const k of near(prep.crowns, x, y)) {
        const t = plan.trees[k]!
        const dx = x - t.x
        const dy = y - t.y
        const d2 = dx * dx + dy * dy
        if (d2 > (t.r * 1.02) ** 2) continue
        if (t.kind === 'spruce') {
          const d = Math.sqrt(d2)
          const rho = d / t.r
          const ang = Math.atan2(dy, dx)
          const sp = prep.spruce[k]!
          // 看得见的是罩住这一点的最高一层枝轮
          let j = -1
          let edge = 0
          let side = 0
          let cover = 0
          for (let i = 0; i < sp.tiers; i++) {
            const e = tierEdge(sp, k, i, ang)
            cover = Math.max(cover, smooth(e, e - 0.08, rho))
            if (rho < e) {
              j = i
              edge = e
              side = SIDE.v
            }
          }
          if (j < 0) continue
          alpha = Math.max(alpha, cover)
          const inner = j + 1 < sp.tiers ? tierRadius(sp, j + 1) * 0.75 : 0
          const tt = clamp01((rho - inner) / Math.max(0.05, edge - inner))
          const hgt = t.h * (1 - 0.92 * rho) - 0.4 * tt * tt
          if (hgt <= best) continue
          best = hgt
          // 枝条从里往外越来越垂，枝梢两边往下斜：法线往外、往偏离枝脊的那边倒
          const s = 0.3 + 1.5 * tt * tt
          const ts = 0.9 * side * (0.35 + 0.65 * tt)
          const cx = d > 1e-6 ? dx / d : 0
          const cy = d > 1e-6 ? dy / d : 0
          const mx = cx * s - cy * ts
          const my = cy * s + cx * ts
          const l = Math.sqrt(mx * mx + my * my + 1)
          nx = mx / l
          ny = my / l
          nz = 1 / l
          tree = k
          // 上一层枝轮的影子落在这一层背着太阳的那边，枝梢之间的缝也暗
          let shadow = 0
          if (j + 1 < sp.tiers) {
            const sx = dx + TO_SUN.x * 0.16 * t.r
            const sy = dy + TO_SUN.y * 0.16 * t.r
            const up = tierEdge(sp, k, j + 1, Math.atan2(sy, sx))
            shadow = smooth(up + 0.03, up - 0.08, Math.sqrt(sx * sx + sy * sy) / t.r)
          }
          groove = Math.max(shadow * 0.8, smooth(0.55, 1, Math.abs(side)) * tt * 0.6)
          tip = smooth(0.7, 1, tt) * smooth(0.6, 0, Math.abs(side))
        } else {
          const shapes = prep.clumps[k]!
          const ragged = 0.84 + 0.2 * valueNoise(x * 5.5, y * 5.5, seed + 123)
          for (const c of shapes) {
            const cdx = x - c.x
            const cdy = y - c.y
            const cd2 = cdx * cdx + cdy * cdy
            const r = c.r * ragged
            if (cd2 >= r * r) continue
            const cz = Math.sqrt(r * r - cd2)
            const hgt = c.top - r + cz * 1.1
            alpha = Math.max(alpha, smooth(r, r - 0.08, Math.sqrt(cd2)))
            if (hgt <= best) continue
            best = hgt
            nx = cdx / r
            ny = cdy / r
            nz = cz / r
            tree = k
            groove = 0
            tip = 0
          }
        }
      }
      const depth = sample(f, f.forest, x, y)
      const fill = smooth(0.5, 1.8, depth) * smooth(0.1, 0.8, sample(f, f.foot, x, y)) * 0.96
      if (tree < 0 || alpha <= 0) {
        if (fill <= 0) {
          out[o + 3] = 0
          continue
        }
        const k = (0.72 + 0.4 * valueNoise(x * 6, y * 6, seed + 131)) * (1 - 0.3 * smooth(1.5, 7, depth))
        out[o] = 20 * k
        out[o + 1] = 36 * k
        out[o + 2] = 30 * k
        out[o + 3] = fill * 255
        continue
      }
      const t = plan.trees[tree]!
      const spruce = t.kind === 'spruce'
      const pal = CROWN[t.kind]
      const leaf = valueNoise(x * 15, y * 15, seed + 125) * 0.55 + valueNoise(x * 34, y * 34, seed + 127) * 0.45
      const bx = valueNoise(x * 7 + 0.3, y * 7, seed + 129) - valueNoise(x * 7 - 0.3, y * 7, seed + 129)
      const by = valueNoise(x * 7, y * 7 + 0.3, seed + 129) - valueNoise(x * 7, y * 7 - 0.3, seed + 129)
      const bump = spruce ? 0.45 : 0.8
      const mx = nx + bx * bump
      const my = ny + by * bump
      const ml = Math.sqrt(mx * mx + my * my + nz * nz)
      const lit = clamp01(((mx * LX + my * LY + nz * LZ) / ml + 0.3) / 1.3)
      const low = spruce ? smooth(0, t.h, t.h - best) : smooth(0, 1.6, t.h - best)
      const deep = 1 - 0.28 * smooth(1.5, 7, depth)
      const grain = spruce ? 0.78 + 0.36 * leaf : 0.86 + 0.2 * leaf
      const k = (0.42 + 0.58 * lit) * (1 - 0.32 * low) * grain * (1 - 0.5 * groove) * deep
      const warm = lit * lit
      const shine = spruce ? tip * lit * 0.45 : smooth(0.8, 0.92, leaf) * lit * 0.22
      const cr = pal.dark[0] + (pal.lit[0] - pal.dark[0]) * warm
      const cg = pal.dark[1] + (pal.lit[1] - pal.dark[1]) * warm
      const cb = pal.dark[2] + (pal.lit[2] - pal.dark[2]) * (0.6 + 0.4 * warm)
      // 树冠的边透出底下那层暗的枝叶：按透明度叠在上面
      const a = Math.max(alpha, fill)
      const under = fill * (1 - alpha)
      const uk = 0.8
      out[o] = ((cr + 50 * shine) * k * alpha + 20 * uk * under) / a
      out[o + 1] = ((cg + 50 * shine) * k * alpha + 36 * uk * under) / a
      out[o + 2] = ((cb + 20 * shine) * k * alpha + 30 * uk * under) / a
      out[o + 3] = a * 255
    }
  }
}

/** 草浪着色器用的遮罩：草地与牧场为 1，路上淡一些，林子与山上为 0；按地面贴图的范围，每格 MASK_PPU 个像素，满 alpha */
export function grassMask(sc: PaintScene): { data: Uint8ClampedArray<ArrayBuffer>; w: number; h: number } {
  const area = groundArea(sc)
  const w = Math.round(area.w * MASK_PPU)
  const h = Math.round(area.h * MASK_PPU)
  const data = new Uint8ClampedArray(w * h * 4)
  const e = sc.plan.edges
  const L: Local = { a: 0, b: 0 }
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = area.x0 + (px + 0.5) / MASK_PPU
      const y = area.y0 + (py + 0.5) / MASK_PPU
      toLocal(sc.plan.frame, x, y, L)
      const foot = L.a - footAt(e, L.b)
      const forest = forestDepth(e, L.a, L.b)
      const fence = Math.abs(beyondFence(e, L.a, L.b))
      const m = smooth(0.3, 1.4, foot) * smooth(0.2, -0.8, forest) * (0.4 + 0.6 * smooth(0.1, 0.4, fence))
      const o = (py * w + px) * 4
      data[o] = m * 255
      data[o + 1] = 0
      data[o + 2] = 0
      data[o + 3] = 255
    }
  }
  return { data, w, h }
}
