import { AWAY, SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { fbm, valueNoise } from '../../util/noise'
import { FRAME_U } from '../../util/units'
import { Rng } from '../../util/rng'
import { inPond, inShore, moundEdge, nearWalk, walkDist, walkPoint, wobbleAt } from './layout'
import type { Cypress, SwampPlan, Walk } from './layout'
import type { SwampConfig } from '../../types/maps'

/** 树冠与香蒲那一层每格画多少像素 */
export const CANOPY_PPU = 24
/** 水面着色器的遮罩每格多少像素 */
export const MASK_PPU = 4
/** 东西按这么大（格）的格子分桶，画一个像素只看它那一桶 */
const BUCKET_U = 1
/** 树冠的影子顺着太阳的反方向落出去多远（格）：清晨的太阳低，影子长，雾把它冲淡 */
const CROWN_SHADOW_U = 2.6
/** 土墩与栈道比泥面高出多少（格，画影子用） */
const BANK_SHADOW_U = 0.16
const WALK_SHADOW_U = 0.22

type Rgb = [number, number, number]

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
function hash1(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return s - Math.floor(s)
}

const SL = Math.hypot(SUN.x, SUN.y, SUN.z)
const L = { x: SUN.x / SL, y: SUN.y / SL, z: SUN.z / SL } as const
const HL = Math.hypot(L.x, L.y, L.z + 1)
const H = { x: L.x / HL, y: L.y / HL, z: (L.z + 1) / HL } as const

/** 清晨的光：直射偏暖，天光与雾的散射偏青灰；地面的颜色按它们打光 */
const AMBIENT = 0.5
const DIRECT = 0.62
const WARM = [1.08, 1.0, 0.86] as const
const COOL = [0.92, 0.98, 1.04] as const

/** 画地面用到的那部分地图：只有数据，能整个发给画画的线程 */
export interface PaintScene {
  readonly cfg: SwampConfig
  readonly plan: SwampPlan
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

/** 画哪一层：地面；岸外水里的落羽杉树冠与香蒲；土台上的落羽杉树冠（一棵一棵地裁出来，树下有人时淡掉） */
export type PaintLayer = 'ground' | 'canopy' | 'crowns'

export type PaintJob = { readonly kind: 'setup'; readonly scene: PaintScene } | { readonly kind: 'paint'; readonly index: number; readonly layer: PaintLayer; readonly rect: PixelRect }

/** 画好的一块：像素在 rect 的范围里逐行排；index 是它在这批活里的序号 */
export interface PaintPiece {
  readonly index: number
  readonly layer: PaintLayer
  readonly rect: PixelRect
  readonly pixels: Uint8ClampedArray<ArrayBuffer>
}

export function pixelBuffer(rect: PixelRect): Uint8ClampedArray<ArrayBuffer> {
  return new Uint8ClampedArray((rect.x1 - rect.x0) * (rect.y1 - rect.y0) * 4)
}

/** 地面铺满方框：岸外是水 */
export const GROUND_AREA: Area = { x0: 0, y0: 0, w: FRAME_U, h: FRAME_U }

const PPU: Record<PaintLayer, number> = { ground: GROUND_PPU, canopy: CANOPY_PPU, crowns: CANOPY_PPU }

export function textureSize(layer: PaintLayer): { w: number; h: number } {
  return { w: Math.round(GROUND_AREA.w * PPU[layer]), h: Math.round(GROUND_AREA.h * PPU[layer]) }
}

/** 一段线：从 a 到 b，两头的半宽（格），颜色的种子 */
interface Stroke {
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
  readonly wa: number
  readonly wb: number
  readonly seed: number
}

/** 膝根：泥里顶出来的一个小尖墩，圆心与底半径（格），高（格） */
interface Knee {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly h: number
}

/** 树冠里的一团：圆心、半径（格）与顶多高（格） */
interface Clump {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly top: number
}

/** 一枝羽状叶：从 a 平伸到 b，最宽处半宽（格），离地多高（树冠里的相对高度，越高越先看见），所属的树 */
interface Frond {
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
  readonly w: number
  readonly top: number
  readonly tree: number
  readonly seed: number
}

/** 按格子分的桶：每桶记着罩到它的东西 */
interface Buckets {
  readonly cols: number
  readonly rows: number
  readonly lists: number[][]
}

const NONE: readonly number[] = []

function buckets(): Buckets {
  const cols = Math.ceil(GROUND_AREA.w / BUCKET_U)
  const rows = Math.ceil(GROUND_AREA.h / BUCKET_U)
  return { cols, rows, lists: Array.from({ length: cols * rows }, () => []) }
}

function file(bk: Buckets, k: number, x0: number, y0: number, x1: number, y1: number): void {
  const c0 = Math.max(0, Math.floor(x0 / BUCKET_U))
  const c1 = Math.min(bk.cols - 1, Math.floor(x1 / BUCKET_U))
  const r0 = Math.max(0, Math.floor(y0 / BUCKET_U))
  const r1 = Math.min(bk.rows - 1, Math.floor(y1 / BUCKET_U))
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) bk.lists[r * bk.cols + c]!.push(k)
}

function near(bk: Buckets, x: number, y: number): readonly number[] {
  const c = Math.floor(x / BUCKET_U)
  const r = Math.floor(y / BUCKET_U)
  if (c < 0 || r < 0 || c >= bk.cols || r >= bk.rows) return NONE
  return bk.lists[r * bk.cols + c]!
}

/** 点到一段线：离中线多远（格），沿线走到哪（0 到 1） */
const SEG = { d: 0, t: 0 }
function segAt(s: Pick<Stroke, 'ax' | 'ay' | 'bx' | 'by'>, x: number, y: number): typeof SEG {
  const dx = s.bx - s.ax
  const dy = s.by - s.ay
  const l2 = dx * dx + dy * dy
  const t = l2 > 0 ? clamp01(((x - s.ax) * dx + (y - s.ay) * dy) / l2) : 0
  SEG.d = Math.hypot(x - s.ax - dx * t, y - s.ay - dy * t)
  SEG.t = t
  return SEG
}

/** 画之前一次算好的：盘根、膝根、树冠的团与松萝、香蒲的叶与蒲棒，和它们的分桶 */
export interface Prepared {
  readonly roots: readonly Stroke[]
  readonly rootBk: Buckets
  readonly knees: readonly Knee[]
  readonly kneeBk: Buckets
  readonly clumps: readonly (readonly Clump[])[]
  readonly crownBk: Buckets
  readonly fronds: readonly Frond[]
  readonly frondBk: Buckets
  readonly moss: readonly Stroke[]
  readonly mossBk: Buckets
  readonly blades: readonly Stroke[]
  readonly spikes: readonly Stroke[]
  readonly reedBk: Buckets
  readonly spikeBk: Buckets
  readonly walkBk: Buckets
  readonly lilyBk: Buckets
}

/** 一棵落羽杉的盘根：从树干往外弯弯地伸出去，伸出土台一截扎进泥里 */
function rootsOf(t: Cypress, mound: number, rng: Rng, out: Stroke[]): void {
  const n = 7 + Math.floor(rng.next() * 5)
  for (let i = 0; i < n; i++) {
    let a = (i / n) * Math.PI * 2 + rng.next() * 0.5
    let x = t.x + Math.cos(a) * t.trunk * 0.85
    let y = t.y + Math.sin(a) * t.trunk * 0.85
    const reach = mound * (0.75 + rng.next() * 0.55)
    const steps = 5
    let w = 0.13 + rng.next() * 0.07
    for (let k = 0; k < steps; k++) {
      a += (rng.next() - 0.5) * 0.5
      const len = (reach - t.trunk) / steps
      const nx = x + Math.cos(a) * len
      const ny = y + Math.sin(a) * len
      const nw = w * 0.78
      out.push({ ax: x, ay: y, bx: nx, by: ny, wa: w, wb: nw, seed: i * 31 + k })
      x = nx
      y = ny
      w = nw
    }
  }
}

/** 一棵落羽杉的树冠：一层层平伸的枝把细叶托成一团团，中间高、往外一圈圈低下去，团与团之间透着缝；岸外的长得更松散 */
function clumpsOf(t: Cypress, rng: Rng): Clump[] {
  const out: Clump[] = [{ x: t.x + (rng.next() - 0.5) * 0.25, y: t.y + (rng.next() - 0.5) * 0.25, r: t.crown * 0.36, top: 1 }]
  const rings = [
    { n: 6, at: 0.32, r: 0.26, top: 0.85 },
    { n: 10, at: 0.6, r: 0.22, top: 0.66 },
    { n: 13, at: 0.84, r: 0.17, top: 0.48 },
  ]
  for (const ring of rings) {
    const turn = rng.next() * Math.PI * 2
    for (let i = 0; i < ring.n; i++) {
      if (rng.next() < (t.inWater ? 0.25 : 0.12)) continue
      const a = turn + ((i + (rng.next() - 0.5) * 0.7) / ring.n) * Math.PI * 2
      const d = t.crown * ring.at * (0.85 + rng.next() * 0.3)
      out.push({ x: t.x + Math.cos(a) * d, y: t.y + Math.sin(a) * d, r: t.crown * ring.r * (0.8 + rng.next() * 0.45), top: ring.top + (rng.next() - 0.5) * 0.1 })
    }
  }
  return out
}

/** 一棵落羽杉的羽状叶：一层层平伸的枝，里面一层高、往外一层层低下去，枝梢往外伸；按高低排好，低的先画 */
function frondsOf(t: Cypress, k: number, rng: Rng, out: Frond[]): void {
  const list: Frond[] = []
  const n = Math.round(70 + t.crown * 22)
  for (let i = 0; i < n; i++) {
    const rho = Math.pow(rng.next(), 0.7) * t.crown * 0.7
    const a = rng.next() * Math.PI * 2
    const ax = t.x + Math.cos(a) * rho
    const ay = t.y + Math.sin(a) * rho
    const dir = a + (rng.next() - 0.5) * (rho < t.crown * 0.25 ? 3 : 1.6)
    const len = t.crown * (0.22 + rng.next() * 0.26) * (t.inWater ? 1.1 : 1)
    if (rho + len * 0.8 > t.crown * 1.05) continue
    list.push({ ax, ay, bx: ax + Math.cos(dir) * len, by: ay + Math.sin(dir) * len, w: 0.11 + rng.next() * 0.09, top: 1 - rho / t.crown - rng.next() * 0.15, tree: k, seed: Math.floor(rng.next() * 1e6) })
  }
  list.sort((p, q) => p.top - q.top)
  out.push(...list)
}

/** 树冠外缘垂下来的松萝：从团的边上往画面下方（往外偏一点）挂下来一缕缕 */
function mossOf(cl: readonly Clump[], rng: Rng, out: Stroke[]): void {
  for (const c of cl) {
    const n = 2 + Math.floor(rng.next() * 4)
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.05 + rng.next() * 0.9) + (rng.next() < 0.3 ? Math.PI : 0)
      const ax = c.x + Math.cos(a) * c.r * 0.85
      const ay = c.y + Math.sin(a) * c.r * 0.85
      const len = 0.35 + rng.next() * 0.8
      const sway = (rng.next() - 0.5) * 0.35
      out.push({ ax, ay, bx: ax + sway + Math.cos(a) * 0.12, by: ay + len, wa: 0.05 + rng.next() * 0.04, wb: 0.01, seed: Math.floor(rng.next() * 1e6) })
    }
  }
}

