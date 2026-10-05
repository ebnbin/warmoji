import { UNIT } from '../../util/units'
import { roomAt } from '../basin'
import { bankWidth, footAt, toMap } from './layout'
import type { MeadowPlan } from './layout'
import type { Landmark } from '../landmark'

/** 沿坡脚与栅栏每隔这么远记一处，格 */
const LINE_STEP_U = 0.5
/** 离能走的地面边这么近的才记，格：坡脚、栅栏伸进林子的那段不算 */
const LINE_NEAR_U = 0.6
/** 倒木的口子在凹槽尽头往外这么远，格 */
const LOG_BACK_U = 0.5
/** 一档栅栏前、坡脚前要有这么远的草地才摆口子，格 */
const FRONT_U = 1.2
const FOOT_FRONT_U = 0.95
/** 坡顶的口子沿坡每隔这么远一处、在坡顶往外多远，格 */
const BANK_STEP_U = 3.5
const BANK_BACK_U = 0.5

/**
 * 草甸的地标，像素，按地图一次定下：bare 是坡脚、栅栏一线与林间小路的路口（林子里的口子躲开它们）；
 * log 是堵着小路的倒木，朝草地；fence 是每一档栅栏的正中，朝草地；bank 是陡坡顶上，朝草地
 */
export function meadowMarks(plan: MeadowPlan): Record<string, Landmark[]> {
  const f = plan.frame
  const e = plan.edges
  const S = plan.size
  const px = (p: { x: number; y: number }, r: number, nx: number, ny: number): Landmark => ({ x: p.x * UNIT, y: p.y * UNIT, r, nx, ny })
  const near = (p: { x: number; y: number }): boolean => roomAt(plan.basin, p.x * UNIT, p.y * UNIT) > -LINE_NEAR_U * UNIT
  const room = (x: number, y: number): number => roomAt(plan.basin, x * UNIT, y * UNIT)
  const bare: Landmark[] = []
  for (let b = 0; b <= S; b += LINE_STEP_U) {
    const p = toMap(f, footAt(e, b), b)
    if (near(p)) bare.push(px(p, 0, 0, 0))
  }
  plan.posts.forEach((p, i) => {
    const q = plan.posts[i + 1]
    if (!q) return
    const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / LINE_STEP_U))
    for (let k = 0; k < n; k++) {
      const m = { x: p.x + ((q.x - p.x) * k) / n, y: p.y + ((q.y - p.y) * k) / n }
      if (near(m)) bare.push(px(m, 0, 0, 0))
    }
  })
  const n = e.notch
  bare.push(px(toMap(f, n.a, n.b), 0, 0, 0))
  // 进林子的方向换到地图上，口子朝它的反方向
  const ix = f.nx * n.ua + f.tx * n.ub
  const iy = f.ny * n.ua + f.ty * n.ub
  const log = [px(toMap(f, n.a + n.ua * (n.depth - LOG_BACK_U), n.b + n.ub * (n.depth - LOG_BACK_U)), n.half * UNIT, -ix, -iy)]
  const fence: Landmark[] = []
  plan.posts.forEach((p, i) => {
    const q = plan.posts[i + 1]
    if (!q) return
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1
    let nx = -(q.y - p.y) / len
    let ny = (q.x - p.x) / len
    if (nx * plan.gate.ox + ny * plan.gate.oy > 0) {
      nx = -nx
      ny = -ny
    }
    const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
    if (room(m.x + nx * FRONT_U, m.y + ny * FRONT_U) >= 0.5 * UNIT) fence.push(px(m, 0, nx, ny))
  })
  const bank: Landmark[] = []
  for (let b = BANK_STEP_U / 2; b <= S; b += BANK_STEP_U) {
    const foot = footAt(e, b)
    const front = toMap(f, foot + FOOT_FRONT_U, b)
    if (room(front.x, front.y) < 0.5 * UNIT) continue
    bank.push(px(toMap(f, foot - bankWidth(e, b) - BANK_BACK_U, b), 0, f.nx, f.ny))
  }
  return { bare, log, fence, bank }
}
