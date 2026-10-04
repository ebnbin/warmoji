import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { cellEdge, cellNearest, fbm, valueNoise } from '../../util/noise'
import { UNIT } from '../../util/units'
import { toLocal, toWorld } from './layout'
import type { RuinsConfig } from '../../types/maps'
import type { Basin } from '../worlds/basin'
import type { Door, Fallen, Frame, Space, Tree } from './layout'
import type { Grid, Structure } from './masonry'

/** 树冠贴图每格多少像素：树冠边是软的，用不着地面那么细 */
export const CANOPY_PPU = 16
/** 树按这么大（格）的格子分桶，画一个像素只看附近几桶 */
const BUCKET_U = 2
/** 树影最多拖出这么远（格） */
const TREE_SHADOW_U = 7
/** 一段鼓形柱身多长，格 */
const DRUM_U = 0.9
/** 立面按假想的斜俯视画：墙每高一米，朝屏幕下方的那一面露出多宽（格）；整面最多露出 FACE_MAX_U 格，再高的墙按比例压扁 */
const FACE_U_PER_M = 0.2
const FACE_MAX_U = 0.55
/** 立面上一排石块在贴图上至少这么高（像素）：压扁的高墙几层并成一排画 */
const COURSE_MIN_PX = 3.5
/** 立着的石柱一段多高，米 */
const DRUM_M = 0.62
/** 墙投下的影子挡掉多少阳光 */
const WALL_SHADE = 0.34

const LXY = Math.hypot(SUN.x, SUN.y)
const LEN = Math.hypot(SUN.x, SUN.y, SUN.z)
const LX = SUN.x / LEN
const LY = SUN.y / LEN
const LZ = SUN.z / LEN
/** 太阳每升高一米，影子在地上往外拖多少米 */
const SHADOW_PER_M = LXY / SUN.z
/** 影子的光线每往太阳那边走一米升高多少米 */
const RISE = SUN.z / LXY

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const fract = (v: number): number => v - Math.floor(v)
/** 整数上的哈希，落在 [0, 1) */
function hash(a: number, b: number, seed: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** 画地面、树冠用到的那部分地图：只有数据，能整个发给画画的线程 */
export interface PaintScene {
  readonly cfg: RuinsConfig
  readonly w: number
  readonly h: number
  readonly frame: Frame
  readonly grid: Grid
  readonly structures: readonly Structure[]
  readonly sid: Uint16Array
  readonly spaces: readonly Space[]
  readonly doors: readonly Door[]
  readonly fallen: readonly Fallen[]
  readonly basin: Basin
  readonly trees: readonly Tree[]
  readonly seed: number
  /** 标准身高的身体跨得过几层石块：不高于它的残基画成贴地的墙基，高过它的才画成墙 */
  readonly walk: number
}

/** 砌体此刻的样子：每批活之前发给线程 */
export interface PaintState {
  readonly n: Uint8Array
  readonly timber: Uint8Array
  readonly rubble: Float32Array
}

/** 贴图上以像素计的一块：[x0, x1) × [y0, y1) */
export interface PixelRect {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

export type PaintLayer = 'ground' | 'canopy'

/** 发给画画的线程：先 setup 一次，每批活前发一次 state，再一块一块要 paint */
export type PaintJob =
  | { readonly kind: 'setup'; readonly scene: PaintScene }
  | { readonly kind: 'state'; readonly state: PaintState }
  | { readonly kind: 'paint'; readonly index: number; readonly layer: PaintLayer; readonly rect: PixelRect }

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

/** 地面与树冠贴图的大小，像素：铺满地图与外面一圈 */
export function textureSize(sc: Pick<PaintScene, 'w' | 'h'>, layer: PaintLayer): { w: number; h: number } {
  const ppu = layer === 'ground' ? GROUND_PPU : CANOPY_PPU
  return { w: Math.round(sc.w * ppu), h: Math.round(sc.h * ppu) }
}

/** 树按位置分桶：键是桶的行列 */
interface TreeIndex {
  readonly cols: number
  readonly buckets: Map<number, number[]>
}

/** 一局里不变的：树影与树冠的分桶，每棵树的影子落在哪；每根石柱占着哪几格 */
export interface Static {
  readonly shadows: TreeIndex
  readonly crowns: TreeIndex
  readonly cast: readonly { readonly x: number; readonly y: number; readonly r: number }[]
  readonly columns: ReadonlyMap<number, readonly number[]>
}

/** 跟着砌体变的：每格被挡住太阳的高度（米，低于它就在影子里）、地面上的影子（模糊过，边是软的），每格被周围的墙挡掉多少天光 */
export interface Prepared {
  readonly shadow: Float32Array
  readonly ground: Float32Array
  readonly ao: Float32Array
}

function shadowOf(cfg: RuinsConfig, tr: Tree): { x: number; y: number; r: number } {
  const off = Math.min(TREE_SHADOW_U, (tr.h * 0.65 * SHADOW_PER_M) / cfg.meterPerU)
  return { x: tr.x - (SUN.x / LXY) * off, y: tr.y - (SUN.y / LXY) * off, r: tr.r * 0.92 }
}

function indexTrees(sc: PaintScene, discs: readonly { x: number; y: number; r: number }[], pad: number): TreeIndex {
  const cols = Math.ceil(sc.w / BUCKET_U) + 1
  const buckets = new Map<number, number[]>()
  discs.forEach((c, k) => {
    const r = c.r + pad
    for (let by = Math.max(0, Math.floor((c.y - r) / BUCKET_U)); by <= Math.floor((c.y + r) / BUCKET_U); by++) {
      for (let bx = Math.max(0, Math.floor((c.x - r) / BUCKET_U)); bx <= Math.min(cols - 1, Math.floor((c.x + r) / BUCKET_U)); bx++) {
        const key = by * cols + bx
        let list = buckets.get(key)
        if (!list) buckets.set(key, (list = []))
        list.push(k)
      }
    }
  })
  return { cols, buckets }
}

const NONE: readonly number[] = []
function near(ix: TreeIndex, x: number, y: number): readonly number[] {
  return ix.buckets.get(Math.floor(y / BUCKET_U) * ix.cols + Math.floor(x / BUCKET_U)) ?? NONE
}

export function prepareStatic(sc: PaintScene): Static {
  const cast = sc.trees.map((t) => shadowOf(sc.cfg, t))
  const columns = new Map<number, number[]>()
  for (let i = 0; i < sc.sid.length; i++) {
    const s = sc.sid[i]!
    if (s === 0 || sc.structures[s - 1]!.kind !== 'column') continue
    let list = columns.get(s)
    if (!list) columns.set(s, (list = []))
    list.push(i)
  }
  return { shadows: indexTrees(sc, cast, 1.4), crowns: indexTrees(sc, sc.trees, 0.1), cast, columns }
}

/** 这一点落在哪根还立着的石柱的圆里：返回它的序号加一与剩下的层数（取它各格里最高的），不在为 0 */
function columnAt(sc: PaintScene, stat: Static, st: PaintState, ci: number, cj: number, u: number, v: number): { sid: number; n: number } | null {
  const g = sc.grid
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const i = ci + di
      const j = cj + dj
      if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) continue
      const s = sc.sid[j * g.cols + i]!
      if (s === 0) continue
      const S = sc.structures[s - 1]!
      if (S.kind !== 'column') continue
      const rad = (S.u1 - S.u0) / 2
      if ((u - (S.u0 + S.u1) / 2) ** 2 + (v - (S.v0 + S.v1) / 2) ** 2 > rad * rad) continue
      let n = 0
      for (const k of stat.columns.get(s) ?? []) n = Math.max(n, st.n[k]!)
      return n > 0 ? { sid: s, n } : null
    }
  }
  return null
}

