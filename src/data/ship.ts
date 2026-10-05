import type { ShipConfig } from '../types/maps'

/** 重力加速度，米/秒² */
export const GRAVITY = 9.81

type Hull = ShipConfig['hull']

/** 船尾横板中间往后鼓出多少格 */
export function bulgeU(h: Hull): number {
  return h.transomBulge * h.beamU
}

/** 甲板上的一个舱口，格：中心在船长方向 s 格处、船宽中线上，沿船长 len 格、横过船宽 wid 格 */
export interface Hatch {
  readonly s: number
  readonly len: number
  readonly wid: number
}

/** 舱口中心离桅杆多远、沿船长多长，格 */
const HATCH_GAP_U = 3.6
const HATCH_LEN_U = 2.4

/** 最后一根桅杆之后、最前一根之前各一个格栅舱口：桅杆之间留给队伍出发 */
export function hatchesOf(h: Hull): Hatch[] {
  const at = h.masts.map((f) => f * h.lengthU)
  const wid = Math.min(3, h.beamU * 0.17)
  return [
    { s: Math.min(...at) - HATCH_GAP_U, len: HATCH_LEN_U, wid },
    { s: Math.max(...at) + HATCH_GAP_U, len: HATCH_LEN_U, wid },
  ]
}

/** 船头往前伸出的一根杆的端头：在船长方向 s 格处，离甲板 h 米 */
export interface Spar {
  readonly s: number
  readonly h: number
}

/** 首斜桅与第一斜桅的端头 */
export function spritOf(h: Hull): { sprit: Spar; boom: Spar } {
  return { sprit: { s: h.lengthU + 3.4, h: 3.8 }, boom: { s: h.lengthU + 5, h: 4.6 } }
}

/** 队伍出发的地方在船长方向几格处：船长的正中，摆在方框正中 */
export function spawnS(h: Hull): number {
  return (h.lengthU - bulgeU(h)) / 2
}

/** 船尾舵轮在船长方向几格处 */
export function helmOf(h: Hull): number {
  return Math.max(1.6, h.stern * h.lengthU * 0.3)
}

/** 舵轮往船头 3.6 格的天窗 */
export function skylightOf(h: Hull): Hatch {
  return { s: helmOf(h) + 3.6, len: 1.6, wid: 1.2 }
}

/** 甲板在船长方向 s 格处的半宽，格：船尾横板的中线为 0、船首柱为 lengthU，甲板外为 0 */
export function halfBeamAt(h: Hull, s: number): number {
  const half = h.beamU / 2
  const bow = h.bow * h.lengthU
  const stern = h.stern * h.lengthU
  if (s >= h.lengthU) return 0
  if (s > h.lengthU - bow) return half * Math.cos((Math.PI / 2) * ((s - (h.lengthU - bow)) / bow)) ** h.bowPow
  if (s >= stern) return half
  const tb = half * h.transom
  if (s >= 0) return tb + (half - tb) * (1 - ((stern - s) / stern) ** h.sternPow) ** (1 / h.sternPow)
  const bulge = bulgeU(h)
  return s <= -bulge ? 0 : tb * Math.sqrt(1 + s / bulge)
}

/** 船上一点离舷墙外沿多远，格，舷墙以内为负；船首柱与横板中线外按到端点的距离算 */
export function bulwarkDistance(h: Hull, s: number, t: number): number {
  const end = -bulgeU(h)
  if (s >= h.lengthU) return Math.hypot(s - h.lengthU, t) - h.bulwarkU
  if (s <= end) return Math.hypot(s - end, t) - h.bulwarkU
  const e = 0.02
  const db = (halfBeamAt(h, s + e) - halfBeamAt(h, s - e)) / (2 * e)
  return (Math.abs(t) - halfBeamAt(h, s) - h.bulwarkU) / Math.sqrt(1 + db * db)
}

