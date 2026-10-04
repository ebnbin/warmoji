import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { cellEdge, cellNearest, fbm, valueNoise } from '../../util/noise'
import { bankHeight, bankShape, bankWidth, beyondFence, footAt, forestDepth, toLocal } from './layout'
import type { Edges, Local, MeadowPlan, Tree } from './layout'
import type { MeadowConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

/** 树冠贴图每格多少像素：树冠边是软的，用不着地面那么细 */
export const CANOPY_PPU = 16
/** 草浪着色器用的草地遮罩每格多少像素 */
export const MASK_PPU = 4
/** 边界与高度的场按这么细的格子先算好，画的时候插值，格 */
const FIELD_U = 0.25
/** 坡脚线上每隔这么远（格）取一个点：找最近的坡脚时挨个比 */
const FOOT_STEP_U = 0.05
/** 比最近的坡脚只远出这么多（格）以内的几段坡脚一起平均坡宽坡高：跨过两段坡脚之间时不突变 */
const FOOT_BLEND_U = 1
/** 草地这边顺着 a 离坡脚这么远（格）以外，离坡脚多远只按顺着 a 量的算：坡脚的弯与鼓包都拐不回这么近 */
const FOOT_NEAR_U = 8
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

/** 地面受的光：天光与正对着太阳时的阳光各多强 */
const AMBIENT = 0.44
const DIRECT = 0.84
/** 天光偏冷，阳光按它配成偏暖：平地照着太阳时合起来是白的，落在影子里只剩天光就偏冷 */
const SKY = { r: 0.9, g: 0.97, b: 1.12 } as const
const warm = (sky: number): number => 1 + (AMBIENT * (1 - sky)) / (DIRECT * LZ)
const SUNLIGHT = { r: warm(SKY.r), g: warm(SKY.g), b: warm(SKY.b) } as const

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
 * 地形上一格的场：往坡上走出了坡脚多远（格，草地这边是负的）、那一段坡面多宽（格）、坡上的草铺在坡面上比从上往下看多出多长（格），
 * 林缘、栅栏各离多远（格），地面多高（米），被地形挡住多少太阳；格点 (i, j) 在 (x0 + i·cell, y0 + j·cell)
 */
interface Fields {
  readonly x0: number
  readonly y0: number
  readonly cell: number
  readonly cols: number
  readonly rows: number
  readonly climb: Float32Array
  readonly width: Float32Array
  readonly unroll: Float32Array
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
  readonly wood: readonly Segment[]
  readonly woodBuckets: Buckets
  readonly flowerCdf: readonly number[]
}

/** 每米高的东西在地上投下多长的影子（格）：背着太阳 */
function shadowPerM(cfg: MeadowConfig): Point {
  return { x: -LX / LZ / cfg.meterPerU, y: -LY / LZ / cfg.meterPerU }
}

/** 坡脚线：b 从 b0 起每 FOOT_STEP_U 格一个点，记下坡脚离地图边多远、那一段坡面多宽（格）、坡多高（米） */
interface FootLine {
  readonly b0: number
  readonly foot: Float32Array
  readonly width: Float32Array
  readonly height: Float32Array
}

/** 坡脚线从 b0 记到 b1：要比画的地方两头各多出最远的那段找最近坡脚的距离 */
function footLine(e: Edges, b0: number, b1: number): FootLine {
  const n = Math.ceil((b1 - b0) / FOOT_STEP_U) + 1
  const foot = new Float32Array(n)
  const width = new Float32Array(n)
  const height = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const b = b0 + i * FOOT_STEP_U
    foot[i] = footAt(e, b)
    width[i] = bankWidth(e, b)
    height[i] = bankHeight(e, b)
  }
  return { b0, foot, width, height }
}

/** 坡脚线上一样东西在 b 处的值：两点之间按直线插 */
function lineAt(line: FootLine, a: Float32Array, b: number): number {
  const u = Math.min(a.length - 1.001, Math.max(0, (b - line.b0) / FOOT_STEP_U))
  const i = Math.floor(u)
  return a[i]! + (a[i + 1]! - a[i]!) * (u - i)
}

/** 离坡脚线最近的地方：往坡上走出了坡脚多远（格，草地这边是负的），那一段坡面多宽（格）、坡多高（米） */
interface Near {
  climb: number
  width: number
  height: number
}

