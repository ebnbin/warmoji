import { at, clearingDepth, heightAt, poolAt, project } from './layout'
import type { Along, Reach, RiverPlan } from './layout'
import type { RiverConfig } from '../../types/maps'

export const GRAVITY = 9.81
/** 浅水方程的格子边长，格 */
export const WATER_CELL_U = 0.5
/** 薄过这个（米）算干 */
const DRY = 1e-4
/** 算流速时把水深在这个量级（米）以下的格子的流速压向零，免得薄水层里动量除以水深除出天文数字 */
const THIN = 1e-3
const CFL = 0.45
/** 深谷里比断崖边低过这么多（米）的格子，水一流进去就落下去了 */
const DROP = 0.5
/** 落水从崖脚往潭里砸开这么宽一条，格 */
const SPLASH_U = 1.2
/** 稳态：出水与进水差在这个比例以内、有水的格子水深平均每秒变化不到这么多（米）就停；最多算这么多秒 */
const BALANCE = 0.004
const STILL = 2e-4
const MAX_S = 240

/**
 * 稳态水流：格子 (0, 0) 的左上角在地图原点，边长 WATER_CELL_U 格；河床高程、水深（米）与流速（米/秒，地图坐标）。
 * sink 标出深谷里的格子（属于第几个出水口），水流到那里就从断崖边落下去了
 */
export interface Water {
  readonly cols: number
  readonly rows: number
  readonly cell: number
  readonly z: Float32Array
  readonly h: Float32Array
  readonly u: Float32Array
  readonly v: Float32Array
  readonly sink: Int8Array
}

/** 离 (x, y) 最近的那段河道，和它的设计水位：没在哪段河道的河岸以内就是 null */
function designAt(plan: RiverPlan, x: number, y: number, tmp: Along): { r: Reach; level: number; edge: number } | null {
  let best: Reach | null = null
  let edge = Infinity
  let level = 0
  for (const r of plan.reaches) {
    project(r, x, y, tmp)
    const e = Math.abs(tmp.n) - at(r.half, tmp)
    if (e < edge) {
      edge = e
      best = r
      level = at(r.level, tmp)
    }
  }
  return best ? { r: best, level, edge } : null
}

/** hll 算出的界面通量：质量、法向动量、切向动量 */
let FH = 0
let FN = 0
let FT = 0

/**
 * HLL 近似黎曼解，法向速度 ul / ur：质量与法向动量按 HLL 取，切向动量按质量通量的方向迎风；
 * 一侧干的时候波速按干湿前沿 u ± 2c 取
 */
function hll(hl: number, ul: number, vl: number, hr: number, ur: number, vr: number): void {
  if (hl <= 0 && hr <= 0) {
    FH = 0
    FN = 0
    FT = 0
    return
  }
  const cl = Math.sqrt(GRAVITY * hl)
  const cr = Math.sqrt(GRAVITY * hr)
  let sl: number
  let sr: number
  if (hl <= 0) {
    sl = ur - 2 * cr
    sr = ur + cr
  } else if (hr <= 0) {
    sl = ul - cl
    sr = ul + 2 * cl
  } else {
    sl = Math.min(ul - cl, ur - cr)
    sr = Math.max(ul + cl, ur + cr)
  }
  const fhl = hl * ul
  const fhr = hr * ur
  const fnl = hl * ul * ul + 0.5 * GRAVITY * hl * hl
  const fnr = hr * ur * ur + 0.5 * GRAVITY * hr * hr
  if (sl >= 0) {
    FH = fhl
    FN = fnl
  } else if (sr <= 0) {
    FH = fhr
    FN = fnr
  } else {
    const k = 1 / (sr - sl)
    FH = (sr * fhl - sl * fhr + sl * sr * (hr - hl)) * k
    FN = (sr * fnl - sl * fnr + sl * sr * (hr * ur - hl * ul)) * k
  }
  FT = FH > 0 ? FH * vl : FH * vr
}

/**
 * 在河床上解二维浅水方程直到稳态：有限体积，界面上按静水重构（Audusse）保持静水平衡与水深非负，HLL 通量，曼宁摩阻半隐式；
 * 瀑布的水按流量从崖脚那一条砸进深潭，带着崖上溪水的水平流速（下落时水平方向不受力）；落进深谷的水就此离开。
 * 从按设计水位铺好的静水起算（比带着设计流速起算收敛得快：不会先冲出一大股再慢慢补回来），进出水平衡、水面不再变就停
 */