/** 地面上的点离旁边挡人的墙或木板多远（格）：看四邻，没有挡人的邻格为无穷 */
function besideWall(sc: PaintScene, st: PaintState, ci: number, cj: number, u: number, v: number): number {
  const g = sc.grid
  const fu = (u - g.u0) / g.cell - ci
  const fv = (v - g.v0) / g.cell - cj
  const tall = (i: number, j: number): boolean => heightAt(sc, st, i, j) > 0
  let d = Infinity
  if (tall(ci - 1, cj)) d = Math.min(d, fu * g.cell)
  if (tall(ci + 1, cj)) d = Math.min(d, (1 - fu) * g.cell)
  if (tall(ci, cj - 1)) d = Math.min(d, fv * g.cell)
  if (tall(ci, cj + 1)) d = Math.min(d, (1 - fv) * g.cell)
  return d
}

/** 墙顶离最近一道往下的边多远（格）与那道边朝外的方向（局部）：往下的边是相邻格比这格矮 */
function lowerEdge(sc: PaintScene, st: PaintState, ci: number, cj: number, u: number, v: number): { d: number; nu: number; nv: number } {
  const g = sc.grid
  const n = st.n[cj * g.cols + ci]!
  const fu = (u - g.u0) / g.cell - ci
  const fv = (v - g.v0) / g.cell - cj
  const at = (i: number, j: number): number => (i < 0 || j < 0 || i >= g.cols || j >= g.rows ? 0 : st.n[j * g.cols + i]!)
  let d = Infinity
  let nu = 0
  let nv = 0
  if (at(ci - 1, cj) < n && fu * g.cell < d) {
    d = fu * g.cell
    nu = -1
    nv = 0
  }
  if (at(ci + 1, cj) < n && (1 - fu) * g.cell < d) {
    d = (1 - fu) * g.cell
    nu = 1
    nv = 0
  }
  if (at(ci, cj - 1) < n && fv * g.cell < d) {
    d = fv * g.cell
    nu = 0
    nv = -1
  }
  if (at(ci, cj + 1) < n && (1 - fv) * g.cell < d) {
    d = (1 - fv) * g.cell
    nu = 0
    nv = 1
  }
  return { d, nu, nv }
}

/** 太阳在院落局部坐标里的水平方向（单位向量，指向太阳） */
function sunLocal(f: Frame): { su: number; sv: number } {
  const x = SUN.x / LXY
  const y = SUN.y / LXY
  return { su: x * f.cos + y * f.sin, sv: -x * f.sin + y * f.cos }
}

/** 格子 (i, j) 上挡人的东西有多高（米）：高过跨步的砌体或木板；跨得过的残基画成贴地的墙基，算作地面；格子外为零 */
function heightAt(sc: PaintScene, st: PaintState, i: number, j: number): number {
  const g = sc.grid
  if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) return 0
  const k = j * g.cols + i
  const n = st.n[k]!
  return Math.max(n > sc.walk ? n : 0, st.timber[k]!) * sc.cfg.masonry.courseM
}

/** 高 h 米的东西，立面上每高一米在屏幕上占多宽（格） */
function faceScale(h: number): number {
  return Math.min(FACE_U_PER_M, FACE_MAX_U / h)
}

/** 斜着看到的是什么：face 为真时是立面，z 是立面上的高度（米），(nu, nv) 是那道边朝外的方向（局部）；否则是顶，lip 表示再往下一点就是立面 */
interface Sight {
  face: boolean
  lip: boolean
  z: number
  nu: number
  nv: number
}

const SIGHT: Sight = { face: false, lip: false, z: 0, nu: 0, nv: 0 }

/** 从世界 (x, y) 格、高 h 米的顶上沿视线往屏幕下方斜着往下：每走 faceScale(h) 格低一米，走进比视线还矮的格子就看到了前一格的立面，落到地上还没穿出来就是顶 */
function sightAt(sc: PaintScene, st: PaintState, x: number, y: number, h: number): Sight {
  const g = sc.grid
  const o = SIGHT
  o.face = false
  o.lip = false
  const k = faceScale(h)
  const lip = 0.035 / k
  const step = 1 / GROUND_PPU
  let l = toLocal(sc.frame, x, y)
  let ci = Math.floor((l.u - g.u0) / g.cell)
  let cj = Math.floor((l.v - g.v0) / g.cell)
  for (let s = step * 0.5; s <= h * k + 0.035; s += step) {
    l = toLocal(sc.frame, x, y + s)
    const ni = Math.floor((l.u - g.u0) / g.cell)
    const nj = Math.floor((l.v - g.v0) / g.cell)
    if (ni === ci && nj === cj) continue
    const z = h - s / k
    const hh = heightAt(sc, st, ni, nj)
    if (hh < z - 1e-6) {
      o.face = true
      o.z = z
      o.nu = Math.sign(ni - ci)
      o.nv = ni === ci ? Math.sign(nj - cj) : 0
      return o
    }
    if (hh < h - 1e-6 && hh < z + lip) o.lip = true
    ci = ni
    cj = nj
  }
  return o
}

/** 每格的影子高度：沿着光线往太阳那边走，挡光的东西减去光线升起的高度取最大；走到最高的墙也投不过来的远处为止 */
function shadowHeights(sc: PaintScene, st: PaintState): Float32Array {
  const g = sc.grid
  const { su, sv } = sunLocal(sc.frame)
  const cellM = g.cell * sc.cfg.meterPerU
  const hc = sc.cfg.masonry.courseM
  let top = 0
  for (let i = 0; i < st.n.length; i++) top = Math.max(top, st.n[i]!, st.timber[i]!)
  const reach = (top * hc) / RISE / cellM
  const step = 0.6
  const out = new Float32Array(g.cols * g.rows)
  for (let j = 0; j < g.rows; j++) {
    for (let i = 0; i < g.cols; i++) {
      let s = 0
      for (let t = step; t <= reach; t += step) {
        const h = heightAt(sc, st, Math.floor(i + 0.5 + su * t), Math.floor(j + 0.5 + sv * t)) - t * cellM * RISE
        if (h > s) s = h
      }
      out[j * g.cols + i] = s
    }
  }
  return out
}

const DIR8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7071, 0.7071],
  [-0.7071, 0.7071],
  [0.7071, -0.7071],
  [-0.7071, -0.7071],
] as const

/** 每格被周围高出它的东西挡掉多少天光：往八个方向看几格内最陡的仰角 */
function occlusion(sc: PaintScene, st: PaintState): Float32Array {
  const g = sc.grid
  const cellM = g.cell * sc.cfg.meterPerU
  const out = new Float32Array(g.cols * g.rows)
  for (let j = 0; j < g.rows; j++) {
    for (let i = 0; i < g.cols; i++) {
      const h0 = heightAt(sc, st, i, j)
      let sum = 0
      for (const [dx, dy] of DIR8) {
        let best = 0
        for (let k = 1; k <= 6; k++) {
          const dh = heightAt(sc, st, Math.round(i + dx * k), Math.round(j + dy * k)) - h0
          if (dh > 0) best = Math.max(best, Math.atan2(dh, k * cellM))
        }
        sum += best / (Math.PI / 2)
      }
      out[j * g.cols + i] = sum / 8
    }
  }
  return out
}