/**
 * 本地 (a, b) 离坡脚线多远，写进 out：坡上与坡脚附近按到坡脚线的最近距离，只在 b 两边最多 cap 格以内找，坡宽坡高按离得差不多近的几段坡脚取平均；
 * 草地深处只按顺着 a 量的算
 */
function nearFoot(line: FootLine, a: number, b: number, cap: number, out: Near): Near {
  const along = a - lineAt(line, line.foot, b)
  if (along >= FOOT_NEAR_U) {
    out.climb = -along
    out.width = lineAt(line, line.width, b)
    out.height = lineAt(line, line.height, b)
    return out
  }
  // 顺着 a 量的距离已经是最近距离的上限，比它更远的坡脚点不用看
  const reach = Math.min(Math.abs(along), cap) + FOOT_BLEND_U + FOOT_STEP_U
  const i0 = Math.max(0, Math.floor((b - reach - line.b0) / FOOT_STEP_U))
  const i1 = Math.min(line.foot.length - 1, Math.ceil((b + reach - line.b0) / FOOT_STEP_U))
  let best = Infinity
  for (let i = i0; i <= i1; i++) {
    const db = line.b0 + i * FOOT_STEP_U - b
    const da = line.foot[i]! - a
    best = Math.min(best, da * da + db * db)
  }
  const d = Math.sqrt(best)
  const blend2 = (d + FOOT_BLEND_U) ** 2
  let ws = 0
  let w = 0
  let h = 0
  for (let i = i0; i <= i1; i++) {
    const db = line.b0 + i * FOOT_STEP_U - b
    const da = line.foot[i]! - a
    const d2 = da * da + db * db
    if (d2 >= blend2) continue
    const k = (1 - (Math.sqrt(d2) - d) / FOOT_BLEND_U) ** 2
    ws += k
    w += line.width[i]! * k
    h += line.height[i]! * k
  }
  out.climb = along < 0 ? d : -d
  out.width = w / ws
  out.height = h / ws
  return out
}

/** 坡面的剖面在 t 处每占一份坡宽升多少份坡高 */
function bankSlope(t: number): number {
  return (bankShape(t + 1e-3) - bankShape(t - 1e-3)) / 2e-3
}

/** 往坡上走出坡脚 s 格的地方，坡上的草铺在坡面上比从上往下看多出多长（格）：坡面宽 w 格、高 h 米，坡顶往外不再多出 */
function unrolled(s: number, w: number, h: number, mpu: number): number {
  if (s <= 0) return 0
  const x = Math.min(s, w)
  const steps = 16
  let len = 0
  for (let i = 0; i < steps; i++) {
    const grade = (h * bankSlope(((i + 0.5) / steps) * (x / w))) / (w * mpu)
    len += Math.sqrt(1 + grade * grade)
  }
  return (len * x) / steps - x
}

function makeFields(sc: PaintScene): Fields {
  const area = groundArea(sc)
  const cell = FIELD_U
  const cols = Math.ceil(area.w / cell) + 2
  const rows = Math.ceil(area.h / cell) + 2
  const n = cols * rows
  const climb = new Float32Array(n)
  const width = new Float32Array(n)
  const unroll = new Float32Array(n)
  const forest = new Float32Array(n)
  const fence = new Float32Array(n)
  const height = new Float32Array(n)
  const shade = new Float32Array(n)
  const { plan, cfg } = sc
  const e = plan.edges
  const turf = cfg.turf
  const line = footLine(e, -cfg.padU - plan.size, plan.size * 2 + cfg.padU)
  const L: Local = { a: 0, b: 0 }
  const N: Near = { climb: 0, width: 0, height: 0 }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = area.x0 + i * cell
      const y = area.y0 + j * cell
      toLocal(plan.frame, x, y, L)
      nearFoot(line, L.a, L.b, Infinity, N)
      const k = j * cols + i
      const fd = forestDepth(e, L.a, L.b)
      const up = bankShape(N.climb / N.width)
      climb[k] = N.climb
      width[k] = N.width
      unroll[k] = unrolled(N.climb, N.width, N.height, cfg.meterPerU)
      forest[k] = fd
      fence[k] = beyondFence(e, L.a, L.b)
      // 草地带着起伏，从坡脚往外缓缓降低、坡上那层接着往外升；林子里的地面略高，坡上没有林子
      height[k] = (fbm(x / turf.waveU, y / turf.waveU, plan.seed + 5, 3) - 0.5) * 2 * turf.reliefM + 0.25 * smooth(0, 3, fd) * (1 - up) + turf.riseM * N.climb + N.height * up
    }
  }
  const f: Fields = { x0: area.x0, y0: area.y0, cell, cols, rows, climb, width, unroll, forest, fence, height, shade }
  // 每格往太阳方向找挡光的地形：比太阳的光线高出越多越暗；光线升过全场最高处就不用再往前找
  const rise = (LZ / SUN_LEN) * sc.cfg.meterPerU
  let peak = -Infinity
  for (const z of height) peak = Math.max(peak, z)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = area.x0 + i * cell
      const y = area.y0 + j * cell
      const z = height[j * cols + i]!
      const reach = (peak - z) / rise
      let over = 0
      for (let st = cell; st <= reach; st += cell) over = Math.max(over, sample(f, height, x + TO_SUN.x * st, y + TO_SUN.y * st) - z - st * rise)
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