/** 一丛香蒲：叶子从丛心往四周、往上斜着长，一半的茎顶上一根蒲棒 */
function reedsOf(r: SwampPlan['reeds'][number], rng: Rng, blades: Stroke[], spikes: Stroke[]): void {
  const n = 18 + Math.floor(rng.next() * 14)
  for (let i = 0; i < n; i++) {
    const bx = r.x + (rng.next() - 0.5) * r.r
    const by = r.y + (rng.next() - 0.5) * r.r * 0.8
    const a = -Math.PI / 2 + (rng.next() - 0.5) * 2.2
    const len = 0.45 + rng.next() * 0.75
    const tx = bx + Math.cos(a) * len * 0.55
    const ty = by + Math.sin(a) * len
    blades.push({ ax: bx, ay: by, bx: tx, by: ty, wa: 0.045, wb: 0.012, seed: i })
    if (rng.next() < 0.3) {
      const sx = bx + Math.cos(a) * len * 0.5
      const sy = by + Math.sin(a) * len * 0.92
      spikes.push({ ax: sx, ay: sy, bx: sx + Math.cos(a) * 0.05, by: sy - 0.2, wa: 0.055, wb: 0.05, seed: i })
    }
  }
}

/** 每个线程按同一个种子各算一遍，算出来一样 */
export function prepare(sc: PaintScene): Prepared {
  const plan = sc.plan
  const rng = new Rng(plan.seed ^ 0x6b1e)
  const roots: Stroke[] = []
  const knees: Knee[] = []
  const clumps: Clump[][] = []
  const moss: Stroke[] = []
  const fronds: Frond[] = []
  for (const t of plan.trees) {
    const mound = plan.hummocks.find((h) => h.kind === 'mound' && Math.hypot(h.x - t.x, h.y - t.y) < h.r)
    if (mound) {
      rootsOf(t, mound.r, rng, roots)
      // 膝根：土台边上与外面一圈泥里顶出来
      const n = 7 + Math.floor(rng.next() * 8)
      for (let i = 0; i < n; i++) {
        const a = rng.next() * Math.PI * 2
        const d = mound.r * wobbleAt(mound.wob, a) * (0.85 + rng.next() * 0.6)
        knees.push({ x: mound.x + Math.cos(a) * d, y: mound.y + Math.sin(a) * d, r: 0.06 + rng.next() * 0.07, h: 0.12 + rng.next() * 0.2 })
      }
    }
    const cl = clumpsOf(t, rng)
    clumps.push(cl)
    mossOf(cl, rng, moss)
    frondsOf(t, clumps.length - 1, rng, fronds)
  }
  const blades: Stroke[] = []
  const spikes: Stroke[] = []
  for (const r of plan.reeds) reedsOf(r, new Rng(r.seed), blades, spikes)
  const fileStrokes = (list: readonly Stroke[]): Buckets => {
    const bk = buckets()
    list.forEach((s, k) => {
      const w = Math.max(s.wa, s.wb)
      file(bk, k, Math.min(s.ax, s.bx) - w, Math.min(s.ay, s.by) - w, Math.max(s.ax, s.bx) + w, Math.max(s.ay, s.by) + w)
    })
    return bk
  }
  const kneeBk = buckets()
  knees.forEach((k, i) => file(kneeBk, i, k.x - k.r - 0.3, k.y - k.r - 0.3, k.x + k.r + 0.3, k.y + k.r + 0.3))
  const crownBk = buckets()
  plan.trees.forEach((t, i) => {
    const r = t.crown * 1.1
    const sx = AWAY.x * CROWN_SHADOW_U
    const sy = AWAY.y * CROWN_SHADOW_U
    file(crownBk, i, t.x - r + Math.min(0, sx), t.y - r + Math.min(0, sy), t.x + r + Math.max(0, sx), t.y + r + Math.max(0, sy))
  })
  const walkBk = buckets()
  plan.walks.forEach((w, i) => {
    for (let k = 1; k < w.pts.length; k++) {
      const a = w.pts[k - 1]!
      const b = w.pts[k]!
      const pad = w.width / 2 + WALK_SHADOW_U + 0.3
      file(walkBk, i, Math.min(a.x, b.x) - pad, Math.min(a.y, b.y) - pad, Math.max(a.x, b.x) + pad, Math.max(a.y, b.y) + pad)
    }
  })
  const lilyBk = buckets()
  plan.lilies.forEach((l, i) => file(lilyBk, i, l.x - l.r - 0.1, l.y - l.r - 0.1, l.x + l.r + 0.2, l.y + l.r + 0.2))
  const frondBk = buckets()
  fronds.forEach((f, i) => file(frondBk, i, Math.min(f.ax, f.bx) - f.w, Math.min(f.ay, f.by) - f.w, Math.max(f.ax, f.bx) + f.w, Math.max(f.ay, f.by) + f.w))
  return { roots, rootBk: fileStrokes(roots), knees, kneeBk, clumps, crownBk, fronds, frondBk, moss, mossBk: fileStrokes(moss), blades, spikes, reedBk: fileStrokes(blades), spikeBk: fileStrokes(spikes), walkBk, lilyBk }
}

