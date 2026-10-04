import { UNIT } from '../../util/units'
import { roomAt } from '../worlds/basin'
import type { Basin } from '../worlds/basin'
import type { Landmark } from '../worlds/gates'
import type { RiverConfig } from '../../types/maps'
import type { Reach } from './channel'
import type { RiverPlan } from './layout'

/** 岸上的口子沿河每隔这么远一处、口子的半径，格 */
const BANK_STEP_U = 3.5
const BANK_R_U = 1
/** 岸上的口子往岸上这么远处还要是能走的地面，格 */
const SHORE_U = 1.5
/** 离断崖边这么近的岸不摆口子：那里水急、岸是崖沿，格 */
const LIP_CLEAR_U = 4
/** 深泓上的口子沿河每隔这么远一处，口子的半径占水面半宽的比例 */
const DEEP_STEP_U = 5
const DEEP_R = 0.35
/** 崖沿上的口子离断崖边上的水面多远、口子的半径，格 */
const RIM_OFF_U = 1.5
const RIM_R_U = 0.8

/** 一段河道上每隔 step 格取一点的下标，从半步处起，弧长不到 from 的不要 */
function every(r: Reach, step: number, from: number): number[] {
  const out: number[] = []
  let next = Math.max(from, step / 2)
  for (let i = 0; i < r.s.length; i++) {
    if (r.s[i]! < next) continue
    out.push(i)
    next = r.s[i]! + step
  }
  return out
}

/**
 * 一段河道两岸的水边，像素，朝岸上：沿河每隔一段一处，弧长不到 from 格的、skip（格）说不要的、往岸上走不出一段能走的地面的不摆
 */
export function bankMarks(r: Reach, basin: Basin, from: number, skip: (x: number, y: number) => boolean): Landmark[] {
  const out: Landmark[] = []
  for (const i of every(r, BANK_STEP_U, from)) {
    for (const side of [1, -1]) {
      const nx = -r.ty[i]! * side
      const ny = r.tx[i]! * side
      const x = r.x[i]! + nx * r.half[i]!
      const y = r.y[i]! + ny * r.half[i]!
      if (skip(x, y) || roomAt(basin, (x + nx * SHORE_U) * UNIT, (y + ny * SHORE_U) * UNIT) < 0.5 * UNIT) continue
      out.push({ x: x * UNIT, y: y * UNIT, r: BANK_R_U * UNIT, nx, ny })
    }
  }
  return out
}

/**
 * 河流的地标，像素，按地图一次定下：ports 是瀑布下的深潭与两个断崖边（林子里的口子躲开它们）；bank 是两岸的水边，朝岸上；
 * falls 是瀑布顶；mist 是两个断崖边两侧的崖沿，朝空地里；deep 是河道的深泓
 */
export function riverMarks(cfg: RiverConfig, plan: RiverPlan): Record<string, Landmark[]> {
  const inlet = plan.inlet
  const ports: Landmark[] = [
    { x: inlet.poolX * UNIT, y: inlet.poolY * UNIT, r: 0, nx: inlet.nx, ny: inlet.ny },
    ...plan.outlets.map((o) => ({ x: o.x * UNIT, y: o.y * UNIT, r: 0, nx: -o.nx, ny: -o.ny })),
  ]
  const nearLip = (x: number, y: number): boolean => plan.outlets.some((o) => Math.hypot(x - o.x, y - o.y) < o.half + LIP_CLEAR_U)
  const bank: Landmark[] = []
  const deep: Landmark[] = []
  plan.reaches.forEach((r, k) => {
    // 主河道从深潭中心起，潭里没有岸
    bank.push(...bankMarks(r, plan.basin, k === 0 ? inlet.poolR + 1 : 0, nearLip))
    for (const i of every(r, DEEP_STEP_U, 0)) {
      const off = r.shift[i]! * r.half[i]!
      const x = r.x[i]! - r.ty[i]! * off
      const y = r.y[i]! + r.tx[i]! * off
      if (nearLip(x, y)) continue
      deep.push({ x: x * UNIT, y: y * UNIT, r: r.half[i]! * DEEP_R * UNIT, nx: 0, ny: 0 })
    }
  })
  const falls: Landmark[] = [{ x: (inlet.x - inlet.nx * cfg.falls.cliffU) * UNIT, y: (inlet.y - inlet.ny * cfg.falls.cliffU) * UNIT, r: 0, nx: inlet.nx, ny: inlet.ny }]
  const mist: Landmark[] = plan.outlets.flatMap((o) =>
    [1, -1].map((side) => ({
      x: (o.x - o.ny * side * (o.half + RIM_OFF_U)) * UNIT,
      y: (o.y + o.nx * side * (o.half + RIM_OFF_U)) * UNIT,
      r: RIM_R_U * UNIT,
      nx: -o.nx,
      ny: -o.ny,
    })),
  )
  return { ports, bank, falls, mist, deep }
}