/** 地面上的影子：贴地的点在不在影子里，再按 1-2-1 横竖各模糊两遍，影子的边不显出格子的台阶 */
function groundShade(g: Grid, shadow: Float32Array): Float32Array {
  const a = new Float32Array(shadow.length)
  for (let i = 0; i < a.length; i++) a[i] = smooth(-0.02, 0.1, shadow[i]!)
  const b = new Float32Array(a.length)
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < g.rows; j++) {
      for (let i = 0; i < g.cols; i++) {
        const k = j * g.cols + i
        b[k] = (a[i > 0 ? k - 1 : k]! + 2 * a[k]! + a[i < g.cols - 1 ? k + 1 : k]!) / 4
      }
    }
    for (let j = 0; j < g.rows; j++) {
      for (let i = 0; i < g.cols; i++) {
        const k = j * g.cols + i
        a[k] = (b[j > 0 ? k - g.cols : k]! + 2 * b[k]! + b[j < g.rows - 1 ? k + g.cols : k]!) / 4
      }
    }
  }
  return a
}

export function prepare(sc: PaintScene, st: PaintState): Prepared {
  const shadow = shadowHeights(sc, st)
  return { shadow, ground: groundShade(sc.grid, shadow), ao: occlusion(sc, st) }
}

/** 砌体格子里的场在局部 (u, v) 格处按格心双线性取值，格子外为零 */
function sample(g: Grid, a: Float32Array, u: number, v: number): number {
  const x = (u - g.u0) / g.cell - 0.5
  const y = (v - g.v0) / g.cell - 0.5
  if (x < -0.5 || y < -0.5 || x > g.cols - 0.5 || y > g.rows - 0.5) return 0
  const fx = Math.min(g.cols - 1.001, Math.max(0, x))
  const fy = Math.min(g.rows - 1.001, Math.max(0, y))
  const ix = Math.floor(fx)
  const iy = Math.floor(fy)
  const ax = fx - ix
  const ay = fy - iy
  const i = iy * g.cols + ix
  const p = a[i]!
  const q = a[i + 1]!
  const r = a[i + g.cols]!
  return p + (q - p) * ax + (r - p) * ay + (p - q - r + a[i + g.cols + 1]!) * ax * ay
}

/** 台地上离边多远（格，台地里为正） */
function siteRoom(b: Basin, x: number, y: number): number {
  const u = Math.min(b.cols - 1.001, Math.max(0, (x * UNIT - b.x0) / b.cell - 0.5))
  const v = Math.min(b.rows - 1.001, Math.max(0, (y * UNIT - b.y0) / b.cell - 0.5))
  const ix = Math.floor(u)
  const iy = Math.floor(v)
  const fx = u - ix
  const fy = v - iy
  const i = iy * b.cols + ix
  const a = b.room[i]!
  const c = b.room[i + 1]!
  const d = b.room[i + b.cols]!
  const e = b.room[i + b.cols + 1]!
  const inside = x >= 0 && y >= 0 && x <= (b.cols * b.cell) / UNIT && y <= (b.rows * b.cell) / UNIT
  const r = (a + (c - a) * fx + (d - a) * fy + (a - c - d + e) * fx * fy) / UNIT
  if (inside) return r
  return Math.min(r, -Math.max(-x, -y, x - (b.cols * b.cell) / UNIT, y - (b.rows * b.cell) / UNIT))
}

/** 几种砌墙的石头：暖色的石灰岩与砂岩，偏灰的，带赭色的 */
const STONES = [
  [214, 192, 152],
  [202, 178, 138],
  [220, 200, 162],
  [192, 174, 144],
  [208, 178, 130],
  [198, 170, 132],
] as const
/** 塔楼的石头更灰更旧 */
const TOWER_STONES = [
  [184, 172, 150],
  [172, 160, 140],
  [194, 180, 156],
  [164, 154, 138],
] as const
/** 铺地的石板 */
const SLABS = [
  [184, 168, 140],
  [172, 158, 132],
  [194, 178, 148],
  [166, 156, 136],
] as const
/** 赤陶地砖 */
const TILES = [
  [156, 96, 66],
  [142, 88, 62],
  [166, 108, 74],
  [132, 84, 64],
] as const
/** 风化的木板 */
const WOOD = [
  [124, 96, 64],
  [108, 84, 58],
  [138, 108, 74],
] as const
/** 几种野花：白、黄、淡紫 */
const FLOWERS = [
  [236, 232, 222],
  [228, 200, 74],
  [184, 160, 214],
] as const

/** 一个像素的颜色、表面离地多高（米）与法线（世界方向，z 朝上） */
interface Px {
  r: number
  g: number
  b: number
  z: number
  nx: number
  ny: number
  nz: number
  /** 这个像素是不是砌体或木板的顶：顶上不算墙脚的天光遮挡 */
  top: boolean
}

const PX: Px = { r: 0, g: 0, b: 0, z: 0, nx: 0, ny: 0, nz: 1, top: false }

function set(o: Px, r: number, g: number, b: number): void {
  o.r = r
  o.g = g
  o.b = b
}

function mix(o: Px, r: number, g: number, b: number, t: number): void {
  if (t <= 0) return
  o.r += (r - o.r) * t
  o.g += (g - o.g) * t
  o.b += (b - o.b) * t
}

/** 局部方向 → 世界方向 */
function toWorldDir(f: Frame, du: number, dv: number): { x: number; y: number } {
  return { x: du * f.cos - dv * f.sin, y: du * f.sin + dv * f.cos }
}

/** 草地：一片片深浅不一，草叶斜着长，零星开着成簇的野花；lush 越大越绿 */
function grass(o: Px, x: number, y: number, seed: number, lush: number, flowers: number): void {
  const patch = fbm(x / 6, y / 6, seed + 3, 2)
  const mid = fbm(x / 2, y / 2, seed + 5, 2)
  const dry = clamp01(smooth(0.42, 0.75, patch) * 0.9 - lush * 0.4)
  const green = clamp01(0.5 + (mid - 0.5) * 1.2 + lush * 0.25)
  let r = 98 + (70 - 98) * green + (152 - 98) * dry
  let g = 124 + (108 - 124) * green + (138 - 124) * dry
  let b = 54 + (44 - 54) * green + (78 - 54) * dry
  const blade = valueNoise(x * 6 + y * 2, y * 22 - x * 2.5, seed + 13)
  const tuft = valueNoise(x * 3.3 + 7.1, y * 3.3, seed + 15)
  const grain = valueNoise(x * 7, y * 7, seed + 9) * 0.5 + valueNoise(x * 17, y * 17, seed + 11) * 0.5
  const k = (0.9 + 0.14 * blade) * (0.94 + 0.12 * grain) * (0.93 + 0.12 * tuft)
  r *= k
  g *= k
  b *= k
  set(o, r, g, b)
  if (flowers <= 0) return
  const bloom = smooth(0.62, 0.7, fbm(x / 2.8, y / 2.8, seed + 19, 2)) * flowers
  if (bloom <= 0) return
  const dot = cellNearest(x * 5.5, y * 5.5, seed + 17)
  const d = Math.sqrt(dot.dx * dot.dx + dot.dy * dot.dy)
  if (d < 0.2 && dot.h < bloom * 0.85) {
    const c = FLOWERS[Math.floor(fbm(x / 9, y / 9, seed + 21, 1) * 2.999)]!
    mix(o, c[0], c[1], c[2], smooth(0.2, 0.1, d))
  }
}

