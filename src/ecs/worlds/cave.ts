import { UNIT } from '../../util/units'
import { fbm } from '../../util/noise'
import { FRAME } from '../frame'
import type { Rng } from '../../util/rng'
import type { Point } from '../../util/vec'
import type { CaveConfig } from '../../types/maps'
import { daysAt, moonAt, moonDirectLux, moonSkyLux, phaseAngle, skyLux, sunAt, sunDirectLux, SYNODIC_DAYS, torchLux } from '../../data/cave'
import type { SkyDir } from '../../data/cave'
import type { Landmark } from './gates'
import type { Rect } from '../frame'

const DEG = Math.PI / 180

/** 一个圆：圆心与半径，像素 */
export interface Circle {
  readonly x: number
  readonly y: number
  readonly r: number
}

/** 一根石笋：底半径（像素）与高（米）；矮小的人跨得过、子弹飞得过 */
export interface Stalagmite extends Circle {
  readonly h: number
  readonly block: boolean
}

/** 洞顶上的一个天窗：圆心、平均半径（像素），轮廓按方位角起伏：wob 是三组谐波的幅度与相位 */
export interface Opening extends Circle {
  readonly wob: readonly number[]
}

/** 一片边石坝水潭：椭圆的圆心、两个半轴（像素）与转角，轮廓再按噪声起伏 */
export interface Pool {
  readonly x: number
  readonly y: number
  readonly rx: number
  readonly ry: number
  readonly rot: number
  readonly seed: number
}

/** 天窗下塌落的碎石坡：圆心、半径（像素）、中间高多少米 */
export interface Mound extends Circle {
  readonly h: number
}

/** 一条支洞：从洞厅里沿折线拐进岩体，末点是暗室的中心，从第 turn 个折点起是拐过弯的深处；半宽与暗室半径，像素 */
export interface Alcove {
  readonly path: readonly Point[]
  readonly turn: number
  readonly half: number
  readonly pocket: number
}

/** 一丛荧光苔或发光蘑菇：中心、半径（像素）与色相（0 青、1 绿） */
export interface Glow extends Circle {
  readonly hue: number
}

/** 一张有符号距离场：格心到最近岩石的距离（像素），岩石外为正；格子 (0, 0) 的左上角在 (x0, y0) */
export interface Rock {
  readonly cols: number
  readonly rows: number
  readonly cell: number
  readonly x0: number
  readonly y0: number
  readonly room: Float32Array
}

/** 附近有哪些石头与水潭：一格一格的桶，start[i] 到 start[i + 1] 是第 i 格的条目，条目是 种类·65536 + 序号 */
export interface Near {
  readonly cols: number
  readonly rows: number
  readonly x0: number
  readonly y0: number
  readonly start: Int32Array
  readonly items: Int32Array
}

/** 桶里条目的种类 */
export const NEAR = { mound: 0, pool: 1, column: 2, stalagmite: 3, glow: 4 } as const

/** 石笋与石柱背着天窗拖的影子最长几格：画地面时桶要罩得住影子 */
export const SHADOW_U = { stalagmite: 1.2, column: 2 } as const

/** 一局的溶洞：按种子生成，模拟与画面都从这里读；全是数据，能整个发给画地面的线程 */
export interface CaveLayout {
  /** 地图矩形，像素：洞厅与支洞都在里面；距离场、光照与流场铺满方框 */
  readonly map: Rect
  readonly seed: number
  readonly ceilingM: number
  readonly wallU: number
  /** 身体走不进去的地方：洞壁、石柱与挡路的石笋 */
  readonly rock: Rock
  /** 只算洞壁的距离场：画洞壁、算洞壁的高度 */
  readonly shell: Rock
  readonly openings: readonly Opening[]
  readonly mounds: readonly Mound[]
  readonly columns: readonly Circle[]
  readonly stalagmites: readonly Stalagmite[]
  readonly pools: readonly Pool[]
  readonly alcoves: readonly Alcove[]
  readonly glows: readonly Glow[]
  readonly near: Near
  /** 能刷怪的点：离岩石至少一格，像素坐标成对排；头目要的地方更宽 */
  readonly spawns: Float32Array
  readonly bossSpawns: Float32Array
}

// ————————————————————————————— 距离场 —————————————————————————————

const FAR = 1e20

/** 一行的平方距离变换：out[q] = min_p (q − p)² + f[p]，下包络线法 */
function sqDist1(f: Float64Array, n: number, out: Float64Array, at: Int32Array, from: Float64Array): void {
  let k = 0
  at[0] = 0
  from[0] = -FAR
  from[1] = FAR
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[at[k]!]! + at[k]! * at[k]!)) / (2 * (q - at[k]!))
    while (s <= from[k]!) {
      k--
      s = (f[q]! + q * q - (f[at[k]!]! + at[k]! * at[k]!)) / (2 * (q - at[k]!))
    }
    k++
    at[k] = q
    from[k] = s
    from[k + 1] = FAR
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (from[k + 1]! < q) k++
    out[q] = (q - at[k]!) ** 2 + f[at[k]!]!
  }
}

/** 每格到最近的标记格的距离，格 */
function distTo(mark: Uint8Array, cols: number, rows: number): Float64Array {
  const d = new Float64Array(cols * rows)
  const n = Math.max(cols, rows)
  const f = new Float64Array(n)
  const o = new Float64Array(n)
  const at = new Int32Array(n)
  const from = new Float64Array(n + 1)
  for (let i = 0; i < d.length; i++) d[i] = mark[i] ? 0 : FAR
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) f[y] = d[y * cols + x]!
    sqDist1(f, rows, o, at, from)
    for (let y = 0; y < rows; y++) d[y * cols + x] = o[y]!
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) f[x] = d[y * cols + x]!
    sqDist1(f, cols, o, at, from)
    for (let x = 0; x < cols; x++) d[y * cols + x] = Math.sqrt(o[x]!)
  }
  return d
}

/**
 * 按 open（参数是格心的像素坐标）栅格化能走的地面：窄过 2·neck 像素的缝与尖角填成岩石，只留与 keep 连通的一块，
 * 再算有符号距离
 */
function carve(open: (x: number, y: number) => boolean, x0: number, y0: number, cols: number, rows: number, cell: number, keep: Point, neck: number): Rock {
  const n = cols * rows
  const walk = new Uint8Array(n)
  const solid = new Uint8Array(n)
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      const on = cx > 0 && cy > 0 && cx < cols - 1 && cy < rows - 1 && open(x0 + (cx + 0.5) * cell, y0 + (cy + 0.5) * cell)
      walk[i] = on ? 1 : 0
      solid[i] = on ? 0 : 1
    }
  }
  const toSolid = distTo(solid, cols, rows)
  const core = new Uint8Array(n)
  for (let i = 0; i < n; i++) core[i] = walk[i] && toSolid[i]! * cell > neck ? 1 : 0
  const toCore = distTo(core, cols, rows)
  const kept = new Uint8Array(n)
  const start = Math.min(rows - 1, Math.max(0, Math.floor((keep.y - y0) / cell))) * cols + Math.min(cols - 1, Math.max(0, Math.floor((keep.x - x0) / cell)))
  const opened = (i: number): boolean => walk[i] === 1 && toCore[i]! * cell <= neck + cell * 0.5
  if (!opened(start)) throw new Error('溶洞的出生点被填成了岩石')
  const stack = [start]
  kept[start] = 1
  while (stack.length > 0) {
    const i = stack.pop()!
    const cx = i % cols
    const next = [cx > 0 ? i - 1 : -1, cx < cols - 1 ? i + 1 : -1, i - cols, i + cols]
    for (const j of next) {
      if (j < 0 || j >= n || kept[j] || !opened(j)) continue
      kept[j] = 1
      stack.push(j)
    }
  }
  const stone = new Uint8Array(n)
  for (let i = 0; i < n; i++) stone[i] = kept[i] ? 0 : 1
  const inside = distTo(stone, cols, rows)
  const outside = distTo(kept, cols, rows)
  const room = new Float32Array(n)
  for (let i = 0; i < n; i++) room[i] = (kept[i] ? inside[i]! - 0.5 : 0.5 - outside[i]!) * cell
  return { cols, rows, cell, x0, y0, room }
}

