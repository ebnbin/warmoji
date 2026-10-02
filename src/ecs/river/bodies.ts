import { UNIT } from '../../util/units'
import { approach } from '../systems/shared/body'
import type { BodyStep } from '../systems/shared/body'
import type { RiverConfig } from '../../types/maps'
import { GRAVITY } from './water'

/** 水的密度，千克/米³ */
const RHO = 1000
/** 打滑、倒下的身体按这么短的步长（秒）积分：轻的身体阻力很硬 */
const SUB_S = 0.004
/** 倒在水里的身体相对河床慢过这么多（米/秒）才站得起来 */
const RISE = 0.5
/** 重新踩稳、站起来要水的冲力与力矩在顶得住的这么多倍以内：比失稳时宽一点，免得在临界处来回跳 */
const STEADY = 0.8
/** 打滑的身体离想走的速度差到这么小（米/秒）以内才重新踩稳 */
const REGRIP = 0.15
/** 打滑时离想走的速度差不到这么多（米/秒），脚下的动摩擦按比例减小，免得来回抖 */
const CREEP = 0.05

/** 水里的身体的姿态：站稳了走、站着打滑、倒在水里 */
export const POSTURE = { walk: 0, slip: 1, down: 2 } as const
export type Posture = (typeof POSTURE)[keyof typeof POSTURE]

/** 一个身体的物理量，米与千克：身宽、身高、质量与体积 */
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

/** dragOn、swimDrag 算出的力，牛 */
let FX = 0
let FY = 0

/** 水对身体的力 F = c·|w − v|·(w − v)：c 是 ½ρ·Cd·迎水面积，w 是水速、v 是身体的速度，米/秒 */
function dragOn(c: number, wx: number, wy: number, vx: number, vy: number): void {
  const rx = wx - vx
  const ry = wy - vy
  const r = Math.sqrt(rx * rx + ry * ry)
  FX = c * r * rx
  FY = c * r * ry
}

/** 倒在水里朝 (ex, ey) 游：顺着身子迎水的系数是 head，横着是 side；不游时身子不定向，取两者的平均 */
function swimDrag(head: number, side: number, wx: number, wy: number, vx: number, vy: number, ex: number, ey: number, swimming: boolean): void {
  const rx = wx - vx
  const ry = wy - vy
  const r = Math.sqrt(rx * rx + ry * ry)
  if (!swimming) {
    const c = (head + side) / 2
    FX = c * r * rx
    FY = c * r * ry
    return
  }
  const along = rx * ex + ry * ey
  const across = ry * ex - rx * ey
  FX = r * (head * along * ex - side * across * ey)
  FY = r * (head * along * ey + side * across * ex)
}

/** 以速度 s 沿 (ex, ey) 走要的功率：走路本身的 m·a·s，加上顶着水在前进方向上的阻力做的功 */
function powerAt(ma: number, c: number, wx: number, wy: number, ex: number, ey: number, s: number): number {
  dragOn(c, wx, wy, s * ex, s * ey)
  return ma * s + Math.max(0, -(FX * ex + FY * ey)) * s
}

/** 站着赶路能走多快：恒定功率 P = m·a·V（a 是 gait，V 是平地上想走的速度），水里的阻力也要这份功率来顶，最多走到平地的速度 */
function pace(ma: number, c: number, wx: number, wy: number, ex: number, ey: number, V: number): number {
  if (powerAt(ma, c, wx, wy, ex, ey, V) <= ma * V) return V
  let lo = 0
  let hi = V
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2
    if (powerAt(ma, c, wx, wy, ex, ey, mid) <= ma * V) lo = mid
    else hi = mid
  }
  return lo
}

/**
 * 水深 depth 米、水速 (wx, wy) 米/秒 的地方半径 radius 像素、质量倍率 massMul 的身体的一步，姿态 posture；位置像素、速度像素/秒，(dx, dy) 是它想走的速度，
 * k 是它在平地上趋近想走的速度的快慢。返回这一步之后的姿态。
 * 站着：浮力按没进水里的那截身高占的比例托起身体，脚下的压力 N = mg − 浮力；胯以下迎水的是两条腿，胯以上是整个身宽。
 * 赶路的速度按恒定功率算；脚下的静摩擦顶得住水的冲力就照常走，顶不住就打滑：人还站着，脚下按动摩擦往想走的速度使劲，被水推着走，
 * 慢到跟想走的速度差不多、又顶得住水才重新踩稳。水的冲力绕脚掌的力矩大过 N 乘扶正力臂就被推倒，倒在水里：
 * 没进水里的是身体的厚那一截，浮力大、压力小，贴着河床滑或者干脆漂起来随水走；朝想走的方向游时身子顺着游的方向，迎水的只有身宽，
 * 横着被冲的是整个身长。慢到能站住、站着又顶得住水，才重新站起来
 */