/** 泥地：夯实的土，带细碎的小石子 */
function dirt(o: Px, x: number, y: number, seed: number): void {
  const grain = valueNoise(x * 9, y * 9, seed + 23) * 0.5 + valueNoise(x * 23, y * 23, seed + 25) * 0.5
  const tone = fbm(x / 2.5, y / 2.5, seed + 27, 2)
  set(o, (112 + 18 * tone) * (0.9 + 0.2 * grain), (96 + 14 * tone) * (0.9 + 0.2 * grain), (74 + 10 * tone) * (0.9 + 0.2 * grain))
  const peb = cellNearest(x * 7, y * 7, seed + 29)
  const pd = Math.sqrt(peb.dx * peb.dx + peb.dy * peb.dy)
  if (pd < 0.16 && peb.h < 0.55) mix(o, 150 + 30 * peb.h, 142 + 26 * peb.h, 124 + 20 * peb.h, smooth(0.16, 0.1, pd))
}

/**
 * 铺地：按院落的方向铺，石板一排排错缝，或是不规则的碎拼石，或是赤陶的方砖；石缝里长着苔藓与草，破损的地方石板没了，露出泥地与杂草
 */
function paving(o: Px, u: number, v: number, x: number, y: number, sp: Space, seed: number, alongU: boolean): void {
  const s = seed + Math.floor(sp.u0 * 7 + sp.v0 * 13)
  const a = alongU ? u : v
  const b = alongU ? v : u
  let inside = 1
  let id = 0
  let edge = 1
  if (sp.style === 0) {
    const rowH = 0.85
    const row = Math.floor(b / rowH)
    const len = 1.1 + 0.5 * hash(row, 1, s)
    const off = hash(row, 2, s) * len
    const col = Math.floor((a + off) / len)
    id = row * 131 + col
    const fa = fract((a + off) / len) * len
    const fb = fract(b / rowH) * rowH
    edge = Math.min(fa, len - fa, fb, rowH - fb)
    inside = smooth(0.016, 0.04, edge)
  } else if (sp.style === 1) {
    const q = cellNearest(a * 1.5, b * 1.5, s + 31)
    const e = cellEdge(a * 1.5, b * 1.5, s + 31)
    id = Math.floor(q.h * 997)
    edge = e / 1.5
    inside = smooth(0.02, 0.05, e)
  } else {
    const t = 0.5
    const fa = fract(a / t) * t
    const fb = fract(b / t) * t
    id = Math.floor(a / t) * 977 + Math.floor(b / t)
    edge = Math.min(fa, t - fa, fb, t - fb)
    inside = smooth(0.015, 0.035, edge)
  }
  const missing = hash(id, 7, s) < sp.worn * 0.45 * smooth(0.35, 0.65, fbm(x / 3, y / 3, s + 33, 2))
  if (missing) {
    dirt(o, x, y, seed)
    const weed = smooth(0.42, 0.66, fbm(x * 1.7, y * 1.7, s + 35, 2))
    if (weed > 0) {
      grass(PX2, x, y, seed + 41, 0.6, 0.4)
      mix(o, PX2.r, PX2.g, PX2.b, weed * 0.9)
    }
    return
  }
  const pal = sp.style === 2 ? TILES : SLABS
  const c = pal[Math.floor(hash(id, 3, s) * pal.length)]!
  const tint = 0.94 + 0.14 * hash(id, 5, s)
  const grain = valueNoise(x * 14, y * 14, s + 37) * 0.6 + valueNoise(x * 31, y * 31, s + 39) * 0.4
  const wear = 0.95 + 0.1 * fbm(x * 0.9, y * 0.9, s + 43, 2)
  set(o, c[0] * tint * (0.93 + 0.1 * grain) * wear, c[1] * tint * (0.93 + 0.1 * grain) * wear, c[2] * tint * (0.93 + 0.1 * grain) * wear)
  const crack = smooth(0.04, 0.012, cellEdge(x * 1.9, y * 1.9, s + 45)) * hash(id, 11, s) * sp.worn * 0.5
  mix(o, 96, 86, 68, crack)
  const lichen = smooth(0.66, 0.8, fbm(x * 1.2, y * 1.2, s + 47, 2)) * 0.35
  mix(o, 176, 172, 116, lichen)
  // 石缝：窄窄一道，长着苔藓与草，越破的地方草越多、从缝里漫到石板上
  const moss = smooth(0.3, 0.6, fbm(x / 2, y / 2, s + 49, 2))
  mix(o, 82 + 24 * moss, 90 + 40 * moss, 56 + 8 * moss, (1 - inside) * 0.9)
  const creep = smooth(0.5, 0.75, fbm(x * 0.8, y * 0.8, s + 51, 3)) * (0.3 + 0.7 * sp.worn) * smooth(0.25, 0.02, edge)
  if (creep > 0) {
    grass(PX2, x, y, seed + 43, 0.7, 0)
    mix(o, PX2.r, PX2.g, PX2.b, creep * 0.8)
  }
  o.z = -0.01 * (1 - inside)
}

const PX2: Px = { r: 0, g: 0, b: 0, z: 0, nx: 0, ny: 0, nz: 1, top: false }

/** 这一点在院落的哪块地面上：先回廊院，再回廊，再房间；不在院落里为 null */
function spaceAt(sc: PaintScene, u: number, v: number): Space | null {
  let walk: Space | null = null
  for (const sp of sc.spaces) {
    if (u < sp.u0 || u > sp.u1 || v < sp.v0 || v > sp.v1) continue
    if (sp.kind === 'garth') return sp
    if (sp.kind === 'walk') walk = sp
  }
  if (walk) return walk
  for (const sp of sc.spaces) if (sp.kind !== 'walk' && sp.kind !== 'garth' && u >= sp.u0 && u <= sp.u1 && v >= sp.v0 && v <= sp.v1) return sp
  return null
}

/** 院外通到门洞的小路：离通到院外的门洞的中线多远（格），在门外为正 */
function pathAt(sc: PaintScene, u: number, v: number): number {
  let best = 0
  for (const d of sc.doors) {
    if (!d.outer) continue
    const mid = (d.a + d.b) / 2
    const half = (d.b - d.a) / 2 + 0.3
    const along = d.axis === 0 ? u - mid : v - mid
    const across = d.axis === 0 ? v - d.line : u - d.line
    const out = d.line < 1 ? -across : across
    if (out < 0) continue
    const wobble = Math.sin(out * 0.9 + mid) * 0.35
    const w = half * (1 + out * 0.04)
    best = Math.max(best, smooth(w, w * 0.55, Math.abs(along - wobble)) * smooth(9, 3, out))
  }
  return best
}

/** 地上的碎石：盖住多少看深浅，薄处零零星星，厚处堆满；碎块是有棱角的多边形，每个面朝向不一、按太阳打光，大块夹着小块；石块之间是灰白的灰浆粉 */
function rubbleOn(o: Px, f: Frame, x: number, y: number, depth: number, seed: number): void {
  const cover = smooth(0.025, 0.15, depth)
  if (cover <= 0) return
  const dust = 0.88 + 0.2 * valueNoise(x * 11, y * 11, seed + 51)
  mix(o, 182 * dust, 166 * dust, 138 * dust, cover * 0.6)
  let topZ = 0
  for (let k = 0; k < 2; k++) {
    const scale = k === 0 ? 6 : 2.6
    const show = k === 0 ? cover : smooth(0.1, 0.32, depth)
    if (show <= 0) continue
    const q = cellNearest(x * scale, y * scale, seed + 53 + k * 7)
    const id = Math.floor(q.h * 65536)
    if (hash(id, k, seed) > show * 0.9) continue
    const e = cellEdge(x * scale, y * scale, seed + 53 + k * 7)
    if (e < 0.09) continue
    const lift = (k === 0 ? 0.5 : 1) * smooth(0.09, 0.3, e)
    if (lift <= topZ) continue
    topZ = lift
    const c = STONES[id % STONES.length]!
    const tone = 0.84 + 0.26 * hash(id, 9, seed)
    set(o, c[0] * tone, c[1] * tone, c[2] * tone)
    const tilt = 0.5 + 0.4 * hash(id, 13, seed)
    const a = hash(id, 17, seed) * Math.PI * 2
    const w = toWorldDir(f, Math.cos(a) * tilt, Math.sin(a) * tilt)
    o.nx = w.x
    o.ny = w.y
    o.nz = 1
    mix(o, 92, 84, 70, smooth(0.16, 0.09, e) * 0.6)
  }
  o.z = Math.max(o.z, depth)
}