/** (x, y) 离最近的岩石多远，像素，岩石里为负 */
export function roomOf(r: Rock, x: number, y: number): number {
  const u = Math.min(r.cols - 1.001, Math.max(0, (x - r.x0) / r.cell - 0.5))
  const v = Math.min(r.rows - 1.001, Math.max(0, (y - r.y0) / r.cell - 0.5))
  const ix = Math.floor(u)
  const iy = Math.floor(v)
  const fx = u - ix
  const fy = v - iy
  const i = iy * r.cols + ix
  const a = r.room[i]!
  const b = r.room[i + 1]!
  const c = r.room[i + r.cols]!
  const d = r.room[i + r.cols + 1]!
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

/** 离岩石越来越远的单位方向：贴着岩壁时就是壁面朝外的法线 */
export function outward(r: Rock, x: number, y: number): Point {
  const h = r.cell * 0.5
  const gx = roomOf(r, x + h, y) - roomOf(r, x - h, y)
  const gy = roomOf(r, x, y + h) - roomOf(r, x, y - h)
  const len = Math.hypot(gx, gy)
  return len > 1e-9 ? { x: gx / len, y: gy / len } : { x: 0, y: 0 }
}

/** 半径 rad 的身体陷进岩石多深就沿法线退回多远，拐角处最多退四次 */
export function pushOut(r: Rock, x: number, y: number, rad: number): Point {
  let px = x
  let py = y
  for (let k = 0; k < 4; k++) {
    const d = roomOf(r, px, py)
    if (d >= rad) break
    const n = outward(r, px, py)
    px += n.x * (rad - d)
    py += n.y * (rad - d)
  }
  return { x: px, y: py }
}

/** 从 a 到 b 的线段第一次碰到岩石的地方；没碰到是 null。沿线按离岩石的距离跳着走 */
export function rockHit(r: Rock, ax: number, ay: number, bx: number, by: number): Point | null {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  const minStep = r.cell * 0.4
  let t = 0
  for (let k = 0; k < 256; k++) {
    const x = ax + (dx * t) / (len || 1)
    const y = ay + (dy * t) / (len || 1)
    const d = roomOf(r, x, y)
    if (d < 0) return { x, y }
    if (t >= len) return null
    t = Math.min(len, t + Math.max(d, minStep))
  }
  return null
}

/** 半径 rad 的身体能不能沿直线从 a 走到 b 而不蹭到岩石 */
export function clearPath(r: Rock, ax: number, ay: number, bx: number, by: number, rad: number): boolean {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  const minStep = r.cell * 0.4
  let t = 0
  for (let k = 0; k < 256; k++) {
    const d = roomOf(r, ax + (dx * t) / (len || 1), ay + (dy * t) / (len || 1))
    if (d < rad) return false
    if (t >= len) return true
    t = Math.min(len, t + Math.max(d - rad, minStep))
  }
  return true
}

// ————————————————————————————— 生成 —————————————————————————————

/** 噪声拉开对比度落到 [0, 1]：分形噪声大多挤在中间 */
function spread01(n: number): number {
  return Math.min(1, Math.max(0, (n - 0.5) * 2.4 + 0.5))
}

/** 方形地图里离四条边多远，格，角按 cornerU 的半径磨圆；地图外为负 */
function edgeDepthU(x: number, y: number, map: Rect, cornerU: number): number {
  const qx = Math.min(x - map.x, map.x + map.w - x) / UNIT
  const qy = Math.min(y - map.y, map.y + map.h - y) / UNIT
  if (qx >= 0 && qy >= 0 && qx < cornerU && qy < cornerU) return cornerU - Math.hypot(cornerU - qx, cornerU - qy)
  return Math.min(qx, qy)
}

/** 离线段 ab 多远 */
function segDist(px: number, py: number, a: Point, b: Point): number {
  const ex = b.x - a.x
  const ey = b.y - a.y
  const t = Math.max(0, Math.min(1, ((px - a.x) * ex + (py - a.y) * ey) / (ex * ex + ey * ey || 1)))
  return Math.hypot(px - a.x - ex * t, py - a.y - ey * t)
}

/** 天窗在方位角 a 上的半径，像素 */
function openingRadius(o: Opening, a: number): number {
  const w = o.wob
  return o.r * (1 + w[0]! * Math.sin(a + w[1]!) + w[2]! * Math.sin(2 * a + w[3]!) + w[4]! * Math.sin(3 * a + w[5]!))
}

/** 洞顶上 (x, y) 正上方有多少是天：天窗里为 1，边上 soft 像素内平滑过渡 */
export function skyAbove(L: Pick<CaveLayout, 'openings'>, x: number, y: number, soft: number): number {
  let best = 0
  for (const o of L.openings) {
    const dx = x - o.x
    const dy = y - o.y
    const d = Math.hypot(dx, dy)
    if (d > o.r * 1.6 + soft) continue
    const r = openingRadius(o, Math.atan2(dy, dx))
    const t = Math.min(1, Math.max(0, (r + soft - d) / (2 * soft)))
    best = Math.max(best, t * t * (3 - 2 * t))
  }
  return best
}

/** 水潭的轮廓场：潭里为正，越往潭心越大，边上为 0 */
export function poolField(p: Pool, x: number, y: number): number {
  const dx = x - p.x
  const dy = y - p.y
  const c = Math.cos(p.rot)
  const s = Math.sin(p.rot)
  const u = (dx * c + dy * s) / p.rx
  const v = (-dx * s + dy * c) / p.ry
  if (u * u + v * v > 2.2) return -1
  return 1 - u * u - v * v + 0.45 * (fbm(x / UNIT / 1.3, y / UNIT / 1.3, p.seed, 2) - 0.5)
}

/** (x, y) 在不在水潭里 */
export function inPool(L: Pick<CaveLayout, 'pools' | 'near'>, x: number, y: number): boolean {
  const { from, to } = nearAt(L.near, x, y)
  for (let k = from; k < to; k++) {
    const code = L.near.items[k]!
    if (code >> 16 === NEAR.pool && poolField(L.pools[code & 0xffff]!, x, y) > 0) return true
  }
  return false
}

/** 按每个东西罩住的范围（像素）把它们分进一格一格的桶 */
function makeNear(x0: number, y0: number, w: number, h: number, groups: readonly (readonly { x: number; y: number; reach: number }[])[]): Near {
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
    items.push(...lists[i]!)
  }
  start[lists.length] = items.length
  return { cols, rows, x0, y0, start, items: new Int32Array(items) }
}

/** (x, y) 所在那一格桶里的条目，从 from 到 to */
export function nearAt(n: Near, x: number, y: number): { from: number; to: number } {
  const c = Math.floor((x - n.x0) / UNIT)
  const r = Math.floor((y - n.y0) / UNIT)
  if (c < 0 || r < 0 || c >= n.cols || r >= n.rows) return { from: 0, to: 0 }
  const i = r * n.cols + c
  return { from: n.start[i]!, to: n.start[i + 1]! }
}

/**
 * 这一点的高度，米：洞底的起伏、天窗下的碎石坡、水潭的潭底、石笋的锥、石柱与洞壁（洞壁从洞底弯上洞顶）。
 * 石柱与洞壁一直顶到洞顶
 */
export function heightM(L: CaveLayout, x: number, y: number): number {
  const wall = -roomOf(L.shell, x, y)
  if (wall > 0) return L.ceilingM * Math.min(1, wall / (L.wallU * UNIT)) ** 0.75
  let z = 0.16 * (fbm(x / UNIT / 3.5, y / UNIT / 3.5, L.seed + 7, 2) - 0.5)
  let top = 0
  const { from, to } = nearAt(L.near, x, y)
  for (let k = from; k < to; k++) {
    const code = L.near.items[k]!
    const kind = code >> 16
    const idx = code & 0xffff
    if (kind === NEAR.mound) {
      const m = L.mounds[idx]!
      const d = Math.hypot(x - m.x, y - m.y) / m.r
      if (d < 1) z += m.h * (1 - d * d) ** 1.6 * (0.85 + 0.3 * fbm((x / UNIT) * 1.8, (y / UNIT) * 1.8, L.seed + 19, 2))
    } else if (kind === NEAR.pool) {
      const f = poolField(L.pools[idx]!, x, y)
      if (f > 0) z -= 0.14 * Math.min(1, f * 4)
    } else if (kind === NEAR.column) {
      const c = L.columns[idx]!
      const d = Math.hypot(x - c.x, y - c.y)
      if (d < c.r) return L.ceilingM
      if (d < c.r + 0.5 * UNIT) top = Math.max(top, 0.9 * (1 - (d - c.r) / (0.5 * UNIT)) ** 2)
    } else if (kind === NEAR.stalagmite) {
      const st = L.stalagmites[idx]!
      const d = Math.hypot(x - st.x, y - st.y)
      if (d < st.r) top = Math.max(top, st.h * (1 - d / st.r) ** 1.35)
    }
  }
  return Math.max(z, top)
}

