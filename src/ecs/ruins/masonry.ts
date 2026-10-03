/** 重力加速度，米/秒² */
export const GRAVITY = 9.81

/** 砌体格子：院落局部坐标（格）里的方格，格子 (0, 0) 的左上角在局部 (u0, v0)，边长 cell 格 */
export interface Grid {
  readonly cols: number
  readonly rows: number
  readonly cell: number
  readonly u0: number
  readonly v0: number
}

export type StructureKind = 'outer' | 'inner' | 'tower' | 'parapet' | 'column'

/** 一处砌体：墙沿 axis（0 沿 u、1 沿 v）砌，石柱是圆的（axis 为 -1）；局部坐标里的外框，格 */
export interface Structure {
  readonly kind: StructureKind
  readonly axis: -1 | 0 | 1
  readonly u0: number
  readonly v0: number
  readonly u1: number
  readonly v1: number
}

/**
 * 砌体此刻的样子：每格剩几层石块、属于哪一处（0 是空地，否则是 structures 的序号加一）、封着几层高的木板、地上的碎石多深（米）。
 * 一层石块高 courseM 米，一格边长 cellM 米；同一处相邻两格最多差 bond 层才立得住；碎石按休止角的正切堆
 */
export interface Masonry {
  readonly grid: Grid
  readonly courseM: number
  readonly cellM: number
  readonly bond: number
  readonly reposeTan: number
  readonly density: number
  readonly structures: readonly Structure[]
  readonly n: Uint8Array
  readonly sid: Uint16Array
  readonly timber: Uint8Array
  readonly rubble: Float32Array
}

/** 塌下来的一截：格子 i 上从 z1 塌到 z0（米）的那截，体积（米³）；木板的不变成碎石 */
export interface Fall {
  readonly i: number
  readonly z0: number
  readonly z1: number
  readonly volume: number
  readonly timber: boolean
}

/** 一截塌下来的石块从格子 i 落到局部 (u, v) 格：体积（米³）、从多高落下（米） */
export interface Landing {
  readonly i: number
  readonly u: number
  readonly v: number
  readonly volume: number
  readonly drop: number
}

/** 尘雾：按砌体格子每 2×2 格一格记的消光系数，每米 */
export interface Dust {
  readonly cols: number
  readonly rows: number
  readonly sigma: Float32Array
}

export function newDust(g: Grid): Dust {
  const cols = Math.ceil(g.cols / 2)
  const rows = Math.ceil(g.rows / 2)
  return { cols, rows, sigma: new Float32Array(cols * rows) }
}

/** 砌体与木板的结构强度：破坏力除以它才是能打掉的体积 */
export interface Strength {
  readonly masonry: number
  readonly timber: number
}

/** 局部 (u, v) 格落在第几格；出了格子为 -1 */
export function cellAt(g: Grid, u: number, v: number): number {
  const i = Math.floor((u - g.u0) / g.cell)
  const j = Math.floor((v - g.v0) / g.cell)
  return i < 0 || j < 0 || i >= g.cols || j >= g.rows ? -1 : j * g.cols + i
}

/** 格子 i 的中心，局部格 */
export function cellCenter(g: Grid, i: number): { u: number; v: number } {
  const ci = i % g.cols
  return { u: g.u0 + (ci + 0.5) * g.cell, v: g.v0 + ((i - ci) / g.cols + 0.5) * g.cell }
}

interface Hit {
  readonly i: number
  readonly d: number
}

/** 一团半径 rho 米的打击在这些格子上要打碎多少（按强度折算的体积）；apply 为真就真的打掉，塌下来的记进 out */
function strike(m: Masonry, k: Strength, hits: readonly Hit[], z: number, rho: number, apply: boolean, out: Fall[], seeds: number[]): number {
  const hc = m.courseM
  const area = m.cellM * m.cellM
  let cost = 0
  for (const h of hits) {
    if (h.d >= rho) continue
    const s = Math.sqrt(rho * rho - h.d * h.d)
    const lo = Math.max(0, Math.floor((z - s) / hc))
    const hi = Math.ceil((z + s) / hc)
    const n = m.n[h.i]!
    if (lo < n) {
      cost += (Math.min(n, hi) - lo) * hc * area * k.masonry
      if (apply) {
        out.push({ i: h.i, z0: lo * hc, z1: n * hc, volume: (n - lo) * hc * area, timber: false })
        m.n[h.i] = lo
        seeds.push(h.i)
      }
    }
    const t = m.timber[h.i]!
    if (lo < t) {
      cost += (Math.min(t, hi) - lo) * hc * area * k.timber
      if (apply) {
        out.push({ i: h.i, z0: lo * hc, z1: t * hc, volume: (t - lo) * hc * area, timber: true })
        m.timber[h.i] = lo
      }
    }
  }
  return cost
}