/** 栅栏、门、饮水槽与倒木：顶视的木头与投在地上的影子 */
function woodAndCasts(sc: PaintScene): { wood: Segment[]; casts: Segment[] } {
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
  return { wood, casts }
}

/** 路：草地上踩出来的路，加上门外伸进牧场的那段车辙；林子里的小路另算 */
function pathSegments(sc: PaintScene): { paths: Segment[]; trail: Segment[] } {
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
  return { paths, trail }
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
  const { wood, casts } = woodAndCasts(sc)
  const { paths, trail } = pathSegments(sc)
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
    wood,
    woodBuckets: segmentBuckets(area, wood, 0.2),
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
  [255, 255, 246],
  [255, 223, 64],
  [150, 138, 214],
  [228, 168, 192],
  [214, 86, 138],
] as const
const FLOWER_EYE = [
  [255, 212, 72],
  [239, 186, 54],
  [112, 98, 182],
  [244, 214, 226],
  [240, 160, 190],
] as const

function pickFlower(cdf: readonly number[], u: number): number {
  for (let i = 0; i < cdf.length; i++) if (u < cdf[i]!) return i
  return cdf.length - 1
}

/** 一点的颜色，0 到 255 */
interface Rgb {
  r: number
  g: number
  b: number
}

/**
 * 草地一点的颜色，写进 out：大片的深浅按低频噪声，叶子顺着风斜着长（tex），成片地开着几种野花，噪声在 (x, y) 处取；
 * lush 是草更深更绿、花更少的程度，dry 往干黄那边再加多少，bloom 是花开得多少的倍数。坡上的纹理顺着 (fx, fy) 挤了 squeeze 倍，
 * 花朝天开，从上往下看仍是圆的
 */
function meadowGrass(sc: PaintScene, prep: Prepared, x: number, y: number, tex: number, lush: number, dry: number, bloom: number, fx: number, fy: number, squeeze: number, out: Rgb): void {
  const seed = sc.plan.seed
  const fl = sc.cfg.flowers
  const patch = fbm(x / 7, y / 7, seed + 3, 2)
  const mid = fbm(x / 2.2, y / 2.2, seed + 5, 2)
  const dr = clamp01(smooth(0.42, 0.74, patch) * 0.75 - lush * 0.45 + dry)
  const green = clamp01(0.5 + (mid - 0.5) * 1.2 + lush * 0.3)
  let r = (114 + (80 - 114) * green + (188 - 114) * dr) * tex
  let g = (167 + (142 - 167) * green + (188 - 167) * dr) * tex
  let b = (84 + (73 - 84) * green + (114 - 84) * dr) * tex
  // 野花：成片地开，每片有一种开得最多
  const bloomAt = 0.5 + (0.5 - fl.cover) * 0.3
  const dens = smooth(bloomAt - 0.02, bloomAt + 0.12, fbm(x / fl.patchU, y / fl.patchU, seed + 19, 2)) * (1 - lush * 0.7) * bloom
  if (dens > 0) {
    const q = cellNearest(x * 4, y * 4, seed + 17)
    if (q.h < dens * 0.6) {
      const rad = 0.17 + 0.09 * fract(q.h * 13.7)
      const al = (q.dx * fx + q.dy * fy) * (1 - 1 / squeeze)
      const ox = q.dx - fx * al
      const oy = q.dy - fy * al
      const d = Math.sqrt(ox * ox + oy * oy)
      if (d < rad) {
        const main = cellNearest(x / (fl.patchU * 0.8), y / (fl.patchU * 0.8), seed + 23).h
        const kind = pickFlower(prep.flowerCdf, fract(q.h * 7.31) < 0.72 ? main : fract(q.h * 3.17 + 0.5))
        const eye = d < rad * (kind === 1 ? 0.25 : 0.38)
        const c = eye ? FLOWER_EYE[kind]! : FLOWER_PETAL[kind]!
        const lit = 0.88 + 0.22 * ((-ox * LX - oy * LY) / (d + 1e-6)) * smooth(0, rad, d)
        const a = smooth(rad, rad * 0.75, d)
        r += (c[0] * lit - r) * a
        g += (c[1] * lit - g) * a
        b += (c[2] * lit - b) * a
      }
    }
  }
  out.r = r
  out.g = g
  out.b = b
}