/** 每放一样东西最多试多少个随机位置：放不下的就少放 */
const PLACE_TRIES = 40

/** 挑一个 [a, b] 里的数 */
function pick(rng: Rng, r: readonly [number, number]): number {
  return r[0] + rng.next() * (r[1] - r[0])
}

/** 挑一个 [a, b] 里的整数 */
function pickInt(rng: Rng, r: readonly [number, number]): number {
  return r[0] + Math.floor(rng.next() * (r[1] - r[0] + 1))
}

/** 支洞挨着的那条地图边：边上的起点、朝地图里的法线、顺着边的方向 */
interface Anchor {
  readonly side: number
  readonly ex: number
  readonly ey: number
  readonly nx: number
  readonly ny: number
  readonly tx: number
  readonly ty: number
  readonly along: number
}

/** 离哪条地图边最近：0 上、1 右、2 下、3 左 */
function nearestSide(x: number, y: number, map: Rect): number {
  const d = [y - map.y, map.x + map.w - x, map.y + map.h - y, x - map.x]
  let best = 0
  for (let k = 1; k < 4; k++) if (d[k]! < d[best]!) best = k
  return best
}

/**
 * 按种子生成溶洞：先在四条边上挑出支洞的位置，洞厅的边在那里往里让出岩体；再开大小天窗（天窗下堆着碎石坡），
 * 放水潭、石柱与成丛的石笋，荧光长在洞壁脚下与支洞里；最后算出能走的地面与距离场
 */