/** 按法线打光：直射偏暖、散射偏冷，sh 是挡掉的直射 */
function light(nx: number, ny: number, nz: number, sh: number, out: Rgb): void {
  const d = Math.max(0, nx * L.x + ny * L.y + nz * L.z) * (1 - sh)
  for (let c = 0; c < 3; c++) out[c] = AMBIENT * COOL[c]! + DIRECT * d * WARM[c]!
}

const LIT: Rgb = [0, 0, 0]
const TMP: Rgb = [0, 0, 0]

/** 土墩上离实地边的距离（格）：只算土墩，不算栈道；kind 是 0 开局土台、1 落羽杉土台、2 草墩，h 是那一块 */
const MOUND = { d: -9, kind: -1, h: { x: 0, y: 0 } as { x: number; y: number } }
function moundDist(plan: SwampPlan, x: number, y: number): typeof MOUND {
  MOUND.d = -9
  MOUND.kind = -1
  for (const h of plan.hummocks) {
    if (Math.abs(x - h.x) > h.r * 1.5 + 1 || Math.abs(y - h.y) > h.r * 1.5 + 1) continue
    const v = moundEdge(h, x, y)
    if (v > MOUND.d) {
      MOUND.d = v
      MOUND.kind = h.kind === 'plaza' ? 0 : h.kind === 'mound' ? 1 : 2
      MOUND.h = h
    }
  }
  return MOUND
}

/** 栈道上这一点：板上为正的距离，沿线走到哪，横着偏多少；不在任何栈道附近 d 为 −9 */
const WALK_AT = { d: -9, s: 0, across: 0, walk: -1, broken: false }
function walkAt(plan: SwampPlan, prep: Prepared, x: number, y: number): typeof WALK_AT {
  WALK_AT.d = -9
  WALK_AT.walk = -1
  WALK_AT.broken = false
  for (const k of near(prep.walkBk, x, y)) {
    const w = plan.walks[k]!
    const n = nearWalk(w, x, y)
    const d = Math.min(w.width / 2 - n.d, n.over > 0 ? -n.over : Infinity)
    if (d <= WALK_AT.d) continue
    const p = walkPoint(w, n.s)
    WALK_AT.d = d
    WALK_AT.s = n.s
    WALK_AT.across = (x - p.x) * -p.dy + (y - p.y) * p.dx
    WALK_AT.walk = k
    WALK_AT.broken = w.breaks.some((b) => n.s > b.a && n.s < b.b)
  }
  return WALK_AT
}

/** 栈道的板：一块块横铺，板缝透下去；每块板颜色深浅、长短、钉子位置各不同；朽断处只剩两根托梁 */
function plank(w: Walk, s: number, across: number, d: number, seed: number, aa: number, out: Rgb): number {
  const pitch = 0.22
  const k = Math.floor(s / pitch)
  const f = s / pitch - k
  const h = hash1(k, seed)
  const ragged = (hash1(k, seed + 7) - 0.5) * 0.12
  const edge = d + ragged
  if (edge < 0) return 0
  const gap = smooth(0.06, 0.11, f) * smooth(0.06, 0.11, 1 - f)
  const grain = valueNoise(across * 2.5 + h * 50, s * 22 + k, seed + 3) * 0.6 + valueNoise(across * 9, s * 60, seed + 5) * 0.4
  const tone = 0.82 + 0.3 * h
  const rot = smooth(0.68, 0.95, valueNoise(across * 1.8 + k * 0.7, s * 3, seed + 11)) * 0.6
  // 风吹日晒的灰褐木板，有几块泡得发黑发绿
  const br = lerp(156, 104, rot) * tone * (0.9 + 0.18 * grain)
  const bg = lerp(134, 102, rot) * tone * (0.9 + 0.18 * grain)
  const bb = lerp(104, 72, rot) * tone * (0.9 + 0.18 * grain)
  const lip = smooth(0, 0.08, edge)
  const nail = Math.abs(Math.abs(across) - w.width * 0.32) < 0.035 && Math.abs(f - 0.5) < 0.12 ? 0.55 : 1
  const shade = (0.62 + 0.38 * lip) * (0.35 + 0.65 * gap) * nail
  out[0] = br * shade
  out[1] = bg * shade
  out[2] = bb * shade
  return smooth(-aa, aa, edge)
}

