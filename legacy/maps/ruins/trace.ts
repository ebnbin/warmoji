import { passCost, probeZ, topOf } from '../../ecs/utils/pass'
import type { Crossing, Probe } from '../../ecs/utils/pass'
import type { ObstacleId } from '../../types/obstacles'
import type { Dust, Masonry } from './masonry'

/**
 * 局部线段 a→b（格，全长 lenM 米）上第一处探测在它里面、又要贯穿才过得去的实心：砌体与木板按探测在那一格的最低处比各自占到的那一层的顶，
 * 视线还按一路攒下的尘雾光学厚度，攒过 opaqueTau 就看不穿
 */
export function traceLocal(m: Masonry, dust: Dust | null, opaqueTau: number, p: Probe, ua: number, va: number, ub: number, vb: number, lenM: number): Crossing | null {
  const g = m.grid
  const x0 = (ua - g.u0) / g.cell
  const y0 = (va - g.v0) / g.cell
  const dx = (ub - g.u0) / g.cell - x0
  const dy = (vb - g.v0) / g.cell - y0
  if (Math.max(x0, x0 + dx) < 0 || Math.max(y0, y0 + dy) < 0 || Math.min(x0, x0 + dx) >= g.cols || Math.min(y0, y0 + dy) >= g.rows) return null
  const hc = m.courseM
  const top = (n: number): number => topOf(n * hc)
  const sight = p.via === 'sight' && dust !== null
  let ix = Math.floor(x0)
  let iy = Math.floor(y0)
  const sx = dx > 0 ? 1 : -1
  const sy = dy > 0 ? 1 : -1
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity
  let tx = dx !== 0 ? (dx > 0 ? ix + 1 - x0 : x0 - ix) * tdx : Infinity
  let ty = dy !== 0 ? (dy > 0 ? iy + 1 - y0 : y0 - iy) * tdy : Infinity
  let t = 0
  let tau = 0
  let start = 0
  let mat: ObstacleId | null = null
  for (let k = 0; k < 8192; k++) {
    const t1 = Math.min(tx, ty, 1)
    let here: ObstacleId | null = null
    if (ix >= 0 && iy >= 0 && ix < g.cols && iy < g.rows) {
      const idx = iy * g.cols + ix
      const z = Math.min(probeZ(p, t), probeZ(p, t1))
      if (top(m.n[idx]!) > z) here = 'masonry'
      else if (top(m.timber[idx]!) > z) here = 'timber'
      else if (sight) {
        tau += dust.sigma[(iy >> 1) * dust.cols + (ix >> 1)]! * (t1 - t) * lenM
        if (tau >= opaqueTau) here = 'dust'
      }
      if (here !== null && passCost(p, here) <= 0) here = null
    }
    if (here !== mat) {
      if (mat !== null) return { t0: start, t1: t, material: mat }
      start = t
      mat = here
    }
    if (t1 >= 1) break
    t = t1
    if (tx < ty) {
      tx += tdx
      ix += sx
    } else {
      ty += tdy
      iy += sy
    }
  }
  return mat !== null ? { t0: start, t1: 1, material: mat } : null
}