function makeCave(cfg: CaveConfig, map: Rect, rng: Rng): CaveLayout {
  const seed = Math.floor(rng.next() * 0x7fffffff)
  const hall = cfg.hall
  const al = cfg.alcoves
  const { x: ox, y: oy, w, h } = map
  const cx = ox + w / 2
  const cy = oy + h / 2
  /** 地图里随便一点 */
  const anyX = (): number => ox + rng.next() * w
  const anyY = (): number => oy + rng.next() * h
  // 支洞：沿地图一周均匀分开，避开四个角；岩体要厚到够支洞往外走再拐弯
  const count = pickInt(rng, al.count)
  const turn = rng.next() * 4
  const anchors: Anchor[] = []
  for (let k = 0; k < count; k++) {
    const u = (turn + ((k + 0.5 + (rng.next() - 0.5) * 0.4) * 4) / count) % 4
    const side = Math.floor(u)
    const f = 0.25 + 0.5 * (u - side)
    const along = pick(rng, al.alongU) * UNIT
    const dir = f < 0.5 ? 1 : -1
    const sides = [
      { ex: ox + f * w, ey: oy, nx: 0, ny: 1, tx: dir, ty: 0 },
      { ex: ox + w, ey: oy + f * h, nx: -1, ny: 0, tx: 0, ty: dir },
      { ex: ox + (1 - f) * w, ey: oy + h, nx: 0, ny: -1, tx: -dir, ty: 0 },
      { ex: ox, ey: oy + (1 - f) * h, nx: 1, ny: 0, tx: 0, ty: -dir },
    ] as const
    anchors.push({ side, ...sides[side]!, along })
  }
  const need = al.outU + al.pocketU + 1.2
  const insetAt = (x: number, y: number): number => {
    const base = hall.insetU[0] + (hall.insetU[1] - hall.insetU[0]) * spread01(fbm(x / UNIT / hall.waveU, y / UNIT / hall.waveU, seed + 101, 2))
    const side = nearestSide(x, y, map)
    let lift = 0
    for (const a of anchors) {
      if (a.side !== side) continue
      const s = ((x - a.ex) * a.tx + (y - a.ey) * a.ty) / UNIT
      const out = s < -1 ? -1 - s : s > a.along / UNIT + al.pocketU ? s - a.along / UNIT - al.pocketU : 0
      const t = Math.max(0, 1 - out / 3)
      lift = Math.max(lift, need * t * t * (3 - 2 * t))
    }
    // 让出的岩体边上也起伏，不是一道直墙
    return Math.max(base, lift + (lift / need) * 1.5 * fbm(x / UNIT / 2.6, y / UNIT / 2.6, seed + 107, 2))
  }
  const inHall = (x: number, y: number): boolean => edgeDepthU(x, y, map, hall.cornerU) > insetAt(x, y)
  const alcoves: Alcove[] = anchors.map((a) => {
    const depth = insetAt(a.ex + a.nx * need * UNIT, a.ey + a.ny * need * UNIT)
    const reach = Math.max(al.pocketU + 0.7, depth - al.outU) * UNIT
    const p0 = { x: a.ex + a.nx * (depth + 1.2) * UNIT, y: a.ey + a.ny * (depth + 1.2) * UNIT }
    const p1 = { x: a.ex + a.nx * reach, y: a.ey + a.ny * reach }
    const p2 = { x: p1.x + a.tx * a.along, y: p1.y + a.ty * a.along }
    // 洞道不是直的：往外那段在中间朝旁边歪一点，顺着地图边那段只往洞厅那侧歪，免得贴上地图边
    const m0 = { x: (p0.x + p1.x) / 2 + a.tx * (rng.next() - 0.5) * UNIT, y: (p0.y + p1.y) / 2 + a.ty * (rng.next() - 0.5) * UNIT }
    const m1 = { x: (p1.x + p2.x) / 2 + a.nx * rng.next() * 0.35 * UNIT, y: (p1.y + p2.y) / 2 + a.ny * rng.next() * 0.35 * UNIT }
    return { path: [p0, m0, p1, m1, p2], turn: 2, half: (al.widthU / 2) * UNIT, pocket: al.pocketU * UNIT }
  })
  const inAlcove = (x: number, y: number): boolean => {
    // 洞道时宽时窄
    const k = 0.72 + 0.56 * fbm(x / UNIT / 1.5, y / UNIT / 1.5, seed + 211, 2)
    for (const a of alcoves) {
      const p = a.path
      for (let i = 0; i + 1 < p.length; i++) if (segDist(x, y, p[i]!, p[i + 1]!) < a.half * k) return true
      const end = p[p.length - 1]!
      if (Math.hypot(x - end.x, y - end.y) < a.pocket * k) return true
    }
    return false
  }
  /** 一个半径 r 的圆整个落在洞厅里、离洞厅的边至少 pad 像素 */
  const hallHolds = (x: number, y: number, r: number, pad: number): boolean => {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      if (!inHall(x + Math.cos(a) * (r + pad), y + Math.sin(a) * (r + pad))) return false
    }
    return inHall(x, y)
  }
  const wobble = (): number[] => {
    const raw = [rng.next(), rng.next(), rng.next()]
    const sum = raw[0]! + raw[1]! + raw[2]!
    const j = cfg.skylights.jitter
    return [(raw[0]! / sum) * j, rng.next() * 6.283, (raw[1]! / sum) * j, rng.next() * 6.283, (raw[2]! / sum) * j, rng.next() * 6.283]
  }
  // 天窗：第一个大天窗离地图中心不远，其余大天窗与小天窗散在洞厅别处，彼此隔开
  const sky = cfg.skylights
  const openings: Opening[] = []
  for (let tries = 0; tries < 60 && openings.length === 0; tries++) {
    const a = rng.next() * Math.PI * 2
    const d = pick(rng, sky.mainOffsetU) * UNIT * (1 - tries / 80)
    const r = pick(rng, sky.mainU) * UNIT
    const o = { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r, wob: wobble() }
    if (hallHolds(o.x, o.y, r * (1 + sky.jitter), sky.gapU * UNIT * 0.5) || tries === 59) openings.push(o)
  }
  // 每个天窗在一批落得进洞厅的候选位置里挑离已有天窗最远的一处：大天窗能放下的地方往往只剩洞厅的角上
  const scatter = (count: number, radiusU: readonly [number, number]): void => {
    for (let k = 0; k < count; k++) {
      const r = pick(rng, radiusU) * UNIT
      let best: Opening | null = null
      let bestGap = sky.gapU * UNIT
      for (let tries = 0; tries < PLACE_TRIES * 4; tries++) {
        const x = anyX()
        const y = anyY()
        if (!hallHolds(x, y, r * (1 + sky.jitter), UNIT)) continue
        const gap = Math.min(...openings.map((o) => Math.hypot(o.x - x, o.y - y) - (o.r + r) * (1 + sky.jitter)))
        if (gap < bestGap) continue
        bestGap = gap
        best = { x, y, r, wob: [] }
      }
      if (best) openings.push({ ...best, wob: wobble() })
    }
  }
  scatter(pickInt(rng, sky.mainCount) - 1, sky.mainU)
  scatter(pickInt(rng, sky.minorCount), sky.minorU)
  const mainR = openings[0]!.r
  const mounds: Mound[] = openings.map((o) => ({ x: o.x, y: o.y, r: o.r * sky.rubbleSpread, h: (sky.rubbleM * o.r) / mainR }))
  const underSky = (x: number, y: number, pad: number): boolean => openings.some((o) => Math.hypot(o.x - x, o.y - y) < o.r * (1 + sky.jitter) + pad)
  // 水潭：在洞厅里低洼的地方，不压碎石坡，不挨着出生点
  const pools: Pool[] = []
  const poolCount = pickInt(rng, cfg.pools.count)
  for (let tries = 0; tries < poolCount * PLACE_TRIES && pools.length < poolCount; tries++) {
    const size = pick(rng, cfg.pools.sizeU) * UNIT
    const x = anyX()
    const y = anyY()
    if (!hallHolds(x, y, size * 1.2, 0.6 * UNIT)) continue
    if (Math.hypot(x - cx, y - cy) < cfg.formations.clearU * UNIT + size * 1.25) continue
    if (mounds.some((m) => Math.hypot(m.x - x, m.y - y) < m.r + size * 0.8)) continue
    if (pools.some((p) => Math.hypot(p.x - x, p.y - y) < Math.max(p.rx, p.ry) + size + 0.6 * UNIT)) continue
    pools.push({ x, y, rx: size, ry: size * (0.5 + rng.next() * 0.35), rot: rng.next() * Math.PI, seed: seed + 400 + pools.length * 17 })
  }
  const wet = (x: number, y: number, pad: number): boolean => pools.some((p) => Math.hypot(p.x - x, p.y - y) < Math.max(p.rx, p.ry) * 1.25 + pad)
  const f = cfg.formations
  const clear = f.clearU * UNIT
  // 石柱：洞顶还在的地方才有，离出生点与彼此都远一些
  const columns: Circle[] = []
  const columnCount = pickInt(rng, f.columns)
  for (let tries = 0; tries < columnCount * PLACE_TRIES && columns.length < columnCount; tries++) {
    const r = pick(rng, f.columnU) * UNIT
    const x = anyX()
    const y = anyY()
    if (Math.hypot(x - cx, y - cy) < clear + r) continue
    if (!hallHolds(x, y, r, 1.3 * UNIT) || underSky(x, y, r + 0.8 * UNIT) || wet(x, y, r)) continue
    if (columns.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + r + 3 * UNIT)) continue
    columns.push({ x, y, r })
  }
  // 石笋：多数长成几丛（洞顶的裂缝下滴水多），少数零散；越粗的越高
  const stalagmites: Stalagmite[] = []
  const clusters: Point[] = []
  const clusterCount = pickInt(rng, f.clusters)
  for (let tries = 0; tries < clusterCount * PLACE_TRIES && clusters.length < clusterCount; tries++) {
    const x = anyX()
    const y = anyY()
    if (hallHolds(x, y, 0, 0.8 * UNIT) && !underSky(x, y, UNIT) && Math.hypot(x - cx, y - cy) > clear) clusters.push({ x, y })
  }
  const stalagmiteCount = pickInt(rng, f.stalagmites)
  const [r0, r1] = f.stalagmiteU
  const [m0, m1] = f.stalagmiteM
  for (let tries = 0; tries < stalagmiteCount * PLACE_TRIES && stalagmites.length < stalagmiteCount; tries++) {
    const k = rng.next() * rng.next()
    const r = (r0 + (r1 - r0) * k) * UNIT
    let x: number
    let y: number
    if (clusters.length > 0 && rng.next() < 0.75) {
      const c = clusters[Math.floor(rng.next() * clusters.length)]!
      const a = rng.next() * Math.PI * 2
      const d = Math.sqrt(-2 * Math.log(Math.max(1e-6, rng.next()))) * 1.6 * UNIT
      x = c.x + Math.cos(a) * d
      y = c.y + Math.sin(a) * d
    } else {
      x = anyX()
      y = anyY()
    }
    const block = r >= f.blockU * UNIT
    if (Math.hypot(x - cx, y - cy) < (block ? clear : clear * 0.6) + r) continue
    if (!hallHolds(x, y, r, 0.25 * UNIT) || underSky(x, y, r) || wet(x, y, r)) continue
    if (columns.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + r + 0.3 * UNIT)) continue
    if (stalagmites.some((s) => Math.hypot(s.x - x, s.y - y) < s.r + r + (block && s.block ? 0.9 * UNIT : 0.12 * UNIT))) continue
    const tall = m0 + (m1 - m0) * Math.min(1, ((r / UNIT - r0) / (r1 - r0)) ** 0.7 * (0.75 + 0.5 * rng.next()))
    stalagmites.push({ x, y, r, h: tall, block })
  }
  const blockers: Circle[] = [...columns, ...stalagmites.filter((s) => s.block)]
  const open = (x: number, y: number): boolean => {
    if (x < ox + 0.5 * UNIT || y < oy + 0.5 * UNIT || x > ox + w - 0.5 * UNIT || y > oy + h - 0.5 * UNIT) return false
    if (!inHall(x, y) && !inAlcove(x, y)) return false
    for (const b of blockers) if ((x - b.x) ** 2 + (y - b.y) ** 2 < b.r * b.r) return false
    return true
  }
  const cell = 0.25 * UNIT
  const cols = Math.ceil(FRAME.w / cell)
  const rows = Math.ceil(FRAME.h / cell)
  const neck = hall.neckU * UNIT
  const center = { x: cx, y: cy }
  const inMap = (x: number, y: number): boolean => x > ox + 0.5 * UNIT && y > oy + 0.5 * UNIT && x < ox + w - 0.5 * UNIT && y < oy + h - 0.5 * UNIT
  const shell = carve((x, y) => inMap(x, y) && (inHall(x, y) || inAlcove(x, y)), FRAME.x, FRAME.y, cols, rows, cell, center, neck)
  const rock = carve(open, FRAME.x, FRAME.y, cols, rows, cell, center, neck)
  // 圆形的石头按精确的距离收边：栅格化出来的边是锯齿
  for (const b of blockers) {
    const c0 = Math.max(0, Math.floor((b.x - b.r - 2 * UNIT - rock.x0) / cell))
    const c1 = Math.min(cols - 1, Math.ceil((b.x + b.r + 2 * UNIT - rock.x0) / cell))
    const w0 = Math.max(0, Math.floor((b.y - b.r - 2 * UNIT - rock.y0) / cell))
    const w1 = Math.min(rows - 1, Math.ceil((b.y + b.r + 2 * UNIT - rock.y0) / cell))
    for (let yy = w0; yy <= w1; yy++) {
      for (let xx = c0; xx <= c1; xx++) {
        const i = yy * cols + xx
        const d = Math.hypot(rock.x0 + (xx + 0.5) * cell - b.x, rock.y0 + (yy + 0.5) * cell - b.y) - b.r
        if (d < rock.room[i]!) rock.room[i] = d
      }
    }
  }
  // 荧光：长在洞壁脚下的潮湿处与支洞里
  const glows: Glow[] = []
  const glowCount = pickInt(rng, cfg.light.glowCount)
  for (let tries = 0; tries < glowCount * PLACE_TRIES && glows.length < glowCount; tries++) {
    const deep = rng.next() < 0.4 && alcoves.length > 0
    let x: number
    let y: number
    if (deep) {
      const a = alcoves[Math.floor(rng.next() * alcoves.length)]!
      const e = a.path[a.path.length - 1]!
      const t = rng.next() * Math.PI * 2
      x = e.x + Math.cos(t) * a.pocket * 0.8
      y = e.y + Math.sin(t) * a.pocket * 0.8
    } else {
      x = anyX()
      y = anyY()
    }
    const room = roomOf(rock, x, y)
    if (room < 0.1 * UNIT || room > 1.4 * UNIT || underSky(x, y, UNIT)) continue
    if (glows.some((g) => Math.hypot(g.x - x, g.y - y) < 2.5 * UNIT)) continue
    glows.push({ x, y, r: (0.3 + rng.next() * 0.35) * UNIT, hue: rng.next() })
  }
  const near = makeNear(FRAME.x, FRAME.y, FRAME.w, FRAME.h, [
    mounds.map((m) => ({ x: m.x, y: m.y, reach: m.r })),
    pools.map((p) => ({ x: p.x, y: p.y, reach: Math.max(p.rx, p.ry) * 1.5 })),
    columns.map((c) => ({ x: c.x, y: c.y, reach: c.r * 1.3 + SHADOW_U.column * UNIT })),
    stalagmites.map((st) => ({ x: st.x, y: st.y, reach: st.r * 1.5 + SHADOW_U.stalagmite * UNIT })),
    glows.map((g) => ({ x: g.x, y: g.y, reach: g.r * 1.3 })),
  ])
  const spawns: number[] = []
  const bossSpawns: number[] = []
  const step = 0.5 * UNIT
  for (let y = oy + step / 2; y < oy + h; y += step) {
    for (let x = ox + step / 2; x < ox + w; x += step) {
      const room = roomOf(rock, x, y)
      if (room >= UNIT) spawns.push(x, y)
      if (room >= 1.6 * UNIT) bossSpawns.push(x, y)
    }
  }
  return {
    map,
    seed,
    ceilingM: hall.ceilingM,
    wallU: hall.wallU,
    rock,
    shell,
    openings,
    mounds,
    columns,
    stalagmites,
    pools,
    alcoves,
    glows,
    near,
    spawns: new Float32Array(spawns),
    bossSpawns: new Float32Array(bossSpawns),
  }
}