/** 泥的颜色：湿亮的褐泥，按泥面平缓的起伏打一层油亮的湿光；低处积着一汪汪映着淡金天光的水，水边一圈更湿更暗；几个冒过泡的小坑 */
function mud(x: number, y: number, seed: number, wet: number, out: Rgb): void {
  // 斜着取噪声，免得起伏顺着格子横平竖直
  const u = x * 0.8 + y * 0.6
  const v = -x * 0.6 + y * 0.8
  const hgtAt = (p: number, q: number): number => fbm(p * 0.3, q * 0.3, seed + 1, 3) * 0.55 + fbm(p * 0.85 + 7, q * 0.85, seed + 2, 3) * 0.45
  const hgt = hgtAt(u, v)
  const fine = valueNoise(x * 11, y * 11, seed + 3)
  const e = 0.3
  const gu = (hgtAt(u + e, v) - hgtAt(u - e, v)) / (2 * e)
  const gv = (hgtAt(u, v + e) - hgtAt(u, v - e)) / (2 * e)
  const gx = gu * 0.8 - gv * 0.6
  const gy = gu * 0.6 + gv * 0.8
  const nx = -gx * 0.9
  const ny = -gy * 0.9
  const nl = Math.hypot(nx, ny, 1)
  light(nx / nl, ny / nl, 1 / nl, 0, LIT)
  const damp = smooth(0.52, 0.72, hgt) * (1 - wet * 0.7)
  const r0 = lerp(68, 92, damp)
  const g0 = lerp(50, 69, damp)
  const b0 = lerp(37, 49, damp)
  const tex = 0.95 + 0.1 * fine
  out[0] = r0 * LIT[0]! * tex
  out[1] = g0 * LIT[1]! * tex
  out[2] = b0 * LIT[2]! * tex
  // 湿光：泥面上一片片油亮的反光，泛着晨光的暖色
  const spec = Math.pow(Math.max(0, (nx * H.x + ny * H.y + H.z) / nl), 18) * (1 - damp * 0.8) * 0.7
  const sky = 0.07 * (1 - damp)
  out[0] = out[0]! * (1 - sky) + 200 * sky + 170 * spec
  out[1] = out[1]! * (1 - sky) + 188 * sky + 150 * spec
  out[2] = out[2]! * (1 - sky) + 150 * sky + 108 * spec
  // 低洼处积着一汪水，映着淡金色的天光，水边一圈更湿更暗
  const pool = smooth(0.33, 0.285, hgt)
  const rim = smooth(0.37, 0.33, hgt) * (1 - pool)
  if (rim > 0) for (let c = 0; c < 3; c++) out[c] = out[c]! * (1 - 0.32 * rim)
  if (pool > 0) {
    const sky = 0.8 + 0.2 * valueNoise(x * 0.6, y * 0.6, seed + 9)
    const k = pool * 0.75
    out[0] = lerp(out[0]!, 150 * sky, k)
    out[1] = lerp(out[1]!, 140 * sky, k)
    out[2] = lerp(out[2]!, 104 * sky, k)
  }
  // 冒过的泥泡留下的小圆坑，坑边一点亮
  const cx = Math.floor(x * 1.6)
  const cy = Math.floor(y * 1.6)
  const hb = hash1(cx, cy + seed)
  if (hb > 0.9) {
    const bx = (cx + 0.5 + (hash1(cx + 3, cy) - 0.5) * 0.5) / 1.6
    const by = (cy + 0.5 + (hash1(cx, cy + 5) - 0.5) * 0.5) / 1.6
    const br = 0.04 + 0.05 * hash1(cx + 9, cy + 1)
    const dd = Math.hypot(x - bx, y - by)
    if (dd < br) {
      const t = dd / br
      const ring = smooth(0.55, 0.9, t) * (1 - smooth(0.9, 1, t))
      const glint = smooth(0.4, 0, Math.hypot(x - bx - br * 0.4, y - by - br * 0.4) / br)
      for (let c = 0; c < 3; c++) out[c] = out[c]! * (1 - 0.45 * (1 - t) * (1 - ring)) + 120 * glint * ring
    }
  }
}

/**
 * 实地的颜色：落羽杉的土台与开局土台铺着苔藓，杂着黑土与落下的锈红细叶，土台的边是被泥水泡黑的土坎；
 * 开局土台中间被踩出几片土；草墩是一簇簇往四周披散的草，梢子发黄，墩心发暗
 */
function turf(x: number, y: number, kind: number, d: number, h: { x: number; y: number }, seed: number, out: Rgb): void {
  const moss = fbm(x * 2.4, y * 2.4, seed + 21, 3)
  const tuft = valueNoise(x * 14, y * 14, seed + 23) * 0.6 + valueNoise(x * 33, y * 33, seed + 25) * 0.4
  let r: number
  let g: number
  let b: number
  if (kind === 2) {
    // 草墩：从墩心往外披散的草叶，一道道亮暗相间
    const ang = Math.atan2(y - h.y, x - h.x)
    const rho = Math.hypot(x - h.x, y - h.y)
    const twist = ang + rho * 0.6
    const blade = smooth(0.3, 0.75, valueNoise(twist * 30, rho * 2.5, seed + 31)) * 0.7 + valueNoise(twist * 70, rho * 5, seed + 33) * 0.3
    const tip = smooth(0, 1, rho / (rho + d + 1e-3))
    const dry = valueNoise(twist * 9, 0, seed + 37)
    r = lerp(58, lerp(150, 184, dry), blade * (0.35 + 0.65 * tip))
    g = lerp(62, lerp(160, 158, dry), blade * (0.35 + 0.65 * tip))
    b = lerp(34, lerp(76, 92, dry), blade * (0.35 + 0.65 * tip))
  } else {
    r = lerp(70, 130, moss) * (0.85 + 0.25 * tuft)
    g = lerp(96, 150, moss) * (0.85 + 0.25 * tuft)
    b = lerp(42, 70, moss) * (0.85 + 0.25 * tuft)
    const soil = smooth(0.6, 0.72, fbm(x * 0.9, y * 0.9, seed + 27, 3)) * 0.8
    const worn = kind === 0 ? smooth(0.56, 0.7, fbm(x * 0.4 + 3, y * 0.4, seed + 29, 2)) * 0.7 : 0
    const bare = Math.max(soil, worn)
    r = lerp(r, 88 + 16 * tuft, bare)
    g = lerp(g, 72 + 12 * tuft, bare)
    b = lerp(b, 50 + 8 * tuft, bare)
    // 落下的锈红细叶
    if (valueNoise(x * 24, y * 24, seed + 35) > 0.82 && moss < 0.55) {
      r = lerp(r, 150, 0.5)
      g = lerp(g, 96, 0.5)
      b = lerp(b, 56, 0.5)
    }
  }
  // 土坎：泥水泡黑的边
  const bank = smooth(0.22, 0, d)
  out[0] = lerp(r, 64, bank * 0.75)
  out[1] = lerp(g, 52, bank * 0.75)
  out[2] = lerp(b, 38, bank * 0.75)
}