/**
 * 破坏力打在局部 (u, v) 格、离地 z 米处：离打击点近的先碎，按强度折算打掉的体积凑满 amount（立方米）为止，最远打到同样体积的球的两倍半径。
 * 打碎处以上的那截没了支撑一起塌下；再让陡过砌法的地方塌成台阶（见 relax）。返回用掉的破坏力，塌下来的每一截记进 out
 */
export function carve(m: Masonry, k: Strength, u: number, v: number, z: number, amount: number, out: Fall[]): number {
  if (amount <= 0 || !(k.masonry > 0) || !(k.timber > 0)) return 0
  const g = m.grid
  const cap = Math.cbrt((3 * amount) / (4 * Math.PI * Math.min(k.masonry, k.timber))) * 2
  const cu = (u - g.u0) / g.cell
  const cv = (v - g.v0) / g.cell
  const rc = cap / m.cellM + 1
  const hits: Hit[] = []
  for (let j = Math.max(0, Math.floor(cv - rc)); j <= Math.min(g.rows - 1, Math.floor(cv + rc)); j++) {
    for (let i = Math.max(0, Math.floor(cu - rc)); i <= Math.min(g.cols - 1, Math.floor(cu + rc)); i++) {
      const idx = j * g.cols + i
      if (m.n[idx] === 0 && m.timber[idx] === 0) continue
      hits.push({ i: idx, d: Math.hypot(i + 0.5 - cu, j + 0.5 - cv) * m.cellM })
    }
  }
  if (hits.length === 0) return 0
  const none: Fall[] = []
  const nope: number[] = []
  let rho = cap
  if (strike(m, k, hits, z, cap, false, none, nope) > amount) {
    let lo = 0
    let hi = cap
    for (let it = 0; it < 16; it++) {
      const mid = (lo + hi) / 2
      if (strike(m, k, hits, z, mid, false, none, nope) > amount) hi = mid
      else lo = mid
    }
    rho = lo
  }
  const seeds: number[] = []
  const used = strike(m, k, hits, z, rho, true, out, seeds)
  relax(m, seeds, out)
  return used
}

/** 同一处砌体里比相邻格高出 bond 层以上的那截立不住，塌到只高 bond 层，一路传开；塌下来的记进 out */
export function relax(m: Masonry, seeds: readonly number[], out: Fall[]): void {
  const { cols, rows } = m.grid
  const n = m.n
  const sid = m.sid
  const hc = m.courseM
  const area = m.cellM * m.cellM
  const stack: number[] = []
  const push = (i: number): void => {
    const ci = i % cols
    stack.push(i)
    if (ci > 0) stack.push(i - 1)
    if (ci < cols - 1) stack.push(i + 1)
    if (i >= cols) stack.push(i - cols)
    if (i < cols * (rows - 1)) stack.push(i + cols)
  }
  for (const i of seeds) push(i)
  while (stack.length > 0) {
    const i = stack.pop()!
    const s = sid[i]!
    if (s === 0 || n[i] === 0) continue
    const ci = i % cols
    let low = n[i]!
    if (ci > 0 && sid[i - 1] === s) low = Math.min(low, n[i - 1]! + m.bond)
    if (ci < cols - 1 && sid[i + 1] === s) low = Math.min(low, n[i + 1]! + m.bond)
    if (i >= cols && sid[i - cols] === s) low = Math.min(low, n[i - cols]! + m.bond)
    if (i < cols * (rows - 1) && sid[i + cols] === s) low = Math.min(low, n[i + cols]! + m.bond)
    if (low >= n[i]!) continue
    out.push({ i, z0: low * hc, z1: n[i]! * hc, volume: (n[i]! - low) * hc * area, timber: false })
    n[i] = low
    push(i)
  }
}

/**
 * 塌下来的石块落到墙脚：从塌的那格顺着墙面的法线走到空地，再往外落出一段，越高落得越远；倒下的石柱顺着倒的方向把柱身铺在地上。
 * 往哪边落：离打击点 (au, av) 远的那边多些，没给就各半。碎石记进地上，按休止角摊开；返回每一截落在哪
 */