// ————————————————————————————— 光 —————————————————————————————

/** 天上此刻的样子：钟点、开局以来过了几天，太阳与月亮的方向，月龄与月相角；直射按垂直于光线、天光按水平面算，勒克斯 */
export interface CaveSky {
  hour: number
  days: number
  sun: SkyDir
  moon: SkyDir
  age: number
  phase: number
  sunLux: number
  skyLux: number
  moonLux: number
  moonSkyLux: number
}

/**
 * 洞里的光：半格一格的照度场，覆盖镜头能看到的地图外一圈。天光按每格看得见多少天（视角系数）进来，
 * 直射光看从这格朝太阳（月亮）的那条线是不是从天窗穿出去；洞底与天窗下的亮处把光反到洞顶再落回各处（反光），
 * 支洞里的反光一路被吸掉。diffuse 是天光、反光与荧光，direct 是直射，都按勒克斯
 */
export interface CaveLight {
  readonly cols: number
  readonly rows: number
  readonly cell: number
  readonly x0: number
  readonly y0: number
  readonly z: Float32Array
  readonly air: Uint8Array
  readonly hall: Uint8Array
  readonly alcove: Uint8Array
  readonly view: Float32Array
  readonly glow: Float32Array
  readonly diffuse: Float32Array
  /** diffuse 里反光占多少：反光是石灰岩染过的暖光，天光偏冷 */
  readonly warm: Float32Array
  readonly direct: Float32Array
  /** 岩体里的格子按离洞多远排的次序，rank 是这一圈的圈数（洞里为 0）：照度从洞里一圈圈往岩体里淡出，画面上不出台阶 */
  readonly fill: Int32Array
  readonly rank: Uint16Array
  /** 反光按一格一格的粗格子算 */
  readonly bcols: number
  readonly brows: number
  readonly bair: Uint8Array
  readonly bdeep: Uint8Array
  readonly bsrc: Float32Array
  readonly btmp: Float32Array
  /** 洞厅能走的地方的平均照度（只算天光、反光与荧光），勒克斯 */
  hallLux: number
  /** 每算一次加一 */
  version: number
}

/** 一个天窗：按半格取的天空样点，与查遮挡用的探点（圆心与一圈） */
interface SkyPatch {
  readonly samples: readonly Point[]
  readonly probes: readonly Point[]
}

/** 每个天窗查遮挡的探点：圆心之外再围一圈这么多个 */
const SKY_PROBES = 8

/** 天光视角系数：从 (x, y) 高 z 米处仰看，各个天窗里每一小块天各占多少；check 时按每个天窗的探点有几成被洞壁、石柱挡住打折 */
function viewFactor(L: CaveLayout, patches: readonly SkyPatch[], area: number, x: number, y: number, z: number, check: boolean): number {
  const dz = Math.max(0.3, L.ceilingM - z)
  const dz2 = dz * dz
  let sum = 0
  for (const p of patches) {
    let part = 0
    for (const s of p.samples) {
      const dx = (s.x - x) / UNIT
      const dy = (s.y - y) / UNIT
      const r2 = dx * dx + dy * dy + dz2
      part += (dz2 / (Math.PI * r2 * r2)) * area
    }
    if (part < 1e-7) continue
    if (check) {
      let seen = 0
      for (const q of p.probes) if (!rockHit(L.rock, x, y, q.x, q.y)) seen++
      part *= seen / p.probes.length
    }
    sum += part
  }
  return Math.min(1, sum)
}