/** 开阔的水面：墨绿的深水，岸边浅处透出泥底，近岸一片片浮萍；一层淡金的天光浮在水面上，离太阳那边越近越亮 */
function water(x: number, y: number, depth: number, seed: number, out: Rgb): void {
  const deep = smooth(0.1, 3.2, depth)
  const swirl = fbm(x * 0.45, y * 0.45, seed + 41, 3)
  const r = lerp(72, 22, deep) + 12 * swirl
  const g = lerp(66, 44, deep) + 16 * swirl
  const b = lerp(44, 38, deep) + 12 * swirl
  const glow = (0.06 + 0.2 * smooth(64, 6, x + y)) * (0.7 + 0.6 * fbm(x * 0.12, y * 0.12, seed + 43, 2)) * smooth(0, 1.5, depth)
  out[0] = lerp(r, 226, glow)
  out[1] = lerp(g, 206, glow)
  out[2] = lerp(b, 150, glow)
  // 浮萍：近岸一片片，黄绿的小点
  const patch = smooth(0.6, 0.7, fbm(x * 0.55, y * 0.55, seed + 45, 3)) * smooth(3.2, 0.8, depth)
  if (patch > 0) {
    const dot = smooth(0.6, 0.72, valueNoise(x * 20, y * 20, seed + 47))
    const k = patch * (0.6 + 0.4 * dot)
    out[0] = lerp(out[0]!, 120 + 36 * dot, k)
    out[1] = lerp(out[1]!, 150 + 30 * dot, k)
    out[2] = lerp(out[2]!, 52, k)
  }
}

/** 睡莲叶：一片圆叶缺一个口，叶脉从叶心放射出去，叶边微微翘起发亮；开花的叶上一朵白里透粉的花 */
function lily(prep: Prepared, plan: SwampPlan, x: number, y: number, aa: number, out: Rgb): number {
  let cover = 0
  for (const k of near(prep.lilyBk, x, y)) {
    const l = plan.lilies[k]!
    const dx = x - l.x
    const dy = y - l.y
    const d = Math.hypot(dx, dy)
    // 叶子的影子落在水面上
    const sx = x - AWAY.x * 0.06 - l.x
    const sy = y - AWAY.y * 0.06 - l.y
    if (d > l.r + aa) {
      if (Math.hypot(sx, sy) < l.r) for (let c = 0; c < 3; c++) out[c] = out[c]! * 0.75
      continue
    }
    const a = Math.atan2(dy, dx) - l.rot
    const notch = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.22 && d > l.r * 0.12
    if (notch) continue
    const k0 = 1 - smooth(l.r - aa, l.r + aa, d)
    const vein = Math.abs(Math.sin(a * 7)) < 0.12 && d > l.r * 0.15 ? 0.82 : 1
    const rimLift = smooth(l.r * 0.75, l.r, d)
    const lit = 0.85 + 0.25 * Math.max(0, -(dx * AWAY.x + dy * AWAY.y) / (d || 1)) * rimLift
    const tone = 0.85 + 0.2 * hash1(k, 3)
    out[0] = lerp(out[0]!, 70 * lit * vein * tone, k0)
    out[1] = lerp(out[1]!, 116 * lit * vein * tone, k0)
    out[2] = lerp(out[2]!, 50 * lit * vein * tone, k0)
    if (l.bloom) {
      const fx = x - (l.x + Math.cos(l.rot + 2.4) * l.r * 0.25)
      const fy = y - (l.y + Math.sin(l.rot + 2.4) * l.r * 0.25)
      const fd = Math.hypot(fx, fy)
      const fr = l.r * 0.55
      const petal = fr * (0.7 + 0.3 * Math.abs(Math.cos(Math.atan2(fy, fx) * 4)))
      if (fd < petal) {
        const core = smooth(fr * 0.22, fr * 0.12, fd)
        const pink = hash1(k, 11) < 0.4 ? 0.35 : 0.08
        const sh = 0.82 + 0.18 * (fd / petal)
        out[0] = lerp(250 * sh, 240, core)
        out[1] = lerp((236 - 70 * pink) * sh, 196, core)
        out[2] = lerp((232 - 40 * pink) * sh, 70, core)
      }
    }
    cover = Math.max(cover, k0)
  }
  return cover
}

/**
 * 泥潭的地面：岸外与水洼是开阔的水面，漂着睡莲与浮萍；岸里是湿亮的褐泥，低处积水映着天光；
 * 土墩高出泥面一截，长满苔藓与草，边上投下一线影子；落羽杉的盘根从树干伸出土台扎进泥里，膝根一个个顶出泥面；
 * 木栈道一块块横铺的木板架在托梁上、两边立着桩，朽断处只剩托梁；树冠的影子斜斜地落在地上
 */