/** 倒在地上的石柱：一段段鼓形的柱身按圆柱打光，段与段之间一道缝，柱身上细细的凹槽 */
function drum(o: Px, sc: PaintScene, u: number, v: number, x: number, y: number): boolean {
  for (const fc of sc.fallen) {
    const du = u - fc.u
    const dv = v - fc.v
    const s = du * fc.du + dv * fc.dv
    const w = -du * fc.dv + dv * fc.du
    if (s < fc.r * 0.6 || s > fc.len || Math.abs(w) > fc.r) continue
    const t = w / fc.r
    const nz = Math.sqrt(Math.max(0, 1 - t * t))
    const k = Math.floor(s / DRUM_U)
    const fs = fract(s / DRUM_U) * DRUM_U
    const joint = smooth(0.04, 0.0, Math.min(fs, DRUM_U - fs))
    const tone = 0.9 + 0.14 * hash(k, Math.floor(fc.u * 13), sc.seed)
    const flute = 0.95 + 0.05 * Math.cos(t * Math.PI * 7)
    const grain = 0.92 + 0.12 * valueNoise(x * 16, y * 16, sc.seed + 61)
    set(o, 206 * tone * flute * grain, 194 * tone * flute * grain, 168 * tone * flute * grain)
    mix(o, 92, 84, 70, joint * 0.8)
    const n = toWorldDir(sc.frame, -fc.dv * t, fc.du * t)
    o.nx = n.x
    o.ny = n.y
    o.nz = nz
    o.z = fc.r * sc.cfg.meterPerU * (1 + nz)
    return true
  }
  return false
}

/**
 * 砌体的顶：墙顶露出最上面那层石块，顺着墙错缝，厚墙是两皮石块中间一道纵缝，偶尔一块丁石横贯墙厚；石块四边磨圆、按太阳打光，
 * 灰缝凹下去发暗；顶上有地衣，矮墙顶长苔藓和草。石柱顶是圆的，边上一圈凹槽
 */
function masonryTop(o: Px, sc: PaintScene, s: number, n: number, u: number, v: number, x: number, y: number): void {
  const S = s > 0 ? sc.structures[s - 1]! : null
  const k = n - 1
  const seed = sc.seed + s * 101
  const hM = n * sc.cfg.masonry.courseM
  o.top = true
  o.z = hM
  let id = 0
  let edgeA = 1
  let edgeB = 1
  let na = 0
  let nb = 0
  let pal: readonly (readonly [number, number, number])[] = STONES
  if (S && S.axis >= 0) {
    if (S.kind === 'tower') pal = TOWER_STONES
    const alongU = S.axis === 0
    const a = alongU ? u : v
    const b = alongU ? v : u
    const b0 = alongU ? S.v0 : S.u0
    const b1 = alongU ? S.v1 : S.u1
    const thick = b1 - b0
    const len = 0.95 + 0.3 * hash(k, 3, seed)
    const off = hash(k, 5, seed) * len
    const j0 = Math.floor((a + off) / len)
    let lo = (j0 + 0.5 * (hash(j0, k, seed) - 0.5)) * len - off
    let hi = (j0 + 1 + 0.5 * (hash(j0 + 1, k, seed) - 0.5)) * len - off
    let j = j0
    if (a < lo) {
      hi = lo
      j = j0 - 1
      lo = (j + 0.5 * (hash(j, k, seed) - 0.5)) * len - off
    } else if (a >= hi) {
      lo = hi
      j = j0 + 1
      hi = (j + 1 + 0.5 * (hash(j + 1, k, seed) - 0.5)) * len - off
    }
    const through = thick < 1.1 || hash(j, k + 17, seed) < 0.3
    const mid = b0 + thick * (0.5 + (hash(j, k + 9, seed) - 0.5) * 0.3)
    const half = through ? 0 : b < mid ? -1 : 1
    const bl = through ? b0 : half < 0 ? b0 : mid
    const bh = through ? b1 : half < 0 ? mid : b1
    id = j * 7 + half + 3
    edgeA = Math.min(a - lo, hi - a)
    edgeB = Math.min(b - bl, bh - b)
    const ea = (2 * (a - lo)) / (hi - lo) - 1
    const eb = (2 * (b - bl)) / (bh - bl) - 1
    na = smooth(0.7, 1, Math.abs(ea)) * Math.sign(ea)
    nb = smooth(0.6, 1, Math.abs(eb)) * Math.sign(eb)
    if (!alongU) {
      const t = na
      na = nb
      nb = t
    }
    if (!alongU) {
      const t = edgeA
      edgeA = edgeB
      edgeB = t
    }
  } else if (S) {
    const cu = (S.u0 + S.u1) / 2
    const cv = (S.v0 + S.v1) / 2
    const rad = (S.u1 - S.u0) / 2
    const du = (u - cu) / rad
    const dv = (v - cv) / rad
    const rr = Math.sqrt(du * du + dv * dv)
    const ang = Math.atan2(dv, du)
    // 柱顶：断口粗糙、完整的磨平；边上一圈凹槽，最外一圈倒角往下斜
    const rough = n < Math.round(sc.cfg.masonry.heightM.column / sc.cfg.masonry.courseM) ? 0.45 : 0.08
    const flute = smooth(0.74, 0.86, rr) * smooth(0.98, 0.9, rr) * smooth(0.55, 0.95, Math.cos(ang * 16))
    const c = STONES[2]!
    const grain = 0.92 + 0.12 * valueNoise(x * 18, y * 18, seed + 71) + rough * (valueNoise(x * 6, y * 6, seed + 73) - 0.5)
    set(o, c[0] * grain, c[1] * grain, c[2] * grain)
    mix(o, 112, 102, 84, flute * 0.55)
    mix(o, 96, 88, 72, smooth(0.9, 1, rr) * 0.5)
    const bevel = smooth(0.82, 1, rr)
    const w = toWorldDir(sc.frame, du * bevel * 1.4, dv * bevel * 1.4)
    o.nx = w.x + (valueNoise(x * 7, y * 7, seed + 75) - 0.5) * rough
    o.ny = w.y + (valueNoise(x * 7 + 3, y * 7, seed + 75) - 0.5) * rough
    o.nz = 1
    return
  }
  const c = pal[Math.floor(hash(id, k, seed) * pal.length)]!
  const tone = 0.9 + 0.18 * hash(id, k + 1, seed)
  const grain = valueNoise(x * 15, y * 15, seed + 75) * 0.55 + valueNoise(x * 34, y * 34, seed + 77) * 0.45
  const pit = smooth(0.06, 0.015, cellEdge(x * 3.1, y * 3.1, seed + 79)) * 0.18
  const kk = tone * (0.9 + 0.16 * grain) * (1 - pit)
  set(o, c[0] * kk, c[1] * kk, c[2] * kk)
  // 地衣与苔藓：顶上一片片的黄绿色斑；矮的墙顶积了土，长着苔藓和草
  const lichen = smooth(0.6, 0.76, fbm(x * 1.1, y * 1.1, seed + 81, 2)) * 0.4
  mix(o, 176, 166, 104, lichen)
  const low = smooth(1.3, 0.3, hM)
  const moss = smooth(0.45, 0.62, fbm(x / 1.6, y / 1.6, seed + 83, 2)) * (0.25 + 0.6 * low)
  if (moss > 0) {
    grass(PX2, x, y, seed + 85, 0.7, 0)
    mix(o, PX2.r * 0.9, PX2.g * 0.95, PX2.b * 0.85, moss)
  }
  // 灰缝：凹下去，背光那侧更暗
  const joint = 1 - smooth(0.015, 0.045, Math.min(edgeA, edgeB))
  mix(o, 104, 96, 80, joint * 0.85)
  const w = toWorldDir(sc.frame, na, nb)
  o.nx = w.x * 0.55
  o.ny = w.y * 0.55
  o.nz = 1
}