function makeLight(L: CaveLayout, cfg: CaveConfig): CaveLight {
  const cell = 0.5 * UNIT
  const cols = Math.ceil(FRAME.w / cell)
  const rows = Math.ceil(FRAME.h / cell)
  const n = cols * rows
  const x0 = FRAME.x
  const y0 = FRAME.y
  const z = new Float32Array(n)
  const air = new Uint8Array(n)
  const hall = new Uint8Array(n)
  const alcove = new Uint8Array(n)
  const view = new Float32Array(n)
  const glow = new Float32Array(n)
  const inAlcove = (x: number, y: number): boolean => {
    for (const a of L.alcoves) {
      const p = a.path
      for (let i = a.turn; i + 1 < p.length; i++) if (segDist(x, y, p[i]!, p[i + 1]!) < a.half + 0.6 * UNIT) return true
      const end = p[p.length - 1]!
      if (Math.hypot(x - end.x, y - end.y) < a.pocket + 0.6 * UNIT) return true
    }
    return false
  }
  // 天窗按半格取样；探点是圆心与一圈四分之三半径上的点
  const ds = 0.5 * UNIT
  const patches: SkyPatch[] = L.openings.map((o) => {
    const samples: Point[] = []
    for (let y = o.y - o.r * 1.6; y <= o.y + o.r * 1.6; y += ds) {
      for (let x = o.x - o.r * 1.6; x <= o.x + o.r * 1.6; x += ds) if (Math.hypot(x - o.x, y - o.y) < openingRadius(o, Math.atan2(y - o.y, x - o.x))) samples.push({ x, y })
    }
    const probes: Point[] = [{ x: o.x, y: o.y }]
    for (let k = 0; k < SKY_PROBES; k++) {
      const a = (k / SKY_PROBES) * Math.PI * 2
      const r = openingRadius(o, a) * 0.75
      probes.push({ x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r })
    }
    return { samples, probes }
  })
  const area = (ds / UNIT) ** 2
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      const x = x0 + (cx + 0.5) * cell
      const y = y0 + (cy + 0.5) * cell
      const shell = roomOf(L.shell, x, y)
      z[i] = heightM(L, x, y)
      if (shell < -L.wallU * UNIT) continue
      air[i] = 1
      const deep = inAlcove(x, y)
      const room = roomOf(L.rock, x, y)
      alcove[i] = deep ? 1 : 0
      hall[i] = !deep && room > 0 ? 1 : 0
      if (shell >= 0 && z[i]! < L.ceilingM) view[i] = viewFactor(L, patches, area, x, y, z[i]!, room > 0 && (deep || shell < 2.5 * UNIT))
    }
  }
  // 洞壁上的天光从相邻的洞底往上一路变暗；石柱顶在洞顶里，按柱脚的地面算、略暗一点
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i < n; i++) {
      if (!air[i]) continue
      const x = x0 + ((i % cols) + 0.5) * cell
      const y = y0 + (Math.floor(i / cols) + 0.5) * cell
      const wall = roomOf(L.shell, x, y) < 0
      if (!wall && z[i]! < L.ceilingM) continue
      const keep = wall ? 0.8 : 0.95
      const c = i % cols
      let best = view[i]!
      for (const j of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]) if (j >= 0 && j < n && air[j]) best = Math.max(best, view[j]! * keep)
      view[i] = best
    }
  }
  for (const g of L.glows) {
    const reach = g.r + 3 * UNIT
    for (let cy = Math.max(0, Math.floor((g.y - reach - y0) / cell)); cy <= Math.min(rows - 1, Math.ceil((g.y + reach - y0) / cell)); cy++) {
      for (let cx = Math.max(0, Math.floor((g.x - reach - x0) / cell)); cx <= Math.min(cols - 1, Math.ceil((g.x + reach - x0) / cell)); cx++) {
        const d2 = ((x0 + (cx + 0.5) * cell - g.x) ** 2 + (y0 + (cy + 0.5) * cell - g.y) ** 2) / (UNIT * UNIT)
        const r2 = (g.r / UNIT) ** 2
        glow[cy * cols + cx] = glow[cy * cols + cx]! + (cfg.light.glowLux * r2) / (d2 + r2)
      }
    }
  }
  const rank = new Uint16Array(n)
  const fill: number[] = []
  let ring: number[] = []
  for (let i = 0; i < n; i++) if (air[i]) ring.push(i)
  for (let k = 1; ring.length > 0; k++) {
    const next: number[] = []
    for (const i of ring) {
      const c = i % cols
      for (const j of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]) {
        if (j < 0 || j >= n || air[j] || rank[j]) continue
        rank[j] = k
        fill.push(j)
        next.push(j)
      }
    }
    ring = next
  }
  const bcols = Math.ceil(cols / 2)
  const brows = Math.ceil(rows / 2)
  const bair = new Uint8Array(bcols * brows)
  const bdeep = new Uint8Array(bcols * brows)
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      const b = (cy >> 1) * bcols + (cx >> 1)
      if (air[i]) bair[b] = 1
      if (alcove[i]) bdeep[b] = 1
    }
  }
  return {
    cols,
    rows,
    cell,
    x0,
    y0,
    z,
    air,
    hall,
    alcove,
    view,
    glow,
    diffuse: new Float32Array(n),
    warm: new Float32Array(n),
    direct: new Float32Array(n),
    fill: new Int32Array(fill),
    rank,
    bcols,
    brows,
    bair,
    bdeep,
    bsrc: new Float32Array(bcols * brows),
    btmp: new Float32Array(bcols * brows),
    hallLux: 0,
    version: 0,
  }
}

/** 开局后 sec 秒时天上的样子；月龄从这一局的初始月龄起，每过一天长一天 */
export function skyAt(cfg: CaveConfig, sec: number, age0: number, out: CaveSky): CaveSky {
  const days = daysAt(cfg.sky, sec)
  const hour = (days - Math.floor(days)) * 24
  const age = (age0 + days) % SYNODIC_DAYS
  out.hour = hour
  out.days = days
  out.sun = sunAt(cfg.sky, hour)
  out.moon = moonAt(cfg.sky, hour, age)
  out.age = age
  out.phase = phaseAngle(age)
  out.sunLux = sunDirectLux(cfg.sky, out.sun.elev / DEG)
  out.skyLux = skyLux(out.sun.elev / DEG)
  out.moonLux = moonDirectLux(cfg.sky, out.moon.elev / DEG, out.phase)
  out.moonSkyLux = moonSkyLux(cfg.sky, out.moon.elev / DEG, out.phase)
  return out
}

/** 高 z 米处朝 dir 的方向（太阳或月亮）看出去，能不能从天窗看到它：返回直射在水平面上的照度 */
function directAt(L: CaveLayout, x: number, y: number, z: number, dir: SkyDir, normalLux: number): number {
  if (dir.elev <= 0 || normalLux <= 0) return 0
  const run = ((L.ceilingM - z) / Math.tan(dir.elev)) * UNIT
  return normalLux * Math.sin(dir.elev) * skyAbove(L, x + dir.x * run, y + dir.y * run, 0.2 * UNIT)
}

/** 这一点此刻的直射照度（太阳加月亮），勒克斯 */
export function directLux(L: CaveLayout, sky: CaveSky, x: number, y: number, z: number): number {
  return directAt(L, x, y, z, sky.sun, sky.sunLux) + directAt(L, x, y, z, sky.moon, sky.moonLux)
}

/**
 * 按此刻的天重算洞里的光：每格的天光与直射；直射与天光乘反照率落到洞顶、再乘反照率落回洞底，
 * 按反光铺开的宽度在一格一格的粗格子上扩散，岩石里不走，支洞里一路被吸掉
 */
export function stepLight(Lt: CaveLight, L: CaveLayout, cfg: CaveConfig, sky: CaveSky): void {
  const { cols, rows, cell, x0, y0 } = Lt
  const skyLx = sky.skyLux + sky.moonSkyLux
  Lt.bsrc.fill(0)
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      if (!Lt.air[i]) {
        Lt.direct[i] = 0
        continue
      }
      const d = directLux(L, sky, x0 + (cx + 0.5) * cell, y0 + (cy + 0.5) * cell, Lt.z[i]!)
      Lt.direct[i] = d
      const b = (cy >> 1) * Lt.bcols + (cx >> 1)
      Lt.bsrc[b] = Lt.bsrc[b]! + (d + Lt.view[i]! * skyLx) * 0.25
    }
  }
  // 扩散：每一步一半留在原地、一半与相邻格平均，方差每步长 1/4 格²；支洞里每步吸掉三成
  const steps = Math.round(4 * cfg.light.bounceU * cfg.light.bounceU)
  const { bcols, brows, bair, bdeep } = Lt
  let a = Lt.bsrc
  let b = Lt.btmp
  for (let k = 0; k < steps; k++) {
    for (let y = 0; y < brows; y++) {
      for (let x = 0; x < bcols; x++) {
        const i = y * bcols + x
        if (!bair[i]) {
          b[i] = 0
          continue
        }
        let s = 0
        let m = 0
        if (x > 0 && bair[i - 1]) {
          s += a[i - 1]!
          m++
        }
        if (x < bcols - 1 && bair[i + 1]) {
          s += a[i + 1]!
          m++
        }
        if (y > 0 && bair[i - bcols]) {
          s += a[i - bcols]!
          m++
        }
        if (y < brows - 1 && bair[i + bcols]) {
          s += a[i + bcols]!
          m++
        }
        const v = m > 0 ? 0.5 * a[i]! + (0.5 * s) / m : a[i]!
        b[i] = bdeep[i] ? v * 0.7 : v
      }
    }
    const t = a
    a = b
    b = t
  }
  const rho2 = cfg.light.albedo * cfg.light.albedo
  let sum = 0
  let count = 0
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      if (!Lt.air[i]) continue
      // 粗格子的格心落在细格子的 (2k + 0.5) 处，双线性插回来；岩石里的粗格子不算，免得贴着洞壁一格格地暗下去
      const u = Math.min(bcols - 1.001, Math.max(0, (cx - 0.5) / 2))
      const v = Math.min(brows - 1.001, Math.max(0, (cy - 0.5) / 2))
      const ix = Math.floor(u)
      const iy = Math.floor(v)
      const fx = u - ix
      const fy = v - iy
      const j = iy * bcols + ix
      const w00 = bair[j]! * (1 - fx) * (1 - fy)
      const w10 = bair[j + 1]! * fx * (1 - fy)
      const w01 = bair[j + bcols]! * (1 - fx) * fy
      const w11 = bair[j + bcols + 1]! * fx * fy
      const wsum = w00 + w10 + w01 + w11
      const bounce = wsum > 0 ? (a[j]! * w00 + a[j + 1]! * w10 + a[j + bcols]! * w01 + a[j + bcols + 1]! * w11) / wsum : 0
      const e = Lt.view[i]! * skyLx + rho2 * bounce + Lt.glow[i]!
      Lt.diffuse[i] = e
      Lt.warm[i] = e > 0 ? (rho2 * bounce) / e : 0
      if (Lt.hall[i]) {
        sum += e
        count++
      }
    }
  }
  // 岩体里：取已定下的相邻格里最亮的一格，每往里一圈暗四成
  const { fill, rank } = Lt
  for (let k = 0; k < fill.length; k++) {
    const i = fill[k]!
    const c = i % cols
    let best = 0
    let warm = 0
    for (const j of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]) {
      if (j < 0 || j >= cols * rows || rank[j]! >= rank[i]! || Lt.diffuse[j]! <= best) continue
      best = Lt.diffuse[j]!
      warm = Lt.warm[j]!
    }
    Lt.diffuse[i] = best * 0.6
    Lt.warm[i] = warm
  }
  Lt.hallLux = count > 0 ? sum / count : 0
  Lt.version++
}

