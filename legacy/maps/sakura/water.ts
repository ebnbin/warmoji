import { at, GRAVITY, heightAt, project } from './channel'
import { ROCK_FACE_U, rocksLocal, SINK_M, weirLocal } from './layout'
import type { Along } from './channel'
import type { SakuraPlan } from './layout'
import type { SakuraConfig } from '../../types/maps'

/** 浅水方程的格子边长，格 */
export const WATER_CELL_U = 0.5
/** 薄过这个（米）算干 */
const DRY = 1e-4
/** 算流速时把水深在这个量级（米）以下的格子的流速压向零，免得薄水层里动量除以水深除出天文数字 */
const THIN = 1e-3
const CFL = 0.45
/** 稳态：出水与进水差在这个比例以内、有水的格子水深平均每秒变化不到这么多（米）就停；最多算这么多秒 */
const BALANCE = 0.004
const STILL = 2e-4
const MAX_S = 240
/** 石组那一溜按挡水算的格子垫这么高（米）：石头连同石缝一起堵死，水只从石组下游冒出来 */
const ROCK_Z = 6
/** 石组那条线往上游这么远（格）以内都按挡水算 */
const ROCK_BAND_U = 1.4
/** 水从石组下游冒出来，带着流速往溪里冲开这么长一段，格 */
const SPOUT_U = 1
/** 设计水位以外这么远（格）的岸上不铺起算的水 */
const WET_BAND_U = 0.5

/**
 * 稳态水流：格子 (0, 0) 的左上角在地图原点，边长 WATER_CELL_U 格；河床高程、水深（米）与流速（米/秒，地图坐标）。
 * sink 标出石槛下的汇，水流到那里就落下槛去了
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
 * 樱花的水流：河床取地形；石组那一溜垫高挡死，水按流量从石组下游带着设计流速冒出来；石槛下比槛顶低过 SINK_M 的格子是汇；
 * 从按设计水位铺好的静水起算，解到稳态
 */
export function solveSakura(cfg: SakuraConfig, plan: SakuraPlan): Water {
  const mpu = cfg.meterPerU
  const cols = Math.ceil(plan.w / WATER_CELL_U)
  const rows = Math.ceil(plan.h / WATER_CELL_U)
  const n = cols * rows
  const dx = WATER_CELL_U * mpu
  const z = new Float64Array(n)
  const h = new Float64Array(n)
  const sink = new Int8Array(n).fill(-1)
  const src = new Float64Array(n)
  const tmp: Along = { i: 0, t: 0, s: 0, n: 0, d: 0 }
  const rk = plan.rocks
  const wr = plan.weir
  const r = plan.stream
  const q = cfg.flow.discharge
  let spout = 0
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx
      const x = (cx + 0.5) * WATER_CELL_U
      const y = (cy + 0.5) * WATER_CELL_U
      z[i] = heightAt(plan.terrain, x, y)
      const wl = weirLocal(wr, x, y)
      if (wl.along > 0 && wl.side < wr.half + 0.5 && z[i]! < wr.crest - SINK_M) {
        sink[i] = 0
        continue
      }
      const rl = rocksLocal(rk, x, y)
      if (rl.side < rk.span && rl.along > -ROCK_BAND_U && rl.along < ROCK_FACE_U) {
        z[i] = ROCK_Z
        continue
      }
      if (rl.along >= ROCK_FACE_U && rl.along < ROCK_FACE_U + SPOUT_U && rl.side < rk.half) {
        src[i] = 1
        spout++
      }
      project(r, x, y, tmp)
      if (tmp.s <= 0 || tmp.s >= wr.s || Math.abs(tmp.n) > at(r.half, tmp) + WET_BAND_U) continue
      const depth = at(r.level, tmp) - z[i]!
      if (depth > 1e-4) h[i] = depth
    }
  }
  if (spout === 0) throw new Error('石组下游没有出水的格子')
  for (let i = 0; i < n; i++) src[i] = (src[i]! * q) / (spout * dx * dx)
  return solveGrid({ cols, rows, cell: WATER_CELL_U, meterPerU: mpu, manning: cfg.flow.manning, z, h, src, jet: r.speed, dir: { x: rk.tx, y: rk.ty }, sink, q })
}