/**
 * 墙朝屏幕下方的立面：zf 是这个像素在立面上离地多高（米），scale 是立面每米占多宽（格），a 是沿墙的坐标；一排石块一道横缝、石块之间错开的竖缝，
 * 离地越近越潮越绿；法线朝外、几乎水平，背着太阳的立面只受天光
 */
function facade(o: Px, sc: PaintScene, sid: number, zf: number, scale: number, a: number, nx: number, ny: number, x: number, y: number): void {
  const S = sid > 0 ? sc.structures[sid - 1]! : null
  const pal = S?.kind === 'tower' ? TOWER_STONES : STONES
  const hc = sc.cfg.masonry.courseM
  const row = hc * Math.max(1, Math.round(COURSE_MIN_PX / (hc * scale * GROUND_PPU)))
  const k = Math.max(0, Math.floor(zf / row))
  const fz = zf / row - k
  const seed = sc.seed + sid * 101 + 7
  const len = 0.95 + 0.3 * hash(k, 3, seed)
  const off = hash(k, 5, seed) * len
  const j = Math.floor((a + off) / len)
  const fa = (a + off) / len - j
  const c = pal[Math.floor(hash(j, k, seed) * pal.length)]!
  const tone = (0.86 + 0.18 * hash(j, k + 1, seed)) * (0.9 + 0.14 * valueNoise(x * 15, y * 15, seed + 3))
  set(o, c[0] * tone, c[1] * tone, c[2] * tone)
  const joint = Math.max(smooth(0.2, 0.08, Math.min(fz, 1 - fz)), smooth(0.06, 0.02, Math.min(fa, 1 - fa) * len))
  mix(o, 72, 66, 54, joint * 0.85)
  mix(o, 78, 90, 56, smooth(0.45, 0, zf) * 0.45)
  o.nx = nx
  o.ny = ny
  o.nz = 0.15
  o.z = zf
  o.top = true
}

/** 立着的石柱朝下的半圈柱身：竖着的凹槽按圆柱打光，一段段鼓形之间一道缝；t 是横过柱子的位置（-1 到 1） */
function columnSide(o: Px, sc: PaintScene, sid: number, zf: number, t: number, x: number, y: number): void {
  const c = STONES[2]!
  const across = Math.asin(Math.max(-1, Math.min(1, t)))
  const flute = smooth(0.4, 0.95, Math.cos(across * 16))
  const tone = 0.9 + 0.12 * valueNoise(x * 18, y * 18, sc.seed + sid * 13)
  set(o, c[0] * tone, c[1] * tone, c[2] * tone)
  mix(o, 110, 100, 82, flute * 0.35)
  const fz = fract(zf / DRUM_M)
  mix(o, 88, 80, 66, smooth(0.07, 0.02, Math.min(fz, 1 - fz)) * 0.8)
  mix(o, 78, 90, 56, smooth(0.4, 0, zf) * 0.4)
  o.nx = t
  o.ny = Math.sqrt(Math.max(0, 1 - t * t))
  o.nz = 0.12
  o.z = zf
  o.top = true
}

/** 跨得过的残基：画成嵌在地里的旧墙基，和地面齐平，石面风化发暗，石缝和一部分石面盖着土和草，没有高光也不投影 */
function foundation(o: Px, x: number, y: number, seed: number): void {
  o.r *= 0.8
  o.g *= 0.82
  o.b *= 0.78
  const cover = smooth(0.38, 0.66, fbm(x * 0.9, y * 0.9, seed + 121, 3))
  grass(PX2, x, y, seed + 123, 0.6, 0)
  mix(o, PX2.r, PX2.g, PX2.b, cover * 0.8)
  o.nx *= 0.25
  o.ny *= 0.25
  o.nz = 1
  o.z = 0
  o.top = false
}

/** 封门木板的立面：一块块竖着的木板，木纹竖着走，板缝发暗，两道横档上钉着钉子 */
function boards(o: Px, sc: PaintScene, zf: number, a: number, nx: number, ny: number): void {
  const wB = 0.36
  const id = Math.floor(a / wB)
  const fa = fract(a / wB) * wB
  const c = WOOD[Math.floor(hash(id, 1, sc.seed) * WOOD.length)]!
  const grainLine = 0.86 + 0.18 * valueNoise(a * 40, zf * 3, sc.seed + 91)
  set(o, c[0] * grainLine, c[1] * grainLine, c[2] * grainLine)
  mix(o, 46, 34, 24, smooth(0.035, 0, Math.min(fa, wB - fa)) * 0.9)
  const rail = Math.min(Math.abs(zf - 0.45), Math.abs(zf - 1.4))
  if (rail < 0.09) {
    const rc = WOOD[2]!
    set(o, rc[0] * 0.92, rc[1] * 0.92, rc[2] * 0.92)
    if (Math.abs(fa - wB / 2) < 0.04) mix(o, 40, 38, 36, 0.8)
  }
  o.nx = nx
  o.ny = ny
  o.nz = 0.15
  o.z = zf
  o.top = true
}

/** 封门的木板：一块块竖着钉的木板露出顶上的端头，木纹顺着板，板缝发暗，几颗钉帽 */
function planks(o: Px, sc: PaintScene, u: number, v: number): void {
  let axis = 0
  for (const d of sc.doors) {
    const inA = d.axis === 0 ? u >= d.a - 0.2 && u <= d.b + 0.2 && Math.abs(v - d.line) < d.thick : v >= d.a - 0.2 && v <= d.b + 0.2 && Math.abs(u - d.line) < d.thick
    if (inA) {
      axis = d.axis
      break
    }
  }
  const a = axis === 0 ? u : v
  const b = axis === 0 ? v : u
  const wB = 0.36
  const id = Math.floor(a / wB)
  const fa = fract(a / wB) * wB
  const c = WOOD[Math.floor(hash(id, 1, sc.seed) * WOOD.length)]!
  const grainLine = 0.88 + 0.16 * valueNoise(a * 3, b * 40, sc.seed + 91)
  set(o, c[0] * grainLine, c[1] * grainLine, c[2] * grainLine)
  mix(o, 52, 40, 28, smooth(0.035, 0.0, Math.min(fa, wB - fa)) * 0.9)
  const nail = Math.hypot(fa - wB / 2, fract(b * 3.1) - 0.5) < 0.05 ? 0.7 : 0
  mix(o, 40, 38, 36, nail)
  o.top = true
}