/** 照度场在 (x, y) 处的天光、反光与荧光，双线性插值，勒克斯 */
export function diffuseLux(Lt: CaveLight, x: number, y: number): number {
  const u = Math.min(Lt.cols - 1.001, Math.max(0, (x - Lt.x0) / Lt.cell - 0.5))
  const v = Math.min(Lt.rows - 1.001, Math.max(0, (y - Lt.y0) / Lt.cell - 0.5))
  const ix = Math.floor(u)
  const iy = Math.floor(v)
  const fx = u - ix
  const fy = v - iy
  const i = iy * Lt.cols + ix
  const a = Lt.diffuse
  return (a[i]! * (1 - fx) + a[i + 1]! * fx) * (1 - fy) + (a[i + Lt.cols]! * (1 - fx) + a[i + Lt.cols + 1]! * fx) * fy
}

// ————————————————————————————— 火把 —————————————————————————————

/** 一名队员的火把：uid 对不上就是换了人；on 是想不想点着，lit 是火光的大小（0–1），到 due 时刻才照着 on 点起或熄灭 */
export interface Torch {
  uid: number
  on: boolean
  lit: number
  due: number
  want: boolean
}

/** 火把点起要多久、熄灭要多久，毫秒 */
const IGNITE_MS = 450
const DOUSE_MS = 600

/**
 * 推进一名队员的火把：身边的光（不算火把）暗过 igniteLux 就想点起、亮过 douseLux 就想熄灭，
 * 想法变了以后按队员各自的迟疑等一阵才动手，所以全队是一个个点起来的；倒下的火把落地熄灭
 */
export function stepTorch(t: Torch, cfg: CaveConfig['torch'], lux: number, alive: boolean, slot: number, now: number, dt: number): void {
  const want = alive && (t.on ? lux < cfg.douseLux : lux < cfg.igniteLux)
  if (want !== t.want) {
    t.want = want
    t.due = alive ? now + cfg.staggerMs * ((slot * 0.618034 + 0.13) % 1) : now
  }
  if (now >= t.due) t.on = t.want
  t.lit = t.on ? Math.min(1, t.lit + dt / IGNITE_MS) : Math.max(0, t.lit - dt / DOUSE_MS)
}

/** 火把在身体上的位置：举在右上方，像素 */
export function torchSpot(x: number, y: number, size: number): Point {
  return { x: x + size * 0.32, y: y - size * 0.18 }
}

/** 一处立着的身体此刻受的光：x、y 是各路有方向的光按迎着它受的照度（勒克斯）乘地图平面上朝它的单位向量加起来，e 是连天光在内的总照度 */
export interface Toward {
  x: number
  y: number
  e: number
}

/** 天体的直射按迎着它算：不乘入射角的正弦 */
function beamToward(L: CaveLayout, dir: SkyDir, lux: number, x: number, y: number, out: Toward): void {
  if (dir.elev <= 0 || lux <= 0) return
  const b = directAt(L, x, y, 0, dir, lux) / Math.sin(dir.elev)
  out.x += b * dir.x
  out.y += b * dir.y
  out.e += b
}

/** 一处立着的身体此刻从哪边受光：太阳、月亮与火把（不算遮挡）各按迎着它受的照度，写进 out */
export function lightToward(L: CaveLayout, Lt: CaveLight, sky: CaveSky, torch: CaveConfig['torch'], spots: readonly Point[], lits: readonly number[], x: number, y: number, out: Toward): void {
  out.x = 0
  out.y = 0
  out.e = diffuseLux(Lt, x, y)
  beamToward(L, sky.sun, sky.sunLux, x, y, out)
  beamToward(L, sky.moon, sky.moonLux, x, y, out)
  for (let k = 0; k < spots.length; k++) {
    const lit = lits[k]!
    if (lit <= 0) continue
    const dx = spots[k]!.x - x
    const dy = spots[k]!.y - y
    const d = Math.hypot(dx, dy)
    const b = (lit * torch.candela) / ((d / UNIT) ** 2 + torch.heightM ** 2)
    if (d > 0) {
      out.x += (b * dx) / d
      out.y += (b * dy) / d
    }
    out.e += b
  }
}

/** 一处被这些火把照到多亮（不算遮挡），勒克斯 */
export function torchesLux(cfg: CaveConfig['torch'], spots: readonly Point[], lits: readonly number[], x: number, y: number): number {
  let e = 0
  for (let k = 0; k < spots.length; k++) {
    const lit = lits[k]!
    if (lit <= 0) continue
    e += lit * torchLux(cfg, Math.hypot(spots[k]!.x - x, spots[k]!.y - y) / UNIT)
  }
  return e
}

// ————————————————————————————— 绕路 —————————————————————————————

/** 绕路用的步数场：半格一格，每格到队长的最短路程（像素）；身体挤不过去的格子不通 */
export interface CaveFlow {
  readonly cols: number
  readonly rows: number
  readonly cell: number
  readonly pass: Uint8Array
  readonly dist: Float32Array
  /** 已经定下最短路程的格子记下它的路程：同一格可能进堆多次，出堆时比一下就知道是不是旧的 */
  readonly done: Float32Array
  readonly heap: Int32Array
  /** 上一次从哪一格算起 */
  from: number
}

/** 半径 0.45 格的身体挤得过去的格子才算通；铺满方框，格子 (0, 0) 在世界原点 */
function makeFlow(L: CaveLayout): CaveFlow {
  const cell = 0.5 * UNIT
  const cols = Math.ceil(FRAME.w / cell)
  const rows = Math.ceil(FRAME.h / cell)
  const pass = new Uint8Array(cols * rows)
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) pass[cy * cols + cx] = roomOf(L.rock, (cx + 0.5) * cell, (cy + 0.5) * cell) >= 0.4 * UNIT ? 1 : 0
  const n = cols * rows
  return { cols, rows, cell, pass, dist: new Float32Array(n).fill(Infinity), done: new Float32Array(n), heap: new Int32Array(n * 8), from: -1 }
}

const NX = [1, -1, 0, 0, 1, 1, -1, -1] as const
const NY = [0, 0, 1, -1, 1, -1, 1, -1] as const
const NC = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2] as const

