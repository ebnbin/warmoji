import { UNIT } from '../../util/units'
import { shellPull } from '../../data/nebulaOld'
import type { NebulaOldConfig } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { Rng } from '../../util/rng'

/** 黑洞的位置：离星云中心 fromCenterU 之间、方向随机 */
export function holeAt(rng: Rng, cfg: NebulaOldConfig): Point {
  const [near, far] = cfg.hole.fromCenterU
  const r = (near + rng.next() * (far - near)) * UNIT
  const a = rng.next() * Math.PI * 2
  return { x: Math.cos(a) * r, y: Math.sin(a) * r }
}

/** 黑洞与壳层的引力相加，像素/秒²：黑洞按普卢默软化的 g = GM·d/(|d|²+ε²)^{3/2} 指向黑洞，壳层指向星云中心 */
export function gravity(hole: Point, cfg: NebulaOldConfig, x: number, y: number): Point {
  const dx = (hole.x - x) / UNIT
  const dy = (hole.y - y) / UNIT
  const eps = cfg.hole.softeningU
  const s = dx * dx + dy * dy + eps * eps
  const k = (cfg.hole.gm / (s * Math.sqrt(s))) * UNIT
  const r = Math.hypot(x, y)
  const w = r > cfg.shell.innerU * UNIT ? (shellPull(cfg.shell, r / UNIT) * UNIT) / r : 0
  return { x: dx * k - x * w, y: dy * k - y * w }
}

/** 离黑洞 rU 格处黑洞的引力大小，格/秒² */
function holePull(cfg: NebulaOldConfig, rU: number): number {
  const eps = cfg.hole.softeningU
  const s = rU * rU + eps * eps
  return (cfg.hole.gm * rU) / (s * Math.sqrt(s))
}

export function inHorizon(hole: Point, cfg: NebulaOldConfig, x: number, y: number): boolean {
  const r = cfg.hole.horizonU * UNIT
  return (x - hole.x) ** 2 + (y - hole.y) ** 2 < r * r
}

/**
 * 走路逃不出黑洞的半径（格）：终端漂移 g·fall 等于自己最快的速度 speedU 的地方，fall 是身体的质量除以阻力。
 * 视界外引力随距离单调减小，二分即可；视界处都追不上就只剩视界本身。
 */
export function captureRadiusU(cfg: NebulaOldConfig, fall: number, speedU: number, maxU: number): number {
  const lo0 = cfg.hole.horizonU
  if (holePull(cfg, lo0) * fall <= speedU) return lo0
  let lo = lo0
  let hi = maxU
  if (holePull(cfg, hi) * fall >= speedU) return hi
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (holePull(cfg, mid) * fall > speedU) lo = mid
    else hi = mid
  }
  return lo
}

/** 流星的起点：从瞄准点逆着单位方向 (dx, dy) 退到壳层内壁上，瞄准点先收进空腔 */
export function meteorStart(cfg: NebulaOldConfig, ax: number, ay: number, dx: number, dy: number): Point {
  const wall = cfg.shell.innerU * UNIT
  const lim = wall - cfg.meteor.radiusU * UNIT
  const r = Math.hypot(ax, ay)
  const px = r > lim ? (ax / r) * lim : ax
  const py = r > lim ? (ay / r) * lim : ay
  const pd = px * dx + py * dy
  const t = pd + Math.sqrt(pd * pd - px * px - py * py + wall * wall)
  return { x: px - dx * t, y: py - dy * t }
}

/** 流星在引力下的轨迹：速度韦尔莱积分，按 stepMs 采样的 x、y 交替数组；进了视界、扎回壳层烧毁或到了时限就停 */
export function meteorTrajectory(hole: Point, cfg: NebulaOldConfig, sx: number, sy: number, vx0: number, vy0: number): Float32Array {
  const m = cfg.meteor
  const h = m.stepMs / 1000
  const wall = cfg.shell.innerU * UNIT
  const out: number[] = [sx, sy]
  let x = sx
  let y = sy
  let vx = vx0
  let vy = vy0
  let a = gravity(hole, cfg, x, y)
  for (let t = m.stepMs; t <= m.maxFlightMs; t += m.stepMs) {
    x += vx * h + 0.5 * a.x * h * h
    y += vy * h + 0.5 * a.y * h * h
    const b = gravity(hole, cfg, x, y)
    vx += 0.5 * (a.x + b.x) * h
    vy += 0.5 * (a.y + b.y) * h
    a = b
    out.push(x, y)
    if (inHorizon(hole, cfg, x, y)) break
    if (Math.hypot(x, y) > wall && x * vx + y * vy > 0) break
  }
  return Float32Array.from(out)
}