/**
 * 地面：台地上院落外是草地，通到院门的小路踩出了泥；院落里回廊与房间铺着石板、碎拼石或赤陶砖，回廊院里是草；台地边外是陡坡，
 * 乱石与灌木，越往下越暗。塌下的碎石盖在上面，倒下的石柱横在地上；挡人的墙露出墙顶的石块和朝屏幕下方的立面，跨得过的残基贴着地面，封门处钉着木板。
 * 按法线与太阳打光，往太阳那边被墙挡住的地方在影子里，墙脚一道接地线、被周围的墙挡掉天光，树冠背着太阳投下软影。只画 rect 那一块
 */
export function paintGround(sc: PaintScene, stat: Static, prep: Prepared, st: PaintState, out: Uint8ClampedArray, rect: PixelRect): void {
  const g = sc.grid
  const f = sc.frame
  const seed = sc.seed
  const ppu = GROUND_PPU
  const w = rect.x1 - rect.x0
  const o = PX
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = (px + 0.5) / ppu
      const y = (py + 0.5) / ppu
      const l = toLocal(f, x, y)
      const u = l.u
      const v = l.v
      const ci = Math.floor((u - g.u0) / g.cell)
      const cj = Math.floor((v - g.v0) / g.cell)
      const cell = ci >= 0 && cj >= 0 && ci < g.cols && cj < g.rows ? cj * g.cols + ci : -1
      const room = siteRoom(sc.basin, x, y)
      o.z = 0
      o.nx = 0
      o.ny = 0
      o.nz = 1
      o.top = false
      let far = 1
      const col = cell >= 0 ? columnAt(sc, stat, st, ci, cj, u, v) : null
      const sid = cell >= 0 ? sc.sid[cell]! : 0
      const pillar = sid > 0 && sc.structures[sid - 1]!.kind === 'column'
      const n = cell >= 0 ? st.n[cell]! : 0
      const hc = sc.cfg.masonry.courseM
      if (col && col.n > sc.walk) {
        // 立着的石柱：朝下的半圈露出柱身，越高露得越多，其余是柱顶
        const S = sc.structures[col.sid - 1]!
        const r = (S.u1 - S.u0) / 2
        const c = toWorld(f, (S.u0 + S.u1) / 2, (S.v0 + S.v1) / 2)
        const dx = x - c.x
        const s = c.y + Math.sqrt(Math.max(0, r * r - dx * dx)) - y
        const h = col.n * hc
        const k = faceScale(h)
        if (s < h * k) columnSide(o, sc, col.sid, h - s / k, dx / r, x, y)
        else masonryTop(o, sc, col.sid, col.n, u, v, x, y)
      } else if (col) {
        masonryTop(o, sc, col.sid, col.n, u, v, x, y)
        foundation(o, x, y, seed)
      } else if (n > sc.walk && !pillar) {
        const h = n * hc
        const look = sightAt(sc, st, x, y, h)
        if (look.face) {
          const nw = toWorldDir(f, look.nu, look.nv)
          facade(o, sc, sid, look.z, faceScale(h), look.nu !== 0 ? v : u, nw.x, nw.y, x, y)
        } else {
          masonryTop(o, sc, sid, n, u, v, x, y)
          // 墙顶往下的边：朝太阳的边亮一道，背着太阳的边暗一道；立面上沿亮一道
          const e = lowerEdge(sc, st, ci, cj, u, v)
          if (e.d < 0.09) {
            const t = 1 - e.d / 0.09
            const w = toWorldDir(f, e.nu, e.nv)
            const face = (w.x * SUN.x + w.y * SUN.y) / LXY
            const k = 1 + 0.42 * t * t * face
            o.r *= k
            o.g *= k
            o.b *= k
          }
          if (look.lip) {
            o.r *= 1.12
            o.g *= 1.12
            o.b *= 1.1
          }
        }
      } else if (n > 0 && !pillar) {
        masonryTop(o, sc, sid, n, u, v, x, y)
        foundation(o, x, y, seed)
      } else if (cell >= 0 && st.timber[cell]! > 0) {
        const h = st.timber[cell]! * hc
        const look = sightAt(sc, st, x, y, h)
        if (look.face) {
          const nw = toWorldDir(f, look.nu, look.nv)
          boards(o, sc, look.z, look.nu !== 0 ? v : u, nw.x, nw.y)
        } else {
          planks(o, sc, u, v)
          o.z = h
        }
      } else {
        const sp = spaceAt(sc, u, v)
        if (room < 0.25) {
          // 台地边外的陡坡：乱石与灌木，坡面朝外倾，越往下越暗
          const down = -room
          const st0 = cellNearest(x * 1.8, y * 1.8, seed + 101)
          const sd = Math.sqrt(st0.dx * st0.dx + st0.dy * st0.dy) / (0.3 + 0.25 * st0.h)
          const rock = sd < 1 ? smooth(1, 0.8, sd) : 0
          const scrub = smooth(0.48, 0.62, fbm(x / 2.2, y / 2.2, seed + 103, 3))
          dirt(o, x, y, seed + 7)
          mix(o, 96, 90, 70, 0.4)
          if (rock > 0) {
            const c = STONES[Math.floor(st0.h * 977) % STONES.length]!
            const tone = 0.62 + 0.2 * st0.h
            mix(o, c[0] * tone, c[1] * tone, c[2] * tone, rock)
          }
          grass(PX2, x, y, seed + 105, 0.2, 0)
          mix(o, PX2.r * 0.75, PX2.g * 0.8, PX2.b * 0.7, smooth(0.6, 0, down) * 0.8)
          mix(o, 46, 62, 34, scrub * 0.9)
          const h = 0.15
          const gx = (siteRoom(sc.basin, x + h, y) - siteRoom(sc.basin, x - h, y)) / (2 * h)
          const gy = (siteRoom(sc.basin, x, y + h) - siteRoom(sc.basin, x, y - h)) / (2 * h)
          const slope = 1.4 * smooth(0.25, -0.6, room)
          o.nx = -gx * slope
          o.ny = -gy * slope
          o.nz = 1
          far = 1 - 0.55 * smooth(0.2, 6, down)
        } else if (!sp) {
          const path = pathAt(sc, u, v)
          grass(o, x, y, seed, 0.15, 0.6)
          if (path > 0) {
            dirt(PX2, x, y, seed + 11)
            mix(o, PX2.r, PX2.g, PX2.b, path * smooth(0.25, 0.6, fbm(x * 1.3, y * 1.3, seed + 107, 2) + path * 0.5))
          }
        } else if (sp.kind === 'garth') {
          grass(o, x, y, seed + 1, 0.55, 1)
        } else if (sp.kind === 'tower') {
          dirt(o, x, y, seed + 3)
          const weed = smooth(0.55, 0.75, fbm(x * 1.2, y * 1.2, seed + 109, 2))
          if (weed > 0) {
            grass(PX2, x, y, seed + 111, 0.5, 0)
            mix(o, PX2.r, PX2.g, PX2.b, weed * 0.8)
          }
        } else {
          const alongU = sp.kind === 'walk' ? Math.abs(u - (sp.u0 + sp.u1) / 2) < Math.abs(v - (sp.v0 + sp.v1) / 2) * ((sp.u1 - sp.u0) / (sp.v1 - sp.v0)) : sp.u1 - sp.u0 >= sp.v1 - sp.v0
          paving(o, u, v, x, y, sp, seed, alongU)
        }
        if (cell >= 0 && !drum(o, sc, u, v, x, y)) rubbleOn(o, f, x, y, sample(g, st.rubble, u, v), seed)
        // 墙脚的接地线：挨着挡人的墙与木板，地面上一道深色的线
        if (cell >= 0) {
          const d = besideWall(sc, st, ci, cj, u, v)
          if (d < 0.07) {
            const k = 1 - 0.38 * (1 - d / 0.07) ** 1.5
            o.r *= k
            o.g *= k
            o.b *= k
          }
        }
        // 墙脚的常春藤：伸到地上的一小片
        if (cell >= 0) {
          const ao = sample(g, prep.ao, u, v)
          const ivy = smooth(0.62, 0.74, fbm(x / 1.4, y / 1.4, seed + 113, 3)) * smooth(0.08, 0.2, ao)
          if (ivy > 0) mix(o, 58 + 20 * valueNoise(x * 9, y * 9, seed + 115), 86 + 26 * valueNoise(x * 9, y * 9, seed + 117), 40, ivy * 0.9)
        }
      }
      // 光：朝太阳的面亮；往太阳那边被挡住的在影子里；墙脚被挡掉天光；树影；坡下暗
      const nl = 1 / Math.sqrt(o.nx * o.nx + o.ny * o.ny + o.nz * o.nz)
      const lambert = Math.max(0, (o.nx * LX + o.ny * LY + o.nz * LZ) * nl)
      const sh = cell < 0 ? 0 : o.top ? smooth(-0.02, 0.1, sample(g, prep.shadow, u, v) - o.z) : sample(g, prep.ground, u, v) * smooth(0.6, 0.05, o.z) + smooth(-0.02, 0.1, sample(g, prep.shadow, u, v) - o.z) * smooth(0.05, 0.6, o.z)
      let tree = 0
      for (const k of near(stat.shadows, x, y)) {
        const c = stat.cast[k]!
        const tr = sc.trees[k]!
        const soft = 0.45 + tr.h * 0.08
        const dd = Math.sqrt((x - c.x) * (x - c.x) + (y - c.y) * (y - c.y))
        tree = Math.max(tree, smooth(c.r + soft, c.r - soft, dd))
      }
      const shade = Math.max(sh * WALL_SHADE, tree * 0.4)
      const ao = cell >= 0 ? sample(g, prep.ao, u, v) : 0
      const sun = 0.82 * lambert * (1 - Math.min(1, shade / WALL_SHADE))
      const sky = 0.48 * (1 - 0.55 * ao)
      const k = (sky + Math.max(0, sun)) * far
      const lit = Math.max(0, sun) / Math.max(0.001, sky + Math.max(0, sun))
      const o0 = (py - rect.y0) * w * 4 + (px - rect.x0) * 4
      out[o0] = o.r * k * (0.92 + 0.16 * lit)
      out[o0 + 1] = o.g * k * (0.97 + 0.05 * lit)
      out[o0 + 2] = o.b * k * (1.08 - 0.18 * lit)
      out[o0 + 3] = 255
    }
  }
}