export function paintGround(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect): void {
  const plan = sc.plan
  const seed = plan.seed & 0xffff
  const ppu = GROUND_PPU
  const aa = 0.7 / ppu
  const w = rect.x1 - rect.x0
  const col: Rgb = [0, 0, 0]
  const sx = AWAY.x
  const sy = AWAY.y
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = GROUND_AREA.x0 + (px + 0.5) / ppu
      const y = GROUND_AREA.y0 + (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      const shore = inShore(plan, x, y)
      const pond = inPond(plan, x, y)
      const wet = Math.max(-shore, pond)
      const wk = walkAt(plan, prep, x, y)
      const m = moundDist(plan, x, y)
      // 水与泥的交界：岸边一圈泥更湿、更暗，一线水
      const inWater = smooth(-0.05, 0.12, wet)
      if (inWater > 0) water(x, y, wet, seed, col)
      if (inWater < 1) {
        mud(x, y, seed, smooth(-1.2, 0, wet), TMP)
        for (let c = 0; c < 3; c++) col[c] = inWater > 0 ? lerp(TMP[c]!, col[c]!, inWater) : TMP[c]!
      }
      if (inWater > 0.5) lily(prep, plan, x, y, aa, col)
      // 泥眼：一圈圈的泥纹围着冒泡的地方
      for (const v of plan.vents) {
        const d = Math.hypot(x - v.x, y - v.y)
        if (d > 1.1) continue
        const ring = Math.pow(Math.abs(Math.sin(d * 14 - fbm(x * 2, y * 2, seed + 51, 2) * 3)), 6) * smooth(1.1, 0.2, d)
        const pit = smooth(0.32, 0.12, d)
        for (let c = 0; c < 3; c++) col[c] = col[c]! * (1 - 0.18 * ring - 0.35 * pit) + (c === 2 ? 0 : 10) * ring
      }
      // 土墩：高出泥面，边上一圈坡按太阳打光，背光那边往泥里投一线影子
      if (m.d > -aa) {
        // 土坎往外斜下去：法线顺着离边的距离往外倒
        const e = 0.06
        const gx = edgeOf(plan, m.h, x + e, y) - edgeOf(plan, m.h, x - e, y)
        const gy = edgeOf(plan, m.h, x, y + e) - edgeOf(plan, m.h, x, y - e)
        const slope = smooth(0.4, 0, m.d) * 1.4
        const nx = (-gx / (2 * e)) * slope
        const ny = (-gy / (2 * e)) * slope
        const nl = Math.hypot(nx, ny, 1)
        light(nx / nl, ny / nl, 1 / nl, 0, LIT)
        turf(x, y, m.kind, m.d, m.h, seed, TMP)
        const k = smooth(-aa, aa, m.d)
        for (let c = 0; c < 3; c++) col[c] = lerp(col[c]!, TMP[c]! * LIT[c]! * 1.05, k)
      } else if (moundDist(plan, x - sx * BANK_SHADOW_U, y - sy * BANK_SHADOW_U).d > 0) {
        for (let c = 0; c < 3; c++) col[c] = col[c]! * 0.68
      }
      // 盘根：从树干往外爬，伸出土台扎进泥里，背上长着苔藓
      for (const k of near(prep.rootBk, x, y)) {
        const s = prep.roots[k]!
        const g = segAt(s, x, y)
        const rw = lerp(s.wa, s.wb, g.t)
        if (g.d > rw + aa) {
          const sh = segAt(s, x - sx * 0.08, y - sy * 0.08)
          if (sh.d < lerp(s.wa, s.wb, sh.t)) for (let c = 0; c < 3; c++) col[c] = col[c]! * 0.82
          continue
        }
        const across = g.d / rw
        const nz = Math.sqrt(Math.max(0, 1 - across * across))
        const dx = s.bx - s.ax
        const dy = s.by - s.ay
        const len = Math.hypot(dx, dy) || 1
        const side = ((x - s.ax) * -dy + (y - s.ay) * dx) / len >= 0 ? 1 : -1
        const nx = (-dy / len) * across * side
        const ny = (dx / len) * across * side
        light(nx, ny, nz, 0, LIT)
        const ridge = 0.85 + 0.15 * valueNoise(g.t * len * 18, across * 3, seed + s.seed)
        const mossy = smooth(0.45, 0.7, fbm(x * 3, y * 3, seed + 61, 2)) * nz
        const k0 = 1 - smooth(rw - aa, rw + aa, g.d)
        const r = lerp(116, 108, mossy) * ridge
        const gg = lerp(92, 138, mossy) * ridge
        const b = lerp(76, 58, mossy) * ridge
        col[0] = lerp(col[0]!, r * LIT[0]!, k0)
        col[1] = lerp(col[1]!, gg * LIT[1]!, k0)
        col[2] = lerp(col[2]!, b * LIT[2]!, k0)
      }
      // 膝根：泥里顶出来的小尖墩，尖顶发亮，背光那边投下影子
      for (const k of near(prep.kneeBk, x, y)) {
        const kn = prep.knees[k]!
        const d = Math.hypot(x - kn.x, y - kn.y)
        if (d > kn.r + aa) {
          const sd = Math.hypot(x - sx * kn.h * 1.2 - kn.x, y - sy * kn.h * 1.2 - kn.y)
          const along = (x - kn.x) * sx + (y - kn.y) * sy
          if (along > 0 && along < kn.h * 1.6 && sd < kn.r * (1 - along / (kn.h * 2))) for (let c = 0; c < 3; c++) col[c] = col[c]! * 0.7
          continue
        }
        const t = d / kn.r
        const nx = ((x - kn.x) / (d || 1)) * 0.8
        const ny = ((y - kn.y) / (d || 1)) * 0.8
        light(nx, ny, 0.6, 0, LIT)
        const k0 = 1 - smooth(kn.r - aa, kn.r + aa, d)
        const tip = smooth(0.35, 0, t)
        col[0] = lerp(col[0]!, (104 + 40 * tip) * LIT[0]!, k0)
        col[1] = lerp(col[1]!, (82 + 34 * tip) * LIT[1]!, k0)
        col[2] = lerp(col[2]!, (66 + 26 * tip) * LIT[2]!, k0)
      }
      // 栈道：托梁、木板、桩，往泥里投下影子
      if (wk.walk >= 0) {
        const wl = plan.walks[wk.walk]!
        const beam = Math.min(Math.abs(wk.across - wl.width * 0.32), Math.abs(wk.across + wl.width * 0.32))
        if (wk.d > -aa && wk.broken) {
          // 朽断处：板没了，两根发黑的托梁还横在泥上
          const k0 = 1 - smooth(0.05, 0.05 + aa, beam)
          if (k0 > 0) for (let c = 0; c < 3; c++) col[c] = lerp(col[c]!, [62, 52, 44][c]! * (0.85 + 0.3 * valueNoise(wk.s * 8, 0, seed + 71)), k0)
        } else if (wk.d > -aa) {
          const k0 = plank(wl, wk.s, wk.across, wk.d, wk.walk * 977 + seed, aa, TMP)
          if (k0 > 0) {
            const mossy = smooth(0.66, 0.82, fbm(x * 2.5, y * 2.5, seed + 73, 2)) * smooth(0.2, 0, wk.d) * 0.45
            for (let c = 0; c < 3; c++) col[c] = lerp(col[c]!, lerp(TMP[c]!, [86, 112, 54][c]!, mossy), k0)
          }
        } else {
          const sh = walkAt(plan, prep, x - sx * WALK_SHADOW_U, y - sy * WALK_SHADOW_U)
          if (sh.d > 0 && !sh.broken) for (let c = 0; c < 3; c++) col[c] = col[c]! * 0.6
        }
        for (const p of wl.posts) {
          const d = Math.hypot(x - p.x, y - p.y)
          if (d < 0.11) {
            const top = smooth(0.11, 0.07, d)
            const ring = Math.abs(Math.sin(d * 120)) * 0.15
            for (let c = 0; c < 3; c++) col[c] = lerp(col[c]!, [70, 58, 46][c]! * (1 + 0.5 * top - ring), smooth(0.11, 0.1, d))
          } else if (Math.hypot(x - sx * 0.25 - p.x, y - sy * 0.25 - p.y) < 0.1) {
            for (let c = 0; c < 3; c++) col[c] = col[c]! * 0.7
          }
        }
      }
      // 落羽杉的树干：板根张开，一道道棱从根部放射开
      for (const t of plan.trees) {
        if (t.inWater) continue
        const dx = x - t.x
        const dy = y - t.y
        const d = Math.hypot(dx, dy)
        const a = Math.atan2(dy, dx)
        const flare = t.trunk * (1.15 + 0.3 * Math.pow(Math.abs(Math.sin(a * 3.5 + t.seed)), 3))
        if (d > flare + aa) continue
        const tt = d / flare
        const nz = Math.sqrt(Math.max(0, 1 - tt * tt)) * 0.7 + 0.3
        light((dx / (d || 1)) * (1 - nz), (dy / (d || 1)) * (1 - nz), nz, 0, LIT)
        const ridges = 0.75 + 0.25 * Math.abs(Math.sin(a * 22 + valueNoise(d * 6, a, t.seed) * 2))
        const k0 = 1 - smooth(flare - aa, flare + aa, d)
        col[0] = lerp(col[0]!, 112 * ridges * LIT[0]!, k0)
        col[1] = lerp(col[1]!, 88 * ridges * LIT[1]!, k0)
        col[2] = lerp(col[2]!, 74 * ridges * LIT[2]!, k0)
      }
      // 树冠的影子：斜斜地落出去一大片，边缘被雾冲得很软
      let shade = 0
      for (const k of near(prep.crownBk, x, y)) {
        const t = plan.trees[k]!
        const qx = x - sx * CROWN_SHADOW_U * (t.inWater ? 1.2 : 1)
        const qy = y - sy * CROWN_SHADOW_U * (t.inWater ? 1.2 : 1)
        for (const c of prep.clumps[k]!) {
          const d = Math.hypot(qx - c.x, qy - c.y)
          shade = Math.max(shade, smooth(c.r * 1.05, c.r * 0.55, d) * (0.85 + 0.15 * valueNoise(qx * 4, qy * 4, seed + 81)))
        }
      }
      if (shade > 0) {
        const k = 1 - 0.38 * shade
        col[0] = col[0]! * k
        col[1] = col[1]! * k
        col[2] = col[2]! * (k + 0.06 * shade)
      }
      out[o] = col[0]!
      out[o + 1] = col[1]!
      out[o + 2] = col[2]!
      out[o + 3] = 255
    }
  }
}