/** 空船正浮时的水线面与排水：面积（米²）、漂心离横板中线多远（米）、横向与纵向的面积惯性矩（米⁴）、排水体积（米³）、排水量（千克）、浮心高（米） */
export interface Hydrostatics {
  readonly area: number
  readonly lcf: number
  readonly inertiaT: number
  readonly inertiaL: number
  readonly volume: number
  readonly mass: number
  readonly kb: number
}

const SLICES = 480

/** 水线面取甲板的平面形状，每个横剖面的面积是宽乘吃水再乘舯剖面系数；浮心高按 Morrish 公式 KB = T·(5/2 − V/(A·T))/3 */
export function hydrostatics(cfg: ShipConfig): Hydrostatics {
  const h = cfg.hull
  const m = cfg.meterPerU
  const s0 = -bulgeU(h)
  const ds = ((h.lengthU - s0) / SLICES) * m
  const at = (i: number): { s: number; b: number } => {
    const s = s0 + ((i + 0.5) * (h.lengthU - s0)) / SLICES
    return { s: s * m, b: halfBeamAt(h, s) * m }
  }
  let area = 0
  let moment = 0
  let inertiaT = 0
  for (let i = 0; i < SLICES; i++) {
    const { s, b } = at(i)
    area += 2 * b * ds
    moment += 2 * b * ds * s
    inertiaT += (2 / 3) * b ** 3 * ds
  }
  const lcf = moment / area
  let inertiaL = 0
  for (let i = 0; i < SLICES; i++) {
    const { s, b } = at(i)
    inertiaL += 2 * b * ds * (s - lcf) ** 2
  }
  const d = cfg.hydro
  const volume = d.midship * d.draftM * area
  return { area, lcf, inertiaT, inertiaL, volume, mass: volume * d.rho, kb: (d.draftM * (2.5 - d.midship)) / 3 }
}

/** 甲板上加了 load 千克之后的稳性，米：总质量、平行下沉后的吃水、重心高、横向与纵向的稳心半径与初稳性高 */
export interface Stability {
  readonly mass: number
  readonly draft: number
  readonly kg: number
  readonly bmT: number
  readonly bmL: number
  readonly gmT: number
  readonly gmL: number
}

/** 加上的重量让船平行下沉：多出的排水体积是水线面乘下沉量，浮心按体积加权；重量的重心在甲板上方 bodyHeightM 米 */
export function stability(cfg: ShipConfig, hs: Hydrostatics, load: number): Stability {
  const d = cfg.hydro
  const mass = hs.mass + load
  const volume = mass / d.rho
  const sink = (volume - hs.volume) / hs.area
  const kb = (hs.volume * hs.kb + (volume - hs.volume) * (d.draftM + sink / 2)) / volume
  const kg = (hs.mass * d.kgM + load * (d.depthM + cfg.weight.bodyHeightM)) / mass
  const bmT = hs.inertiaT / volume
  const bmL = hs.inertiaL / volume
  return { mass, draft: d.draftM + sink, kg, bmT, bmL, gmT: kb + bmT - kg, gmL: kb + bmL - kg }
}

/** 直舷公式的复原力臂，米：GZ = sinφ·(GM + BM·tan²φ/2)，甲板边入水之前成立 */
export function rightingArm(gm: number, bm: number, phi: number): number {
  const t = Math.tan(phi)
  return Math.sin(phi) * (gm + 0.5 * bm * t * t)
}

/** 静倾角：复原力矩 Δ·g·GZ(φ) 与横倾力矩 g·cosφ·Σm·y 相等处，弧度；moment 是 Σm·y（千克·米） */
export function staticHeel(st: Stability, moment: number): number {
  let lo = 0
  let hi = 1.5
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (st.mass * rightingArm(st.gmT, st.bmT, mid) >= moment * Math.cos(mid)) hi = mid
    else lo = mid
  }
  return hi
}

/** 甲板边入水的横倾角：干舷比最宽处的半宽 */
export function deckEdgeAngle(cfg: ShipConfig, st: Stability): number {
  return Math.atan((cfg.hydro.depthM - st.draft) / ((cfg.hull.beamU / 2) * cfg.meterPerU))
}