/** 从 (x, y) 所在的格子起按八邻接走（斜着走不能切过不通的角）算最短路程；起点不通就从最近的通的格子起 */
export function flowFrom(F: CaveFlow, x: number, y: number): void {
  const { cols, rows, cell, pass, dist, done, heap } = F
  let start = Math.min(rows - 1, Math.max(0, Math.floor(y / cell))) * cols + Math.min(cols - 1, Math.max(0, Math.floor(x / cell)))
  if (!pass[start]) {
    let best = -1
    let bd = Infinity
    const sx = start % cols
    const sy = Math.floor(start / cols)
    for (let r = 1; r < 8 && best < 0; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = sx + dx
          const yy = sy + dy
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows || !pass[yy * cols + xx]) continue
          if (dx * dx + dy * dy < bd) {
            bd = dx * dx + dy * dy
            best = yy * cols + xx
          }
        }
      }
    }
    if (best < 0) return
    start = best
  }
  if (start === F.from) return
  F.from = start
  dist.fill(Infinity)
  done.fill(Infinity)
  dist[start] = 0
  let size = 0
  const push = (i: number): void => {
    let k = size++
    heap[k] = i
    while (k > 0) {
      const p = (k - 1) >> 1
      if (dist[heap[p]!]! <= dist[heap[k]!]!) break
      const t = heap[p]!
      heap[p] = heap[k]!
      heap[k] = t
      k = p
    }
  }
  const pop = (): number => {
    const top = heap[0]!
    heap[0] = heap[--size]!
    let k = 0
    for (;;) {
      const l = k * 2 + 1
      const r = l + 1
      let m = k
      if (l < size && dist[heap[l]!]! < dist[heap[m]!]!) m = l
      if (r < size && dist[heap[r]!]! < dist[heap[m]!]!) m = r
      if (m === k) break
      const t = heap[m]!
      heap[m] = heap[k]!
      heap[k] = t
      k = m
    }
    return top
  }
  push(start)
  while (size > 0) {
    const i = pop()
    const d = dist[i]!
    if (done[i] === d) continue
    done[i] = d
    const ix = i % cols
    const iy = (i - ix) / cols
    for (let k = 0; k < 8; k++) {
      const nx = ix + NX[k]!
      const ny = iy + NY[k]!
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const j = ny * cols + nx
      if (!pass[j]) continue
      if (k >= 4 && (!pass[iy * cols + nx] || !pass[ny * cols + ix])) continue
      const nd = d + NC[k]! * cell
      if (nd < dist[j]! && size < heap.length) {
        dist[j] = nd
        push(j)
      }
    }
  }
}

/** 步数场在 (x, y) 处的双线性插值；四角有不通的就是 Infinity */
function flowAt(F: CaveFlow, x: number, y: number): number {
  const u = Math.min(F.cols - 1.001, Math.max(0, x / F.cell - 0.5))
  const v = Math.min(F.rows - 1.001, Math.max(0, y / F.cell - 0.5))
  const ix = Math.floor(u)
  const iy = Math.floor(v)
  const fx = u - ix
  const fy = v - iy
  const i = iy * F.cols + ix
  const d = F.dist
  return (d[i]! * (1 - fx) + d[i + 1]! * fx) * (1 - fy) + (d[i + F.cols]! * (1 - fx) + d[i + F.cols + 1]! * fx) * fy
}

/** 顺着步数场往下走的方向：四周都通时按插值的梯度走，平滑；贴着不通的格子时看周围八格哪一格离队长最近 */
export function flowDir(F: CaveFlow, x: number, y: number): Point | null {
  const h = F.cell * 0.5
  const gx = flowAt(F, x + h, y) - flowAt(F, x - h, y)
  const gy = flowAt(F, x, y + h) - flowAt(F, x, y - h)
  if (Number.isFinite(gx) && Number.isFinite(gy)) {
    const len = Math.hypot(gx, gy)
    if (len > 1e-6) return { x: -gx / len, y: -gy / len }
  }
  const { cols, rows, cell, dist } = F
  const ix = Math.min(cols - 1, Math.max(0, Math.floor(x / cell)))
  const iy = Math.min(rows - 1, Math.max(0, Math.floor(y / cell)))
  const here = dist[iy * cols + ix]!
  let best = here
  let bx = 0
  let by = 0
  for (let k = 0; k < 8; k++) {
    const nx = ix + NX[k]!
    const ny = iy + NY[k]!
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
    const d = dist[ny * cols + nx]!
    if (d < best) {
      best = d
      bx = (nx + 0.5) * cell - x
      by = (ny + 0.5) * cell - y
    }
  }
  if (best === here || !Number.isFinite(best)) return null
  const len = Math.hypot(bx, by)
  return len > 1e-9 ? { x: bx / len, y: by / len } : null
}

// ————————————————————————————— 一局的溶洞 —————————————————————————————

export interface CaveState {
  readonly layout: CaveLayout
  /** 出怪口用的地标（见 caveMarks）与白天的那一份：白天亮着的几组是空的 */
  readonly marks: Readonly<Record<string, readonly Landmark[]>>
  readonly dayMarks: Readonly<Record<string, readonly Landmark[]>>
  readonly light: CaveLight
  readonly flow: CaveFlow
  readonly sky: CaveSky
  /** 这一局开局时的月龄，天 */
  readonly age0: number
  /** 按身体记的火把 */
  readonly torches: Map<number, Torch>
  /** 离下一次重算光还有多久，毫秒 */
  lightIn: number
  /** 离下一次重算绕路还有多久，毫秒 */
  flowIn: number
}

/** 支洞的洞道上每隔这么远记一处，格 */
const TUNNEL_STEP_U = 1
/** 暗室、水潭、天窗当口子时取它多大的一圈（占半径的比例） */
const MARK_SHARE = 0.5

/**
 * 溶洞的地标，像素：alcove 是支洞深处的暗室，朝洞道往外；tunnel 是支洞洞道上一路的点（石缝躲开它们）；
 * pool、glow 是水潭与荧光丛，skylight 是主天窗以外的天窗，main 是主天窗，这四组只在入夜后出怪
 */
function caveMarks(L: CaveLayout): Record<string, Landmark[]> {
  const circle = (x: number, y: number, r: number): Landmark => ({ x, y, r, nx: 0, ny: 0 })
  const alcove = L.alcoves.map((a): Landmark => {
    const end = a.path[a.path.length - 1]!
    const back = a.path[a.path.length - 2]!
    const d = Math.hypot(back.x - end.x, back.y - end.y) || 1
    return { x: end.x, y: end.y, r: a.pocket * MARK_SHARE, nx: (back.x - end.x) / d, ny: (back.y - end.y) / d }
  })
  const tunnel: Landmark[] = []
  for (const a of L.alcoves) {
    for (let i = 0; i + 1 < a.path.length; i++) {
      const p = a.path[i]!
      const q = a.path[i + 1]!
      const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / (TUNNEL_STEP_U * UNIT)))
      for (let k = 0; k < n; k++) tunnel.push(circle(p.x + ((q.x - p.x) * k) / n, p.y + ((q.y - p.y) * k) / n, 0))
    }
    const end = a.path[a.path.length - 1]!
    tunnel.push(circle(end.x, end.y, 0))
  }
  return {
    alcove,
    tunnel,
    pool: L.pools.map((p) => circle(p.x, p.y, Math.min(p.rx, p.ry) * MARK_SHARE)),
    glow: L.glows.map((g) => circle(g.x, g.y, g.r)),
    skylight: L.openings.slice(1).map((o) => circle(o.x, o.y, o.r * MARK_SHARE)),
    main: L.openings.slice(0, 1).map((o) => circle(o.x, o.y, o.r * MARK_SHARE)),
  }
}

export function makeCaveState(cfg: CaveConfig, map: Rect, rng: Rng, sec: number): CaveState {
  const layout = makeCave(cfg, map, rng)
  const light = makeLight(layout, cfg)
  const age0 = rng.next() * SYNODIC_DAYS
  const sky = skyAt(cfg, sec, age0, { hour: 0, days: 0, sun: { x: 0, y: -1, elev: 0 }, moon: { x: 0, y: -1, elev: 0 }, age: 0, phase: 0, sunLux: 0, skyLux: 0, moonLux: 0, moonSkyLux: 0 })
  stepLight(light, layout, cfg, sky)
  const marks = caveMarks(layout)
  const dayMarks = { ...marks, pool: [], glow: [], skylight: [], main: [] }
  return { layout, marks, dayMarks, light, flow: makeFlow(layout), sky, age0, torches: new Map(), lightIn: 0, flowIn: 0 }
}