/**
 * 一张待解的格子：格子 (0, 0) 的左上角在地图原点，边长 cell 格；河床高程与起算的水深（米），水深解的时候就地改写；
 * 进水 src（每格每秒灌进多少米水深）带着速度 jet（米/秒）朝 dir 冲出来；sink 标出水一流到就离开的格子（属于第几个出水口，−1 不是）；
 * 进水的总流量 q（米³/秒），出水与它持平才算稳态
 */
interface Grid {
  readonly cols: number
  readonly rows: number
  readonly cell: number
  readonly meterPerU: number
  readonly manning: number
  readonly z: Float64Array
  readonly h: Float64Array
  readonly src: Float64Array
  readonly jet: number
  readonly dir: { readonly x: number; readonly y: number }
  readonly sink: Int8Array
  readonly q: number
}

/**
 * 在河床上解二维浅水方程直到稳态：有限体积，界面上按静水重构（Audusse）保持静水平衡与水深非负，HLL 通量，曼宁摩阻半隐式；
 * 汇里的水就此离开。进出水平衡、水面不再变就停
 */
function solveGrid(grid: Grid): Water {
  const { cols, rows, z, h, src, sink, q, jet, dir } = grid
  const n = cols * rows
  const dx = grid.cell * grid.meterPerU
  const hu = new Float64Array(n)
  const hv = new Float64Array(n)
  const ah = new Float64Array(n)
  const ahu = new Float64Array(n)
  const ahv = new Float64Array(n)
  const vel = (i: number, m: Float64Array): number => {
    const d = h[i]!
    return d > DRY ? (m[i]! * d) / (d * d + THIN * THIN) : 0
  }
  const g2 = 0.5 * GRAVITY
  const fr = GRAVITY * grid.manning ** 2
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
      let mu = hu[i]! + k * ahu[i]! + dt * src[i]! * jet * dir.x
      let mv = hv[i]! + k * ahv[i]! + dt * src[i]! * jet * dir.y
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
  return { cols, rows, cell: grid.cell, z: zf, h: hf, u: uf, v: vf, sink }
}

/** 水深（米）与流速（米/秒，地图坐标） */
export interface Flow {
  h: number
  u: number
  v: number
}

/** 水在 (x, y) 格处的水深与流速，按格心双线性插值；汇里的格子不算：水在那里已经落下槛去了，槛顶的水一直按槛顶的流到汇为止 */
export function flowAt(w: Water, x: number, y: number, out: Flow): Flow {
  const fu = Math.min(w.cols - 1.001, Math.max(0, x / w.cell - 0.5))
  const fv = Math.min(w.rows - 1.001, Math.max(0, y / w.cell - 0.5))
  const ix = Math.floor(fu)
  const iy = Math.floor(fv)
  const fx = fu - ix
  const fy = fv - iy
  const i = iy * w.cols + ix
  const a = w.sink[i]! < 0 ? (1 - fx) * (1 - fy) : 0
  const b = w.sink[i + 1]! < 0 ? fx * (1 - fy) : 0
  const c = w.sink[i + w.cols]! < 0 ? (1 - fx) * fy : 0
  const d = w.sink[i + w.cols + 1]! < 0 ? fx * fy : 0
  const sum = a + b + c + d
  if (sum <= 0) {
    out.h = 0
    out.u = 0
    out.v = 0
    return out
  }
  out.h = (w.h[i]! * a + w.h[i + 1]! * b + w.h[i + w.cols]! * c + w.h[i + w.cols + 1]! * d) / sum
  out.u = (w.u[i]! * a + w.u[i + 1]! * b + w.u[i + w.cols]! * c + w.u[i + w.cols + 1]! * d) / sum
  out.v = (w.v[i]! * a + w.v[i + 1]! * b + w.v[i + w.cols]! * c + w.v[i + w.cols + 1]! * d) / sum
  return out
}