/** 某一块土墩离边多远：只为求坡的法线 */
function edgeOf(plan: SwampPlan, h: { x: number; y: number }, x: number, y: number): number {
  const m = plan.hummocks.find((q) => q === h)
  return m ? moundEdge(m, x, y) : -9
}

/** 落羽杉的叶色：羽状的细叶嫩绿里带黄，几棵偏橄榄、几棵叶尖已经泛出锈红；背光处沉进雾的青灰，向阳的叶尖泛着晨光的暖色 */
const FOLIAGE: readonly { readonly dark: Rgb; readonly mid: Rgb; readonly lit: Rgb }[] = [
  { dark: [40, 58, 46], mid: [92, 120, 72], lit: [178, 190, 118] },
  { dark: [44, 58, 42], mid: [100, 118, 66], lit: [184, 182, 112] },
  { dark: [40, 56, 48], mid: [86, 116, 80], lit: [164, 186, 124] },
  { dark: [50, 56, 42], mid: [118, 112, 66], lit: [196, 168, 104] },
]

/** 一棵树的树冠与松萝，按透明度叠进 px（预乘过的颜色与 alpha）：羽状叶一枝枝叠上去，低的先画，每枝两边一根根细叶，枝梢往下垂、更暗 */
function paintTree(sc: PaintScene, prep: Prepared, k: number, x: number, y: number, seed: number, px: [number, number, number, number]): void {
  const t = sc.plan.trees[k]!
  if (Math.abs(x - t.x) > t.crown * 1.6 + 1.3 || Math.abs(y - t.y) > t.crown * 1.6 + 1.3) return
  const pal = FOLIAGE[t.seed % FOLIAGE.length]!
  // 树冠的底子：枝叶缝里透出来的是里面更暗的枝叶，不是地面
  const rho = Math.hypot(x - t.x, y - t.y) / t.crown
  const body = smooth(0.82, 0.45, rho * (0.9 + 0.2 * valueNoise(x * 3, y * 3, seed + 89)))
  if (body > 0) {
    const k = 0.55 + 0.25 * valueNoise(x * 12, y * 12, seed + 87)
    over(px, pal.dark[0] * k * 1.1, pal.dark[1] * k * 1.15, pal.dark[2] * k, body * 0.92)
  }
  for (const i of near(prep.frondBk, x, y)) {
    const f = prep.fronds[i]!
    if (f.tree !== k) continue
    const g = segAt(f, x, y)
    const dx = f.bx - f.ax
    const dy = f.by - f.ay
    const len = Math.hypot(dx, dy) || 1
    // 枝的轮廓：两头尖、靠里那半最宽，边上一根根细叶参差
    const width = f.w * Math.pow(Math.sin(Math.PI * Math.min(1, g.t * 0.9 + 0.08)), 0.7)
    const side = ((x - f.ax) * -dy + (y - f.ay) * dx) / len
    const needles = 0.5 + 0.5 * Math.sin(g.t * len * 46 + Math.abs(side) * 30 + (f.seed % 7))
    const edge = width * (0.72 + 0.32 * needles)
    if (g.d > edge) continue
    const across = g.d / (edge || 1)
    // 法线：横着是圆的枝背，顺着往枝梢垂下去
    const sx = side >= 0 ? 1 : -1
    const nx = (-dy / len) * across * sx * 0.8 + (dx / len) * g.t * 0.5
    const ny = (dx / len) * across * sx * 0.8 + (dy / len) * g.t * 0.5
    const nz = Math.sqrt(Math.max(0.05, 1 - across * across * 0.6))
    const nl = Math.hypot(nx, ny, nz)
    const lit = clamp01(((nx * L.x + ny * L.y + nz * L.z) / nl + 0.15) / 1.15)
    const height = f.top - 0.35 * g.t
    const fine = valueNoise(x * 34, y * 34, seed + f.seed)
    const shade = (0.8 + 0.25 * needles) * (0.86 + 0.18 * fine) * (0.62 + 0.38 * clamp01(height + 0.35))
    const lo = lit < 0.5 ? lit * 2 : 1
    const hi = lit < 0.5 ? 0 : (lit - 0.5) * 2
    const r = lerp(lerp(pal.dark[0], pal.mid[0], lo), pal.lit[0], hi) * shade
    const gg = lerp(lerp(pal.dark[1], pal.mid[1], lo), pal.lit[1], hi) * shade
    const b = lerp(lerp(pal.dark[2], pal.mid[2], lo), pal.lit[2], hi) * shade
    over(px, r, gg, b, smooth(1, 0.7, across) * (0.88 + 0.12 * needles))
  }
  // 松萝：一缕缕灰绿的须垂在树冠边上，细丝顺着往下
  for (const m of near(prep.mossBk, x, y)) {
    const s = prep.moss[m]!
    if (Math.abs(s.ax - t.x) > t.crown * 1.4 || Math.abs(s.ay - t.y) > t.crown * 1.4) continue
    const g = segAt(s, x, y)
    const w = lerp(s.wa, s.wb, g.t)
    if (g.d > w) continue
    const strand = smooth(0.4, 0.8, valueNoise((x - s.ax) * 70, g.t * 6, s.seed))
    const a = (1 - g.d / w) * (0.3 + 0.5 * strand) * (1 - 0.55 * g.t)
    const lit = 0.8 + 0.25 * (1 - g.t)
    over(px, 140 * lit, 150 * lit, 128 * lit, a)
  }
}