/**
 * 地面：草地是一片片深浅不一的草，叶子顺着风斜着长，成片地开着几种野花；靠林子的一边草更深更绿、长着蕨。
 * 出了坡脚，同一片草甸顺着一道又高又陡的坡弯上去：坡脚缓缓起来，越往上越陡，坡顶是圆圆的肩，再往外是高一层的草甸，草干一些。
 * 坡上的草与花铺在坡面上，从上往下看越陡越挤；陡的地方花少，朝太阳的坡草色发黄、背阴的更青，坡脚的窝里草深。
 * 草地上有踩出来的路通向栅栏门与林间小路。栅栏外是羊啃过的牧场，草短而匀，有羊踩出的小道，栅栏底下一溜没啃到的高草；
 * 林子里是针叶与苔藓，小路被一棵倒下的云杉横着拦住。栅栏、门与饮水槽是木头的。按高度场打光：朝太阳的坡亮、背阴的坡暗，
 * 坡挡住太阳的地方落在影子里；树、栅栏与倒木也背着太阳投下影子；林子里离草地越远越暗。只画 rect 那一块
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
  const lg = plan.log
  const tr = plan.trough
  const mpu = cfg.meterPerU
  const e = FIELD_U
  // 往坡上的方向：坡沿着一条地图边，坡上的草铺开时顺着它挪
  const ux = -plan.frame.nx
  const uy = -plan.frame.ny
  const C: Rgb = { r: 0, g: 0, b: 0 }
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = area.x0 + (px + 0.5) / ppu
      const y = area.y0 + (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      // 往坡上走出了坡脚多远（格，草地这边是负的），这一段坡面多宽，爬到了坡高的多少
      const s = sample(f, f.climb, x, y)
      const width = sample(f, f.width, x, y)
      const t = clamp01(s / width)
      const up = bankShape(t)
      const face = 4 * t * (1 - t)
      const forest = sample(f, f.forest, x, y)
      const fence = sample(f, f.fence, x, y)
      // 地面朝哪：坡度（每米升多少米）、法线朝天的分量与朝太阳多正；坡面上一格水平的距离铺开有多长
      const zx = (sample(f, f.height, x + e, y) - sample(f, f.height, x - e, y)) / (2 * e * mpu)
      const zy = (sample(f, f.height, x, y + e) - sample(f, f.height, x, y - e)) / (2 * e * mpu)
      const nz = 1 / Math.sqrt(zx * zx + zy * zy + 1)
      const lambert = Math.max(0, (-zx * LX - zy * LY + LZ) * nz)
      const squeeze = 1 / nz
      // 坡朝哪：顺着坡往下的方向朝太阳多正，−1 背着太阳，1 正对着
      const grad = Math.sqrt(zx * zx + zy * zy)
      const aspect = grad > 1e-3 ? (-zx * TO_SUN.x - zy * TO_SUN.y) / grad : 0
      const sunny = clamp01(aspect) * face
      const shady = clamp01(-aspect) * face
      // 坡上的草按铺在坡面上的位置取纹理
      const shift = s > 0 ? sample(f, f.unroll, x, y) : 0
      const gx = x + ux * shift
      const gy = y + uy * shift
      const grain = valueNoise(gx * 7, gy * 7, seed + 9) * 0.5 + valueNoise(gx * 17, gy * 17, seed + 11) * 0.5
      const along = gx * wx + gy * wy
      const across = gy * wx - gx * wy
      const blade = valueNoise(along * 6 + across * 0.8, across * 22 - along * 2, seed + 13)
      const tuft = valueNoise(gx * 3.3 + 7.1, gy * 3.3, seed + 15)
      const tex = (0.93 + 0.08 * blade) * (0.94 + 0.12 * grain) * (0.93 + 0.12 * tuft)
      // 出了坡脚是坡上的草：牧场与林子只在坡下
      const hill = smooth(-0.15, 0.35, s + (valueNoise(x * 3, y * 3, seed + 21) - 0.5) * 0.2)
      const wForest = smooth(0, 0.9, forest) * (1 - hill)
      const wPasture = smooth(-0.08, 0.08, fence) * (1 - smooth(0, 0.9, forest)) * (1 - hill)
      const wMeadow = Math.max(0, 1 - wForest - wPasture)
      let r = 0
      let g = 0
      let b = 0

      // 草地：靠林子的草更深更绿，坡脚的窝里也深一些；往坡上草干一些，朝太阳的坡更干、背阴的坡更青；陡的地方花少
      if (wMeadow > 0) {
        const lush = Math.max(smooth(-3, -0.4, forest) * (1 - smooth(0, 0.3 * width, s)), 0.35 * smooth(-1.2, -0.1, s) * smooth(0.5 * width, 0.1 * width, s)) + 0.15 * shady
        const dry = 0.12 * up + 0.1 * sunny
        meadowGrass(sc, prep, gx, gy, tex, lush, dry, smooth(1.9, 1.3, squeeze), ux, uy, squeeze, C)
        let mr = C.r
        let mg = C.g
        let mb = C.b
        // 林缘的蕨：一丛丛羽状的叶子
        const fern = smooth(-1.7, -0.7, forest) * smooth(0.5, 0, forest) * (1 - hill)
        if (fern > 0) {
          const q = cellNearest(x * 1.4, y * 1.4, seed + 61)
          if (q.h > 0.25) {
            const ang = q.h * 40
            const cu = q.dx * Math.cos(ang) + q.dy * Math.sin(ang)
            const cv = -q.dx * Math.sin(ang) + q.dy * Math.cos(ang)
            const len = 0.55
            const fu = cu / len
            const frond = 0.2 * (1 - fu * fu)
            if (Math.abs(fu) < 1 && Math.abs(cv) < frond) {
              const pinna = 0.55 + 0.45 * Math.abs(Math.sin(cu * 55 + Math.sign(cv) * 1.2))
              const lit = 0.8 + 0.35 * clamp01(0.5 - cv / frond)
              const a = fern * smooth(frond, frond * 0.6, Math.abs(cv)) * pinna
              mr += (92 * lit - mr) * a
              mg += (149 * lit - mg) * a
              mb += (74 * lit - mb) * a
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
        let pr = (150 + (p2 - 0.5) * 37) * (0.94 + 0.1 * grain)
        let pg = (180 + (p2 - 0.5) * 28) * (0.94 + 0.1 * grain)
        let pb = (106 + (p2 - 0.5) * 15) * (0.94 + 0.1 * grain)
        const track = smooth(0.02, 0, Math.abs(fbm(x / 3.2, y / 3.2, seed + 83, 2) - 0.5)) * 0.3
        pr += (195 - pr) * track
        pg += (187 - pg) * track
        pb += (136 - pb) * track
        const rough = smooth(0.45, 0.1, Math.abs(fence)) * (0.7 + 0.3 * tuft)
        pr += (96 * tex - pr) * rough
        pg += (139 * tex - pg) * rough
        pb += (75 * tex - pb) * rough
        r += pr * wPasture
        g += pg * wPasture
        b += pb * wPasture
      }

      // 林子里：针叶铺地，一片片苔藓，落着球果
      if (wForest > 0) {
        const needle = 0.82 + 0.3 * valueNoise(x * 14 + y * 3, y * 14 - x * 3, seed + 87)
        let fr = 82 * needle
        let fg = 67 * needle
        let fb = 53 * needle
        const moss = smooth(0.5, 0.68, fbm(x / 2.5, y / 2.5, seed + 91, 2))
        fr += (78 * needle - fr) * moss
        fg += (116 * needle - fg) * moss
        fb += (68 * needle - fb) * moss
        const cone = cellNearest(x * 2.2, y * 2.2, seed + 93)
        if (cone.h > 0.7) {
          const d = Math.hypot(cone.dx * 1.6, cone.dy)
          const a = smooth(0.12, 0.08, d)
          fr += (112 - fr) * a
          fg += (82 - fg) * a
          fb += (57 - fb) * a
        }
        // 林子里那段小路
        const td = nearestSeg(prep.trail, prep.trailBuckets, x, y, PICK)
        if (td < 0.15) {
          const a = smooth(0.15, -0.05, td + (valueNoise(x * 4, y * 4, seed + 95) - 0.5) * 0.12)
          fr += (119 * (0.9 + 0.2 * grain) - fr) * a
          fg += (100 * (0.9 + 0.2 * grain) - fg) * a
          fb += (79 * (0.9 + 0.2 * grain) - fb) * a
        }
        r += fr * wForest
        g += fg * wForest
        b += fb * wForest
      }

      // 踩出来的路：中间是光秃的土，两边的草被踩得发黄
      if (wForest < 1) {
        const pd = nearestSeg(prep.paths, prep.pathBuckets, x, y, PICK)
        if (pd < 0.3) {
          const fade = PICK.k
          const core = smooth(0.0, -0.16, pd + (valueNoise(x * 3, y * 3, seed + 97) - 0.5) * 0.14) * fade
          const edge = smooth(0.3, 0.02, pd) * fade
          r += (r * 1.12 + 10 - r) * edge * 0.6
          g += (g * 1.04 - g) * edge * 0.6
          b += (b * 0.9 - b) * edge * 0.6
          const soil = (0.88 + 0.22 * grain) * (0.94 + 0.12 * valueNoise(x * 9, y * 9, seed + 99))
          r += (162 * soil - r) * core
          g += (136 * soil - g) * core
          b += (104 * soil - b) * core
        }
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
          let lr = 111 * bark
          let lgc = 88 * bark
          let lb = 69 * bark
          const moss = smooth(0.55, 0.75, fbm(s * 0.9, t * 3, seed + 105, 2)) * smooth(0.2, 0.9, nz)
          lr += (96 - lr) * moss
          lgc += (136 - lgc) * moss
          lb += (74 - lb) * moss
          const snap = smooth(half - 0.25, half - 0.05, s * -lg.root)
          lr += (199 - lr) * snap * (0.6 + 0.4 * valueNoise(t * 20, s * 8, seed + 107))
          lgc += (165 - lgc) * snap * 0.8
          lb += (121 - lb) * snap * 0.8
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
          r = (106 + root * 44) * k
          g = (83 + root * 29) * k
          b = (63 + root * 16) * k
        }
        const pit = ((rs * lg.root + 0.75) / 0.42) ** 2 + (rt / 0.95) ** 2
        if (pit < 1 && rs * lg.root < -0.2) {
          const k = 0.55 + 0.3 * Math.sqrt(pit)
          r = 88 * k
          g = 71 * k
          b = 55 * k
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
          r = rim ? 143 : 74 * sky
          g = rim ? 120 : 94 * sky
          b = rim ? 92 : 104 * sky
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
          r += ((dark ? 132 : 201) * k - r) * a
          g += ((dark ? 109 : 187) * k - g) * a
          b += ((dark ? 84 : 160) * k - b) * a
        }
      }

      // 光：朝太阳的坡亮、背阴的坡暗，朝太阳的坡面整片比平地亮得更显眼；背阴的坡越陡看得见的天越少，朝太阳的坡有草地反上来的光补着；
      // 坡挡住太阳的地方落在影子里，跟树影差不多深、偏冷；
      // 树影与栅栏、倒木的影子；坡脚的窝里看得见的天少，坡脚外的草地也挨着坡暗一溜，坡顶圆圆的肩看得见的天多、亮一些；
      // 林缘下暗一些，林子里离草地越远越暗，这两样只在坡下；坡上那层略亮
      let shade = 0
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
      const ao = s < 0 ? 1 - 0.2 * smooth(-2.5, 0, s) : 0.8 + 0.2 * smooth(0, 0.8 * width, s)
      const shoulder = smooth(0.65, 0.9, s / width) * smooth(1.25, 1, s / width)
      const facing = 1 + 0.45 * sunny
      const woods = 1 - smooth(-0.2, 1.5, s)
      const under = 1 - 0.22 * smooth(-1.4, 0.4, forest) * woods
      const far = 1 - 0.38 * smooth(1.5, 7, forest) * woods
      const dim = facing * ao * (1 - shade) * under * far * (1 + 0.04 * up + 0.1 * shoulder)
      const sky = AMBIENT * (0.7 + 0.3 * nz + 0.3 * (1 - nz) * clamp01(aspect)) * dim
      const sun = DIRECT * lambert * (1 - 0.7 * sample(f, f.shade, x, y)) * dim
      r *= sky * SKY.r + sun * SUNLIGHT.r
      g *= sky * SKY.g + sun * SUNLIGHT.g
      b *= sky * SKY.b + sun * SUNLIGHT.b
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
  spruce: { dark: [35, 66, 60], lit: [102, 154, 114] },
  birch: { dark: [92, 135, 76], lit: [193, 232, 130] },
  shrub: { dark: [62, 101, 61], lit: [137, 186, 100] },
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
      const fill = smooth(0.5, 1.8, depth) * smooth(0.1, 0.8, -sample(f, f.climb, x, y)) * 0.96
      if (tree < 0 || alpha <= 0) {
        if (fill <= 0) {
          out[o + 3] = 0
          continue
        }
        const k = (0.72 + 0.4 * valueNoise(x * 6, y * 6, seed + 131)) * (1 - 0.3 * smooth(1.5, 7, depth))
        out[o] = 34 * k
        out[o + 1] = 53 * k
        out[o + 2] = 48 * k
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
      out[o] = ((cr + 50 * shine) * k * alpha + 34 * uk * under) / a
      out[o + 1] = ((cg + 50 * shine) * k * alpha + 53 * uk * under) / a
      out[o + 2] = ((cb + 20 * shine) * k * alpha + 48 * uk * under) / a
      out[o + 3] = a * 255
    }
  }
}

/** 草浪着色器用的遮罩：草地、牧场与坡上那层草甸为 1，坡面上越陡越淡，栅栏底下淡一些，林子里为 0；按地面贴图的范围，每格 MASK_PPU 个像素，满 alpha */
export function grassMask(sc: PaintScene): { data: Uint8ClampedArray<ArrayBuffer>; w: number; h: number } {
  const area = groundArea(sc)
  const w = Math.round(area.w * MASK_PPU)
  const h = Math.round(area.h * MASK_PPU)
  const data = new Uint8ClampedArray(w * h * 4)
  const { plan, cfg } = sc
  const e = plan.edges
  const line = footLine(e, -cfg.padU - plan.size, plan.size * 2 + cfg.padU)
  // 过了最宽的坡面再往外一格，遮罩已经是满的，不用再找最近的坡脚
  const cap = cfg.bank.heightM[1] / cfg.bank.riseM[0] + 1
  const L: Local = { a: 0, b: 0 }
  const N: Near = { climb: 0, width: 0, height: 0 }
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = area.x0 + (px + 0.5) / MASK_PPU
      const y = area.y0 + (py + 0.5) / MASK_PPU
      toLocal(plan.frame, x, y, L)
      nearFoot(line, L.a, L.b, cap, N)
      const t = clamp01(N.climb / N.width)
      const below = smooth(0.2, -0.8, forestDepth(e, L.a, L.b)) * (0.4 + 0.6 * smooth(0.1, 0.4, Math.abs(beyondFence(e, L.a, L.b))))
      const m = (below + (1 - below) * smooth(-0.3, 0.3, N.climb)) * (1 - 2.4 * t * (1 - t))
      const o = (py * w + px) * 4
      data[o] = m * 255
      data[o + 1] = 0
      data[o + 2] = 0
      data[o + 3] = 255
    }
  }
  return { data, w, h }
}