export function spill(m: Masonry, falls: readonly Fall[], away: { u: number; v: number } | null, rand: () => number): Landing[] {
  const g = m.grid
  const area = m.cellM * m.cellM
  const out: Landing[] = []
  const topple = new Map<number, { du: number; dv: number }>()
  let i0 = g.cols
  let j0 = g.rows
  let i1 = -1
  let j1 = -1
  for (const f of falls) {
    if (f.timber) continue
    const st = m.structures[m.sid[f.i]! - 1]
    const c = cellCenter(g, f.i)
    let du = 0
    let dv = 0
    let reach: number
    if (!st || st.axis < 0) {
      const key = m.sid[f.i]!
      let dir = topple.get(key)
      if (!dir) {
        const a = away && rand() < 0.75 ? Math.atan2(c.v - away.v, c.u - away.u) + (rand() - 0.5) * 0.8 : rand() * Math.PI * 2
        dir = { du: Math.cos(a), dv: Math.sin(a) }
        topple.set(key, dir)
      }
      du = dir.du
      dv = dir.dv
      reach = (f.z0 + rand() * (f.z1 - f.z0)) / m.cellM
    } else {
      const side = away && rand() < 0.75 ? ((st.axis === 0 ? c.v - away.v : c.u - away.u) >= 0 ? 1 : -1) : rand() < 0.5 ? -1 : 1
      if (st.axis === 0) dv = side
      else du = side
      reach = (rand() * (0.15 + 0.35 * f.z1)) / m.cellM
    }
    let ci = f.i % g.cols
    let cj = (f.i - ci) / g.cols
    for (let k = 0; k < 24; k++) {
      const idx = cj * g.cols + ci
      if (m.n[idx] === 0 && m.timber[idx] === 0) break
      ci = Math.round(ci + du)
      cj = Math.round(cj + dv)
      if (ci < 0 || cj < 0 || ci >= g.cols || cj >= g.rows) break
    }
    const jit = (rand() - 0.5) * (0.4 / m.cellM)
    const lu = ci + 0.5 + du * reach - dv * jit
    const lv = cj + 0.5 + dv * reach + du * jit
    const li = Math.floor(lu)
    const lj = Math.floor(lv)
    out.push({ i: f.i, u: g.u0 + lu * g.cell, v: g.v0 + lv * g.cell, volume: f.volume, drop: (f.z0 + f.z1) / 2 })
    if (li < 0 || lj < 0 || li >= g.cols || lj >= g.rows) continue
    const at = lj * g.cols + li
    if (m.n[at]! > 0 || m.timber[at]! > 0) continue
    m.rubble[at] = m.rubble[at]! + f.volume / area
    i0 = Math.min(i0, li)
    j0 = Math.min(j0, lj)
    i1 = Math.max(i1, li)
    j1 = Math.max(j1, lj)
  }
  if (i1 >= 0) settle(m, i0 - 8, j0 - 8, i1 + 8, j1 + 8, 48)
  return out
}

/** 碎石按休止角摊开：比相邻的空地高出休止角允许的部分往下滑，最多扫 sweeps 遍 */
export function settle(m: Masonry, i0: number, j0: number, i1: number, j1: number, sweeps: number): void {
  const g = m.grid
  const r = m.rubble
  const maxD = m.reposeTan * m.cellM
  const a0 = Math.max(0, i0)
  const b0 = Math.max(0, j0)
  const a1 = Math.min(g.cols - 1, i1)
  const b1 = Math.min(g.rows - 1, j1)
  const floor = (i: number): boolean => m.n[i] === 0 && m.timber[i] === 0
  for (let k = 0; k < sweeps; k++) {
    let moved = false
    for (let j = b0; j <= b1; j++) {
      for (let i = a0; i <= a1; i++) {
        const idx = j * g.cols + i
        if (r[idx]! <= maxD || !floor(idx)) continue
        const nb = [i > 0 ? idx - 1 : -1, i < g.cols - 1 ? idx + 1 : -1, j > 0 ? idx - g.cols : -1, j < g.rows - 1 ? idx + g.cols : -1]
        for (const q of nb) {
          if (q < 0 || !floor(q)) continue
          const d = r[idx]! - r[q]! - maxD
          if (d <= 0) continue
          const t = d * 0.25
          r[idx] = r[idx]! - t
          r[q] = r[q]! + t
          moved = true
        }
      }
    }
    if (!moved) break
  }
}

const INF = 1e20

/** 一维平方距离变换（Felzenszwalb–Huttenlocher）：d[q] = min_p (q − p)² + f[p] */
function edt1(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!)
    while (s <= z[k]!) {
      k--
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!)
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++
    d[q] = (q - v[k]!) ** 2 + f[v[k]!]!
  }
}

