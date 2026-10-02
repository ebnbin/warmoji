import { UNIT } from '../../util/units'
import { approach } from '../systems/shared/body'
import type { BodyStep } from '../systems/shared/body'
import type { RiverConfig } from '../../types/maps'
import { GRAVITY } from './water'

/** 水的密度，千克/米³ */
const RHO = 1000
/** 正在游的身体要水的力矩降到推得倒的这么多倍以内才站得住：比站不住时宽一点，免得在临界处一漂一站 */
const STEADY = 0.8

/**
 * 水深 depth 米、水速 (wx, wy) 米/秒 的地方，半径 radius 像素、质量倍率 massMul 的身体站不站得住：质量按半径的三次方与质量倍率缩放，身高按半径缩放，体积按密度；
 * 浮力按没进水里的那截身高占的比例托起身体，脚下的压力 N = mg − 浮力；水的推力 ½ρ·Cd·迎水面积·w²，胯以下迎水的是两条腿，胯以上是整个身宽。
 * 浮起来了，或者推力绕脚掌的力矩大过 N 乘扶正力臂，就站不住；正在游的 swimming 要力矩降到 STEADY 倍以内才重新站得住
 */
export function swept(cfg: RiverConfig, radius: number, massMul: number, depth: number, wx: number, wy: number, swimming: boolean): boolean {
  const b = cfg.body
  const k = radius / UNIT / b.radiusU
  const mass = b.kg * massMul * k ** 3
  const width = (2 * radius * cfg.meterPerU) / UNIT
  const height = b.heightM * k
  const stand = Math.min(depth, height)
  const upright = mass * GRAVITY * (1 - (RHO / b.density) * (stand / height))
  if (upright <= 0) return true
  const hip = height * b.hip
  const low = Math.min(stand, hip)
  const high = stand - low
  const legs = width * b.legs * low
  const torso = width * high
  const push = 0.5 * RHO * b.drag * (legs + torso) * (wx * wx + wy * wy)
  const arm = (legs * low * 0.5 + torso * (hip + high * 0.5)) / (legs + torso)
  return push * arm > upright * height * b.lever * (swimming ? STEADY : 1)
}

/** 随水漂：位置像素、速度像素/秒，速度以快慢 k 趋近水速 (wx, wy)（米/秒）加上自己相对水的速度 (dx, dy)（像素/秒） */
export function drift(cfg: RiverConfig, out: BodyStep, x: number, y: number, vx: number, vy: number, wx: number, wy: number, dx: number, dy: number, k: number, dt: number): void {
  const toPx = UNIT / cfg.meterPerU
  approach(out, x, y, vx, vy, wx * toPx + dx, wy * toPx + dy, k, dt)
}
