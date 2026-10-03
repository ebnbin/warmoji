import type { DesertConfig } from '../../types/maps'

/** Minetti 曲线在平地上的值：硬地上平地走一米每千克耗多少焦耳 */
const FLAT_COST = 2.5
/** Minetti 曲线只在这个坡度（正切）以内可信，更陡的按它算 */
const STEEPEST = 0.45
/** 再省力也省不过平地的这么多成：下陡坡要刹着走 */
const LEAST = 0.2

/**
 * Minetti 等（2002）测出的走路代谢：每千克每走一米耗多少焦耳，随坡度 i（上坡为正）按五次多项式变；
 * 平地 2.5，下坡约 10% 时最省，再陡又要刹着走、费起来
 */
export function walkCost(i: number): number {
  const g = i < -STEEPEST ? -STEEPEST : i > STEEPEST ? STEEPEST : i
  return ((((280.5 * g - 58.7) * g - 76.8) * g + 51.9) * g + 19.6) * g + 2.5
}

/** 走这一步要出几倍于平地硬地的力，以及按这份力能走出平时几倍的速度 */
export interface Pace {
  demand: number
  speed: number
}

/**
 * 在坡度 i、松软 loose（1 是松沙）、踩实 pack 的沙上，顺着风的加速度 tail（米/秒²，顶风为负）朝前走：
 * 每米的代谢按坡度、沙的松软与顶风多做的功算，折成平地硬地的倍数 demand；
 * 要出的力不超过 maxPower 倍就照常速度走、只是更累，超过了就按 maxPower 倍的力走慢；省力时（下坡、顺风）走得快一些，最多 downhillMax 倍
 */
export function paceOf(g: DesertConfig['gait'], i: number, loose: number, pack: number, tail: number, out: Pace): Pace {
  const sand = 1 + (g.softSand - 1) * loose * (1 - g.packRelief * pack)
  const wind = tail < 0 ? -tail / g.efficiency : (-g.tailRelief * tail) / g.efficiency
  const demand = Math.max(LEAST, (walkCost(i) * sand + wind) / FLAT_COST)
  out.demand = demand
  out.speed = demand <= 1 ? Math.min(g.downhillMax, 1 / demand) : demand <= g.maxPower ? 1 : g.maxPower / demand
  return out
}

/**
 * 风拖着一个身体的加速度沿前进方向的分量，米/秒²：½·ρ·(Cd·A/m)·|w − v|·(w − v) 点乘前进方向；
 * Cd·A/m 按标准身体的值除以 bulk（半径与质量倍率相对标准身体的倍数：迎风面按半径平方、质量按半径立方）
 */
export function windAlong(w: DesertConfig['wind'], speed: number, angle: number, vx: number, vy: number, bulk: number): number {
  const rx = Math.cos(angle) * speed - vx
  const ry = Math.sin(angle) * speed - vy
  const len = Math.hypot(vx, vy)
  if (len < 1e-6) return 0
  const k = (0.5 * w.airDensity * w.dragArea * Math.hypot(rx, ry)) / bulk
  return (k * (rx * vx + ry * vy)) / len
}