/** 一列涌浪对船的激励：遭遇频率（弧度/秒）、横摇与纵摇的有效波面斜率幅值（弧度）、相位 */
export interface WaveTerm {
  readonly omega: number
  readonly roll: number
  readonly pitch: number
  readonly phase: number
}

const sinc = (q: number): number => (Math.abs(q) < 1e-6 ? 1 : Math.sin(q) / q)
/** 一段宽 2/q·k 的水线面对斜率的平均：3(sin q − q·cos q)/q³，长波时为 1 */
const lever = (q: number): number => (Math.abs(q) < 1e-3 ? 1 : (3 * (Math.sin(q) - q * Math.cos(q))) / q ** 3)

/**
 * 深水涌浪（k = ω²/g）的 Froude–Krylov 激励：波面斜率 k·H/2 按来向分到横向与纵向，
 * 船宽与船长上的相位差按矩形水线面平均，水压随深度按 exp(−k·T/2) 衰减；船速让遭遇频率变成 ω − k·U·cosβ
 */
export function waveTerms(cfg: ShipConfig, phases: readonly number[]): WaveTerm[] {
  const L = cfg.hull.lengthU * cfg.meterPerU
  const B = cfg.hull.beamU * cfg.meterPerU
  return cfg.sea.swells.map((w, i) => {
    const omega = (2 * Math.PI) / w.periodS
    const k = (omega * omega) / GRAVITY
    const beta = (w.towardDeg * Math.PI) / 180
    const slope = (k * w.heightM) / 2
    const depth = Math.exp((-k * cfg.hydro.draftM) / 2)
    const qx = (k * Math.cos(beta) * L) / 2
    const qy = (k * Math.sin(beta) * B) / 2
    return {
      omega: omega - k * cfg.sea.speedMs * Math.cos(beta),
      roll: slope * Math.sin(beta) * depth * lever(qy) * sinc(qx),
      pitch: slope * Math.cos(beta) * depth * lever(qx) * sinc(qy),
      phase: phases[i % phases.length]!,
    }
  })
}

/** 此刻的有效波面斜率，弧度：横摇（右舷往下为正）与纵摇（船头往下为正） */
export function waveSlope(terms: readonly WaveTerm[], t: number): { roll: number; pitch: number } {
  let roll = 0
  let pitch = 0
  for (const w of terms) {
    const s = Math.sin(w.omega * t + w.phase)
    roll += w.roll * s
    pitch += w.pitch * s
  }
  return { roll, pitch }
}

/** 横摇或纵摇的一个自由度：角度（弧度）与角速度 */
export interface Axis {
  angle: number
  rate: number
}

/**
 * 一个自由度的刚体运动 I·φ'' + b·φ' + Δ·g·GZ(φ) = M·cosφ + Δ·g·GM·α，四阶龙格–库塔推进 dt 秒：
 * I 含附加质量（千克·米²），b 是阻尼（牛·米·秒），M 是甲板上的重量对轴的力矩 g·Σm·y（牛·米），α 是有效波面斜率
 */
export function stepAxis(a: Axis, dt: number, inertia: number, damping: number, mass: number, gm: number, bm: number, moment: number, slope: number): void {
  const push = mass * GRAVITY * gm * slope
  const acc = (phi: number, w: number): number => (moment * Math.cos(phi) + push - damping * w - mass * GRAVITY * rightingArm(gm, bm, phi)) / inertia
  const p0 = a.angle
  const w0 = a.rate
  const k1p = w0
  const k1w = acc(p0, w0)
  const k2p = w0 + (k1w * dt) / 2
  const k2w = acc(p0 + (k1p * dt) / 2, k2p)
  const k3p = w0 + (k2w * dt) / 2
  const k3w = acc(p0 + (k2p * dt) / 2, k3p)
  const k4p = w0 + k3w * dt
  const k4w = acc(p0 + k3p * dt, k4p)
  a.angle = p0 + ((k1p + 2 * k2p + 2 * k3p + k4p) * dt) / 6
  a.rate = w0 + ((k1w + 2 * k2w + 2 * k3w + k4w) * dt) / 6
}