/** 每格到最近的 on 格的距离，以格计；没有 on 格时处处极远 */
function distanceTo(on: Uint8Array, cols: number, rows: number): Float64Array {
  const out = new Float64Array(cols * rows)
  const n = Math.max(cols, rows)
  const f = new Float64Array(n)
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  for (let i = 0; i < out.length; i++) out[i] = on[i] ? 0 : INF
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) f[y] = out[y * cols + x]!
    edt1(f, rows, d, v, z)
    for (let y = 0; y < rows; y++) out[y * cols + x] = d[y]!
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) f[x] = out[y * cols + x]!
    edt1(f, cols, d, v, z)
    for (let x = 0; x < cols; x++) out[y * cols + x] = Math.sqrt(d[x]!)
  }
  return out
}

/** 挡得住跨过 level 层的身体的格子：砌体高过 level 层，或封着木板 */
function blocksBody(m: Masonry, i: number, level: number): boolean {
  return m.n[i]! > level || m.timber[i]! > 0
}

/** 跨得过 level 层的身体按的距离场：每格离最近的挡路格多远，格，挡路格里为负 */
export function bodyField(m: Masonry, level: number): Float32Array {
  const { cols, rows } = m.grid
  const k = cols * rows
  const wall = new Uint8Array(k)
  const free = new Uint8Array(k)
  for (let i = 0; i < k; i++) {
    const b = blocksBody(m, i, level)
    wall[i] = b ? 1 : 0
    free[i] = b ? 0 : 1
  }
  const out = distanceTo(wall, cols, rows)
  const back = distanceTo(free, cols, rows)
  const room = new Float32Array(k)
  for (let i = 0; i < k; i++) room[i] = (wall[i] ? 0.5 - back[i]! : Math.min(out[i]!, 1e6) - 0.5) * m.grid.cell
  return room
}

/** 距离场在局部 (u, v) 格处的双线性值，格 */
export function roomOf(g: Grid, room: Float32Array, u: number, v: number): number {
  const x = Math.min(g.cols - 1.001, Math.max(0, (u - g.u0) / g.cell - 0.5))
  const y = Math.min(g.rows - 1.001, Math.max(0, (v - g.v0) / g.cell - 0.5))
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const i = iy * g.cols + ix
  const a = room[i]!
  const b = room[i + 1]!
  const c = room[i + g.cols]!
  const d = room[i + g.cols + 1]!
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

/** 离挡路的地方越来越远的局部单位方向 */
export function awayOf(g: Grid, room: Float32Array, u: number, v: number): { u: number; v: number } {
  const h = g.cell * 0.5
  const gu = roomOf(g, room, u + h, v) - roomOf(g, room, u - h, v)
  const gv = roomOf(g, room, u, v + h) - roomOf(g, room, u, v - h)
  const len = Math.hypot(gu, gv)
  return len > 1e-9 ? { u: gu / len, v: gv / len } : { u: 0, v: 0 }
}

/** 半径 rad 格的身体走不进挡路的格子：陷进去多深就顺着法线退出来，拐角处最多退四次 */
export function pushOut(g: Grid, room: Float32Array, u: number, v: number, rad: number): { u: number; v: number } {
  let pu = u
  let pv = v
  for (let k = 0; k < 4; k++) {
    const d = roomOf(g, room, pu, pv)
    if (d >= rad) break
    const n = awayOf(g, room, pu, pv)
    if (n.u === 0 && n.v === 0) break
    pu += n.u * (rad - d)
    pv += n.v * (rad - d)
  }
  return { u: pu, v: pv }
}

/** 局部线段 a→b（格）在挡跨过 level 层的身体的格子前停下的比例（0 到 1）：快得一步跨过整堵墙的身体不能穿过去 */
export function walkStop(m: Masonry, level: number, ua: number, va: number, ub: number, vb: number): number {
  const g = m.grid
  const x0 = (ua - g.u0) / g.cell
  const y0 = (va - g.v0) / g.cell
  const dx = (ub - g.u0) / g.cell - x0
  const dy = (vb - g.v0) / g.cell - y0
  let ix = Math.floor(x0)
  let iy = Math.floor(y0)
  const sx = dx > 0 ? 1 : -1
  const sy = dy > 0 ? 1 : -1
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity
  let tx = dx !== 0 ? (dx > 0 ? ix + 1 - x0 : x0 - ix) * tdx : Infinity
  let ty = dy !== 0 ? (dy > 0 ? iy + 1 - y0 : y0 - iy) * tdy : Infinity
  let t = 0
  for (let k = 0; k < 4096; k++) {
    if (ix >= 0 && iy >= 0 && ix < g.cols && iy < g.rows && k > 0 && blocksBody(m, iy * g.cols + ix, level)) return t
    if (tx >= 1 && ty >= 1) break
    if (tx < ty) {
      t = tx
      tx += tdx
      ix += sx
    } else {
      t = ty
      ty += tdy
      iy += sy
    }
  }
  return 1
}