export function wade(cfg: RiverConfig, out: BodyStep, radius: number, massMul: number, x: number, y: number, vx: number, vy: number, depth: number, wx: number, wy: number, dx: number, dy: number, k: number, traction: number, posture: Posture, dt: number): Posture {
  const toM = cfg.meterPerU / UNIT
  const bd = cfg.body
  const b = buildOf(cfg, radius, massMul)
  const weight = b.mass * GRAVITY
  const lift = RHO * GRAVITY * b.volume
  const V = Math.sqrt(dx * dx + dy * dy) * toM
  const ex = V > 0 ? (dx * toM) / V : 0
  const ey = V > 0 ? (dy * toM) / V : 0
  const stand = Math.min(depth, b.height)
  const upright = weight - lift * (stand / b.height)
  const hip = b.height * bd.hip
  const low = Math.min(stand, hip)
  const high = stand - low
  const legs = b.width * bd.legs * low
  const torso = b.width * high
  const cUp = 0.5 * RHO * bd.drag * (legs + torso)
  const arm = legs + torso > 0 ? (legs * low * 0.5 + torso * (hip + high * 0.5)) / (legs + torso) : 0
  const hold = bd.grip.static * traction * upright
  const right = upright * b.height * bd.lever
  let ux = vx * toM
  let uy = vy * toM
  const steps = Math.max(1, Math.ceil(dt / SUB_S))
  const h = dt / steps
  if (posture !== POSTURE.down && upright > 0) {
    dragOn(cUp, wx, wy, ux, uy)
    if (Math.sqrt(FX * FX + FY * FY) * arm > right) posture = POSTURE.down
  }
  if (posture !== POSTURE.down && upright > 0) {
    const s = V > 0 ? pace(b.mass * bd.gait, cUp, wx, wy, ex, ey, V) : 0
    const tx = s * ex
    const ty = s * ey
    dragOn(cUp, wx, wy, tx, ty)
    const need = FX * FX + FY * FY
    if (posture === POSTURE.walk && need <= hold * hold) {
      approach(out, x, y, vx, vy, tx / toM, ty / toM, k, dt)
      return POSTURE.walk
    }
    const kinetic = bd.grip.kinetic * traction * upright
    let px = x * toM
    let py = y * toM
    for (let i = 0; i < steps; i++) {
      dragOn(cUp, wx, wy, ux, uy)
      const gx = tx - ux
      const gy = ty - uy
      const g = kinetic / Math.max(CREEP, Math.sqrt(gx * gx + gy * gy))
      ux += ((FX + g * gx) / b.mass) * h
      uy += ((FY + g * gy) / b.mass) * h
      px += ux * h
      py += uy * h
    }
    out.x = px / toM
    out.y = py / toM
    out.vx = ux / toM
    out.vy = uy / toM
    const lag = (tx - ux) ** 2 + (ty - uy) ** 2
    return lag < REGRIP * REGRIP && need <= (hold * STEADY) ** 2 ? POSTURE.walk : POSTURE.slip
  }
  const thick = b.width * bd.chest
  const lie = Math.min(depth, thick)
  const normal = weight - lift * (lie / thick)
  const head = 0.5 * RHO * bd.drag * b.width * lie
  const side = 0.5 * RHO * bd.drag * b.height * lie
  const slide = normal > 0 ? (bd.grip.kinetic * traction * normal * h) / b.mass : 0
  const swim = V > 0 ? bd.swim * h : 0
  let px = x * toM
  let py = y * toM
  for (let i = 0; i < steps; i++) {
    swimDrag(head, side, wx, wy, ux, uy, ex, ey, V > 0)
    ux += (FX / b.mass) * h + ex * swim
    uy += (FY / b.mass) * h + ey * swim
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
  if (upright <= 0 || ux * ux + uy * uy > RISE * RISE) return POSTURE.down
  dragOn(cUp, wx, wy, 0, 0)
  const f = Math.sqrt(FX * FX + FY * FY)
  return f <= hold * STEADY && f * arm <= right * STEADY ? POSTURE.walk : POSTURE.down
}
