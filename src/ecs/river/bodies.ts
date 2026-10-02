import { UNIT } from '../../util/units'
import { approach } from '../systems/shared/body'
import type { BodyStep } from '../systems/shared/body'
import type { RiverConfig } from '../../types/maps'
import { GRAVITY } from './water'

/** 水的密度，千克/米³ */
const RHO = 1000
/** 倒下的身体按这么短的步长（秒）积分：轻的身体阻力很硬 */
const SUB_S = 0.004
/** 倒在水里的身体跟站着时该有的速度差到这么小（米/秒）以内才站得起来 */
const RISE = 0.5
/** 站起来要水的力矩在推得倒的这么多倍以内：比推倒时宽一点，免得在临界处一倒一起 */
const STEADY = 0.8

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

/** swimDrag 算出的力，牛 */
let FX = 0
let FY = 0

/**
 * 倒在水里的身体受水的力 F = c·|w − v|·(w − v)，w 是水速、v 是身体的速度，米/秒：
 * 朝 (ex, ey) 游时顺着身子的 c 是 head，横着的是 side；不游时身子不定向，取两者的平均
 */
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

/**
 * 水深 depth 米、水速 (wx, wy) 米/秒 的地方半径 radius 像素、质量倍率 massMul 的身体的一步；位置像素、速度像素/秒，(dx, dy) 是它想走的速度，
 * k 是它在平地上趋近想走的速度的快慢。返回这一步之后是否倒在水里。
 * 站着：浮力按没进水里的那截身高占的比例托起身体，脚下的压力 N = mg − 浮力；水的推力 ½ρ·Cd·迎水面积·w²，胯以下迎水的是两条腿，胯以上是整个身宽。
 * 水带着人走：带走的比例 = 推力 ÷（推力 + 摩擦系数 × N），水浅推力小、几乎带不动，又深又急、浮力还托着人，带得多；
 * 自己走的速度只按水深慢下来，跟水往哪流无关，所以站着不动也被冲着走，顺流快、逆流慢。
 * 推力绕脚掌的力矩大过 N 乘扶正力臂就被推倒，倒在水里：没进水里的是身体的厚那一截，浮力大、压力小，贴着河床滑或者干脆漂起来随水走；
 * 朝想走的方向游时身子顺着游的方向，迎水的只有身宽，横着被冲的是整个身长。速度跟站着时该有的差不多、站着又推不倒，才重新站起来
 */
export function wade(cfg: RiverConfig, out: BodyStep, radius: number, massMul: number, x: number, y: number, vx: number, vy: number, depth: number, wx: number, wy: number, dx: number, dy: number, k: number, traction: number, down: boolean, dt: number): boolean {
  const toM = cfg.meterPerU / UNIT
  const bd = cfg.body
  const b = buildOf(cfg, radius, massMul)
  const weight = b.mass * GRAVITY
  const lift = RHO * GRAVITY * b.volume
  const stand = Math.min(depth, b.height)
  const upright = weight - lift * (stand / b.height)
  const hip = b.height * bd.hip
  const low = Math.min(stand, hip)
  const high = stand - low
  const legs = b.width * bd.legs * low
  const torso = b.width * high
  const push = 0.5 * RHO * bd.drag * (legs + torso) * (wx * wx + wy * wy)
  const arm = legs + torso > 0 ? (legs * low * 0.5 + torso * (hip + high * 0.5)) / (legs + torso) : 0
  const right = upright * b.height * bd.lever
  const carry = push > 0 ? push / (push + bd.grip * traction * Math.max(0, upright)) : 0
  if (!down && upright > 0 && push * arm <= right) {
    const pace = 1 - bd.wade * (low / hip)
    approach(out, x, y, vx, vy, (carry * wx) / toM + dx * pace, (carry * wy) / toM + dy * pace, k, dt)
    return false
  }
  const V = Math.sqrt(dx * dx + dy * dy) * toM
  const ex = V > 0 ? (dx * toM) / V : 0
  const ey = V > 0 ? (dy * toM) / V : 0
  const thick = b.width * bd.chest
  const lie = Math.min(depth, thick)
  const normal = weight - lift * (lie / thick)
  const head = 0.5 * RHO * bd.drag * b.width * lie
  const side = 0.5 * RHO * bd.drag * b.height * lie
  const steps = Math.max(1, Math.ceil(dt / SUB_S))
  const h = dt / steps
  const slide = normal > 0 ? (bd.grip * traction * normal * h) / b.mass : 0
  const swim = V > 0 ? bd.swim * h : 0
  let ux = vx * toM
  let uy = vy * toM
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
  const rx = ux - carry * wx
  const ry = uy - carry * wy
  return upright <= 0 || rx * rx + ry * ry > RISE * RISE || push * arm > right * STEADY
}