/** 往 px（预乘的颜色与 alpha）上按透明度叠一层 */
function over(px: [number, number, number, number], r: number, g: number, b: number, a: number): void {
  if (a <= 0) return
  const k = 1 - a
  px[0] = r * a + px[0] * k
  px[1] = g * a + px[1] * k
  px[2] = b * a + px[2] * k
  px[3] = a + px[3] * k
}

/** 一丛香蒲：细长的叶子从水里斜着长出来，向阳的一边亮；蒲棒是一截褐色的圆柱 */
function paintReeds(prep: Prepared, x: number, y: number, seed: number, px: [number, number, number, number]): void {
  for (const k of near(prep.reedBk, x, y)) {
    const s = prep.blades[k]!
    const g = segAt(s, x, y)
    const w = lerp(s.wa, s.wb, g.t)
    if (g.d > w) continue
    const side = clamp01(0.5 + ((x - s.ax) * L.x + (y - s.ay) * L.y) * 4)
    const tone = 0.75 + 0.35 * g.t + 0.15 * side
    const a = smooth(w, w * 0.4, g.d) * 0.95
    over(px, lerp(78, 150, g.t) * tone, lerp(118, 162, g.t) * tone, lerp(50, 70, g.t) * tone, a)
  }
  for (const k of near(prep.spikeBk, x, y)) {
    const s = prep.spikes[k]!
    const g = segAt(s, x, y)
    if (g.d > s.wa) continue
    const round = Math.sqrt(1 - (g.d / s.wa) ** 2)
    const k0 = 0.7 + 0.4 * round * valueNoise(x * 40, y * 40, seed + s.seed)
    over(px, 112 * k0, 72 * k0, 42 * k0, smooth(s.wa, s.wa * 0.6, g.d))
  }
}

const PX: [number, number, number, number] = [0, 0, 0, 0]

/** 岸外水里的落羽杉树冠与岸边的香蒲（canopy），或土台上的落羽杉树冠（crowns）：预乘过的颜色存成直通的 */
export function paintCanopy(sc: PaintScene, prep: Prepared, out: Uint8ClampedArray, rect: PixelRect, layer: 'canopy' | 'crowns'): void {
  const plan = sc.plan
  const seed = plan.seed & 0xffff
  const ppu = CANOPY_PPU
  const w = rect.x1 - rect.x0
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = GROUND_AREA.x0 + (px + 0.5) / ppu
      const y = GROUND_AREA.y0 + (py + 0.5) / ppu
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      PX[0] = PX[1] = PX[2] = PX[3] = 0
      if (layer === 'canopy') paintReeds(prep, x, y, seed, PX)
      for (const k of near(prep.crownBk, x, y)) if (plan.trees[k]!.inWater === (layer === 'canopy')) paintTree(sc, prep, k, x, y, seed, PX)
      const a = PX[3]
      out[o] = a > 0 ? PX[0] / a : 0
      out[o + 1] = a > 0 ? PX[1] / a : 0
      out[o + 2] = a > 0 ? PX[2] / a : 0
      out[o + 3] = a * 255
    }
  }
}

/** 一棵土台上的落羽杉连同松萝在贴图上占的范围，格：裁出来单独画 */
export function crownBox(t: Cypress): { x0: number; y0: number; x1: number; y1: number } {
  const r = t.crown * 1.25 + 0.2
  return { x0: Math.max(0, t.x - r), y0: Math.max(0, t.y - r), x1: Math.min(FRAME_U, t.x + r), y1: Math.min(FRAME_U, t.y + r + 1.2) }
}

/** 水面着色器的遮罩：红是开阔的水（岸外与水洼），绿是离岸多远（3 格算满）；栈桥底下不算 */
export function waterMask(sc: PaintScene): { data: Uint8ClampedArray<ArrayBuffer>; w: number; h: number } {
  const plan = sc.plan
  const w = Math.round(GROUND_AREA.w * MASK_PPU)
  const h = Math.round(GROUND_AREA.h * MASK_PPU)
  const data = new Uint8ClampedArray(w * h * 4)
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = GROUND_AREA.x0 + (px + 0.5) / MASK_PPU
      const y = GROUND_AREA.y0 + (py + 0.5) / MASK_PPU
      const wet = Math.max(-inShore(plan, x, y), inPond(plan, x, y))
      const pier = plan.walks.some((wk) => wk.pier && walkDist(wk, x, y) > -0.1)
      const lily = plan.lilies.some((l) => Math.hypot(x - l.x, y - l.y) < l.r)
      const o = (py * w + px) * 4
      data[o] = pier ? 0 : smooth(-0.1, 0.25, wet) * 255
      data[o + 1] = clamp01(wet / 3) * 255
      data[o + 2] = lily ? 255 : 0
      data[o + 3] = 255
    }
  }
  return { data, w, h }
}

