import { UNIT } from '../../util/units'
import { approach } from '../systems/shared/body'
import type { BodyStep } from '../systems/shared/body'
import type { RiverConfig } from '../../types/maps'
import { GRAVITY } from './water'

/** 水的密度，千克/米³ */
const RHO = 1000
/** 被冲着走的身体按这么短的步长（秒）积分：轻的身体阻力很硬 */
const SUB_S = 0.004
/** 倒在水里的身体相对河床慢过这么多（米/秒）才站得起来 */
const RISE = 0.5
/** 站起来要水的冲力在静摩擦的这么多倍以内：比冲倒时宽一点，免得在临界处一倒一起 */
const STEADY = 0.8

/** 一个身体的物理量，米与千克：迎水的宽、身高、质量与体积 */
interface Build {
  width: number
  height: number
  mass: number
  volume: number
}

const BUILD: Build = { width: 0, height: 0, mass: 0, volume: 0 }

/** 半径 radius 像素、质量倍率 massMul 的身体：质量按半径的三次方与质量倍率缩放，身高按半径缩放，体积按密度 */
function buildOf(cfg: RiverConfig, radius: number, massMul: number): Build {
  const b = cfg.body
  const k = radius / UNIT / b.radiusU
  BUILD.mass = b.kg * massMul * k ** 3
  BUILD.width = (2 * radius * cfg.meterPerU) / UNIT
  BUILD.height = b.heightM * k
  BUILD.volume = BUILD.mass / b.density
  return BUILD
}

/** dragOn 算出的力，牛 */
let FX = 0
let FY = 0

/** 水对身体的力 F = ½ρ·Cd·(宽 × 没进水里的高)·|w − v|·(w − v)：c 是 ½ρ·Cd·迎水面积，w 是水速、v 是身体的速度，米/秒 */
function dragOn(c: number, wx: number, wy: number, vx: number, vy: number): void {
  const rx = wx - vx
  const ry = wy - vy
  const r = Math.sqrt(rx * rx + ry * ry)
  FX = c * r * rx
  FY = c * r * ry
}

const TARGET = { x: 0, y: 0 }

/**
 * 站在水里的身体能走多快：赶路按恒定功率 P = m·a·V（a 是 gait，V 是平地上想走的速度），
 * 水在前进方向上的阻力也要这份功率来顶，最多走到平地的速度；脚下的静摩擦 μ·N 要顶得住水的冲力，顶不住就放慢，
 * 慢到站着不动也顶不住就返回 false（站不稳了）
 */
function stride(cfg: RiverConfig, b: Build, c: number, hold: number, wx: number, wy: number, dx: number, dy: number): boolean {
  const V = Math.sqrt(dx * dx + dy * dy)
  if (V < 1e-6) {
    dragOn(c, wx, wy, 0, 0)
    TARGET.x = 0
    TARGET.y = 0
    return FX * FX + FY * FY <= hold * hold
  }
  const ex = dx / V
  const ey = dy / V
  const ma = b.mass * cfg.body.gait
  const power = (s: number): number => {
    dragOn(c, wx, wy, s * ex, s * ey)
    return ma * s + Math.max(0, -(FX * ex + FY * ey)) * s
  }
  let s = V
  if (power(V) > ma * V) {
    let lo = 0
    let hi = V
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2
      if (power(mid) <= ma * V) lo = mid
      else hi = mid
    }
    s = lo
  }
  for (let k = 0; k <= 16; k++) {
    const t = s * (1 - k / 16)
    dragOn(c, wx, wy, t * ex, t * ey)
    if (FX * FX + FY * FY > hold * hold) continue
    TARGET.x = t * ex
    TARGET.y = t * ey
    return true
  }
  return false
}

/**
 * 水深 depth 米、水速 (wx, wy) 米/秒 的地方半径 radius 像素、质量倍率 massMul 的身体的一步；位置像素、速度像素/秒，(dx, dy) 是它想走的速度，k 是它在平地上趋近想走的速度的快慢。
 * 站着时浮力按没进水里的那截身高占的比例托起身体，脚下的压力 N = mg − 浮力：顶得住水的冲力就照常赶路，只是速度换成水里走得到的；
 * 顶不住就被冲倒，躺在水里：没进水里的是身体的厚（取迎水的宽）那一截，迎水的是整个身长，浮力大、压力小，贴着河床滑或者干脆漂起来随水走，
 * 往想走的方向划水；慢到能站住、站着又顶得住水，才重新站起来。返回这一步之后是否还倒在水里
 */
export function wade(cfg: RiverConfig, out: BodyStep, radius: number, massMul: number, x: number, y: number, vx: number, vy: number, depth: number, wx: number, wy: number, dx: number, dy: number, k: number, traction: number, down: boolean, dt: number): boolean {
  const toM = cfg.meterPerU / UNIT
  const b = buildOf(cfg, radius, massMul)
  const grip = cfg.body.grip
  const weight = b.mass * GRAVITY
  const lift = RHO * GRAVITY * b.volume
  const stand = Math.min(depth, b.height)
  const upright = weight - lift * (stand / b.height)
  const cUp = 0.5 * RHO * cfg.body.drag * b.width * stand
  const hold = grip.static * traction * upright
  if (!down && upright > 0 && stride(cfg, b, cUp, hold, wx, wy, dx * toM, dy * toM)) {
    approach(out, x, y, vx, vy, TARGET.x / toM, TARGET.y / toM, k, dt)
    return false
  }
  const lie = Math.min(depth, b.width)
  const normal = weight - lift * (lie / b.width)
  const c = 0.5 * RHO * cfg.body.drag * b.height * lie
  const steps = Math.max(1, Math.ceil(dt / SUB_S))
  const h = dt / steps
  const slide = normal > 0 ? (grip.kinetic * traction * normal * h) / b.mass : 0
  const V = Math.sqrt(dx * dx + dy * dy)
  const swim = V > 0 ? (cfg.body.swim * h) / V : 0
  let px = x * toM
  let py = y * toM
  let ux = vx * toM
  let uy = vy * toM
  for (let i = 0; i < steps; i++) {
    dragOn(c, wx, wy, ux, uy)
    ux += (FX / b.mass) * h + dx * swim
    uy += (FY / b.mass) * h + dy * swim
    if (slide > 0) {
      const sp = Math.sqrt(ux * ux + uy * uy)
      if (sp <= slide) {
        ux = 0
        uy = 0
      } else {
        ux -= (slide * ux) / sp
        uy -= (slide * uy) / sp
      }
    }
    px += ux * h
    py += uy * h
  }
  out.x = px / toM
  out.y = py / toM
  out.vx = ux / toM
  out.vy = uy / toM
  if (upright <= 0 || ux * ux + uy * uy > RISE * RISE) return true
  dragOn(cUp, wx, wy, 0, 0)
  return FX * FX + FY * FY > (hold * STEADY) ** 2
}