/** 一棵树的树冠由几团叶簇叠成：中间一团最高，外圈几团低一些；按树的序号定，每次画都一样 */
function clumps(tr: Tree, k: number): { x: number; y: number; r: number; top: number }[] {
  const out = [{ x: tr.x, y: tr.y, r: tr.r * 0.62, top: tr.h }]
  const n = 7 + Math.floor(tr.r * 2.5)
  for (let i = 0; i < n; i++) {
    const h1 = fract(Math.sin(k * 12.9898 + i * 78.233) * 43758.5453)
    const h2 = fract(Math.sin(k * 39.346 + i * 11.135) * 24634.6345)
    const a = i * 2.39996 + h1 * 0.8
    const rr = tr.r * (0.34 + 0.16 * h2)
    const dist = (tr.r - rr) * (0.55 + 0.45 * Math.sqrt(h1))
    out.push({ x: tr.x + Math.cos(a) * dist, y: tr.y + Math.sin(a) * dist, r: rr, top: tr.h * (0.93 - 0.08 * (dist / tr.r)) })
  }
  return out
}

/** 树冠的颜色：橡树与栗树的几种绿，夕照下偏暖 */
const LEAF = [
  [64, 92, 40],
  [76, 100, 44],
  [56, 86, 46],
  [88, 104, 44],
  [70, 90, 36],
] as const

/**
 * 树冠：每棵树由几团叶簇叠成，看得见的是最高的那团；叶簇按球面打光，向阳面偏暖偏黄、背阴面偏冷，低处被上面的叶簇遮着更暗，
 * 叶面有细碎的明暗与亮斑；边缘柔和。像素带透明度，只画 rect 那一块
 */
export function paintCanopy(sc: PaintScene, stat: Static, out: Uint8ClampedArray, rect: PixelRect): void {
  const seed = sc.seed
  const ppu = CANOPY_PPU
  const w = rect.x1 - rect.x0
  const shapes = sc.trees.map((tr, k) => clumps(tr, k))
  for (let py = rect.y0; py < rect.y1; py++) {
    for (let px = rect.x0; px < rect.x1; px++) {
      const x = (px + 0.5) / ppu
      const y = (py + 0.5) / ppu
      let best = -Infinity
      let nx = 0
      let ny = 0
      let nz = 1
      let alpha = 0
      let tree = -1
      let top = 0
      const ragged = 0.84 + 0.2 * valueNoise(x * 5.5, y * 5.5, seed + 67)
      for (const k of near(stat.crowns, x, y)) {
        const tr = sc.trees[k]!
        if ((x - tr.x) ** 2 + (y - tr.y) ** 2 > (tr.r + 0.1) ** 2) continue
        for (const c of shapes[k]!) {
          const dx = x - c.x
          const dy = y - c.y
          const d2 = dx * dx + dy * dy
          const r = c.r * ragged
          if (d2 >= r * r) continue
          const cz = Math.sqrt(r * r - d2)
          const hgt = c.top - r + cz * 1.1
          alpha = Math.max(alpha, smooth(r, r - 0.08, Math.sqrt(d2)))
          if (hgt <= best) continue
          best = hgt
          nx = dx / r
          ny = dy / r
          nz = cz / r
          tree = k
          top = tr.h
        }
      }
      const o = ((py - rect.y0) * w + px - rect.x0) * 4
      if (tree < 0 || alpha <= 0) {
        out[o + 3] = 0
        continue
      }
      const pal = LEAF[tree % LEAF.length]!
      const leaf = valueNoise(x * 15, y * 15, seed + 61) * 0.55 + valueNoise(x * 34, y * 34, seed + 63) * 0.45
      const bx = valueNoise(x * 7 + 0.3, y * 7, seed + 69) - valueNoise(x * 7 - 0.3, y * 7, seed + 69)
      const by = valueNoise(x * 7, y * 7 + 0.3, seed + 69) - valueNoise(x * 7, y * 7 - 0.3, seed + 69)
      const mx = nx + bx * 0.9
      const my = ny + by * 0.9
      const ml = Math.sqrt(mx * mx + my * my + nz * nz)
      const lit = clamp01(((mx * LX + my * LY + nz * LZ) / ml + 0.3) / 1.3)
      const low = smooth(0, 1.4, top - best)
      const kk = (0.34 + 0.66 * lit) * (1 - 0.32 * low) * (0.84 + 0.24 * leaf)
      const warm = lit * lit
      const sparkle = smooth(0.78, 0.92, leaf) * lit * 0.25
      out[o] = (pal[0] * (0.84 + 0.34 * warm) + 44 * sparkle) * kk
      out[o + 1] = (pal[1] * (0.9 + 0.18 * warm) + 36 * sparkle) * kk
      out[o + 2] = (pal[2] * (1.12 - 0.34 * warm) + 8 * sparkle) * kk
      out[o + 3] = alpha * 255
    }
  }
}