export function solveWater(cfg: RiverConfig, plan: RiverPlan): Water {
  const mpu = cfg.meterPerU
  const cols = Math.ceil(plan.w / WATER_CELL_U)
  const rows = Math.ceil(plan.h / WATER_CELL_U)
  const n = cols * rows
  const dx = WATER_CELL_U * mpu
  const z = new Float64Array(n)
  const h = new Float64Array(n)
  const hu = new Float64Array(n)
  const hv = new Float64Array(n)
  const sink = new Int8Array(n).fill(-1)
  const src = new Float64Array(n)
  const tmp: Along = { i: 0, t: 0, s: 0, n: 0, d: 0 }
  const inlet = plan.inlet
  const q = cfg.flow.discharge
  let splash = 0
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      const x = (cx + 0.5) * WATER_CELL_U
      const y = (cy + 0.5) * WATER_CELL_U
      z[i] = heightAt(plan.terrain, x, y)
      for (let k = 0; k < plan.gorges.length; k++) {
        const g = plan.gorges[k]!
        project(g, x, y, tmp)
        if (tmp.s > 0 && Math.abs(tmp.n) < at(g.half, tmp) + 0.7 && z[i]! < plan.outlets[k]!.level - DROP) sink[i] = k
      }
      if (sink[i]! >= 0) continue
      const ax = x - inlet.x
      const ay = y - inlet.y
      const into = ax * inlet.nx + ay * inlet.ny
      const side = ax * -inlet.ny + ay * inlet.nx
      if (into > 0 && into < SPLASH_U && Math.abs(side) < inlet.half && clearingDepth(plan.shape, x, y) > 0) {
        src[i] = 1
        splash++
      }
      const pool = poolAt(inlet, plan.shape.seed, x, y) < 1
      const d = designAt(plan, x, y, tmp)
      if (!d || (d.edge > 0.5 && !pool)) continue
      const level = pool ? Math.max(0, d.level) : d.level
      const depth = level - z[i]!
      if (depth <= DRY) continue
      h[i] = depth
    }
  }
  if (splash === 0) throw new Error('瀑布没落在深潭里')
  const jet = plan.upstream.speed
  for (let i = 0; i < n; i++) src[i] = (src[i]! * q) / (splash * dx * dx)
  const ah = new Float64Array(n)
  const ahu = new Float64Array(n)
  const ahv = new Float64Array(n)
  const vel = (i: number, m: Float64Array): number => {
    const d = h[i]!
    return d > DRY ? (m[i]! * d) / (d * d + THIN * THIN) : 0
  }
  const g2 = 0.5 * GRAVITY
  const fr = GRAVITY * cfg.flow.manning ** 2
  let t = 0
  let window = 0
  let windowOut = 0
  let change = 0
  const act = new Uint8Array(n)
  const list = new Int32Array(n)
  while (t < MAX_S) {
    act.fill(0)
    for (let i = 0; i < n; i++) {
      if (h[i]! <= DRY && src[i]! === 0) continue
      act[i] = 1
      if (i % cols > 0) act[i - 1] = 1
      if (i % cols < cols - 1) act[i + 1] = 1
      if (i >= cols) act[i - cols] = 1
      if (i < n - cols) act[i + cols] = 1
    }
    let m = 0
    for (let i = 0; i < n; i++) if (act[i]) list[m++] = i
    let fast = 1e-6
    for (let a = 0; a < m; a++) {
      const i = list[a]!
      const d = h[i]!
      if (d <= DRY) continue
      const c = Math.sqrt(GRAVITY * d)
      const s = Math.max(Math.abs(hu[i]!), Math.abs(hv[i]!)) / d + c
      if (s > fast) fast = s
    }
    const dt = (CFL * dx) / fast
    for (let a = 0; a < m; a++) {
      const i = list[a]!
      ah[i] = 0
      ahu[i] = 0
      ahv[i] = 0
    }
    for (let a = 0; a < m; a++) {
      const i = list[a]!
      if (i % cols < cols - 1) {
        const j = i + 1
        if (h[i]! > DRY || h[j]! > DRY) {
          const zs = Math.max(z[i]!, z[j]!)
          const hl = Math.max(0, h[i]! + z[i]! - zs)
          const hr = Math.max(0, h[j]! + z[j]! - zs)
          hll(hl, vel(i, hu), vel(i, hv), hr, vel(j, hu), vel(j, hv))
          ah[i] = ah[i]! - FH
          ahu[i] = ahu[i]! - FN - g2 * (h[i]! * h[i]! - hl * hl)
          ahv[i] = ahv[i]! - FT
          ah[j] = ah[j]! + FH
          ahu[j] = ahu[j]! + FN + g2 * (h[j]! * h[j]! - hr * hr)
          ahv[j] = ahv[j]! + FT
        }
      }
      if (i < n - cols) {
        const j = i + cols
        if (h[i]! > DRY || h[j]! > DRY) {
          const zs = Math.max(z[i]!, z[j]!)
          const hl = Math.max(0, h[i]! + z[i]! - zs)
          const hr = Math.max(0, h[j]! + z[j]! - zs)
          hll(hl, vel(i, hv), vel(i, hu), hr, vel(j, hv), vel(j, hu))
          ah[i] = ah[i]! - FH
          ahv[i] = ahv[i]! - FN - g2 * (h[i]! * h[i]! - hl * hl)
          ahu[i] = ahu[i]! - FT
          ah[j] = ah[j]! + FH
          ahv[j] = ahv[j]! + FN + g2 * (h[j]! * h[j]! - hr * hr)
          ahu[j] = ahu[j]! + FT
        }
      }
    }
    const k = dt / dx
    let moved = 0
    let wet = 0
    let gone = 0
    for (let a = 0; a < m; a++) {
      const i = list[a]!
      let d = h[i]! + k * ah[i]! + dt * src[i]!
      let mu = hu[i]! + k * ahu[i]! + dt * src[i]! * jet * inlet.nx
      let mv = hv[i]! + k * ahv[i]! + dt * src[i]! * jet * inlet.ny
      if (sink[i]! >= 0) {
        gone += Math.max(0, d)
        d = 0
      }
      if (d <= DRY) {
        d = Math.max(0, d)
        mu = 0
        mv = 0
      } else {
        const speed = Math.sqrt(mu * mu + mv * mv) / d
        const f = 1 / (1 + (dt * fr * speed) / d ** (4 / 3))
        mu *= f
        mv *= f
      }
      if (d > DRY) {
        moved += Math.abs(d - h[i]!)
        wet++
      }
      h[i] = d
      hu[i] = mu
      hv[i] = mv
    }
    t += dt
    window += dt
    windowOut += gone * dx * dx
    change = Math.max(change, moved / Math.max(1, wet) / dt)
    if (window >= 1) {
      const rate = windowOut / window
      if (t > 8 && Math.abs(rate - q) < BALANCE * q && change < STILL) break
      window = 0
      windowOut = 0
      change = 0
    }
  }
  const zf = new Float32Array(n)
  const hf = new Float32Array(n)
  const uf = new Float32Array(n)
  const vf = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    zf[i] = z[i]!
    hf[i] = h[i]!
    uf[i] = vel(i, hu)
    vf[i] = vel(i, hv)
  }
  return { cols, rows, cell: WATER_CELL_U, z: zf, h: hf, u: uf, v: vf, sink }
}

/** 水深（米）与流速（米/秒，地图坐标） */
export interface Flow {
  h: number
  u: number
  v: number
}

/** 水在 (x, y) 格处的水深与流速，按格心双线性插值 */
export function flowAt(w: Water, x: number, y: number, out: Flow): Flow {
  const fu = Math.min(w.cols - 1.001, Math.max(0, x / w.cell - 0.5))
  const fv = Math.min(w.rows - 1.001, Math.max(0, y / w.cell - 0.5))
  const ix = Math.floor(fu)
  const iy = Math.floor(fv)
  const fx = fu - ix
  const fy = fv - iy
  const i = iy * w.cols + ix
  const a = (1 - fx) * (1 - fy)
  const b = fx * (1 - fy)
  const c = (1 - fx) * fy
  const d = fx * fy
  out.h = w.h[i]! * a + w.h[i + 1]! * b + w.h[i + w.cols]! * c + w.h[i + w.cols + 1]! * d
  out.u = w.u[i]! * a + w.u[i + 1]! * b + w.u[i + w.cols]! * c + w.u[i + w.cols + 1]! * d
  out.v = w.v[i]! * a + w.v[i + 1]! * b + w.v[i + w.cols]! * c + w.v[i + w.cols + 1]! * d
  return out
}
