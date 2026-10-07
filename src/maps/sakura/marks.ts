import { UNIT } from '../../util/units'
import { roomAt } from '../basin'
import { bridgeLocal, ROCK_FACE_U, weirLocal } from './layout'
import type { Reach } from './channel'
import type { SakuraPlan } from './layout'
import type { SakuraConfig } from '../../types/maps'
import type { Basin } from '../basin'
import type { Landmark } from '../landmark'

/** 岸上的口子沿河每隔这么远一处、口子的半径，格 */
const BANK_STEP_U = 3.5
const BANK_R_U = 1
/** 岸上的口子往岸上这么远处还要是能走的地面，格 */
const SHORE_U = 1.5
/** 沿墙、沿石组与竹栅那两条线每隔这么远记一处，格 */
const LINE_STEP_U = 1
/** 寺墙上的口子离墙头多远起、每隔多远一处，在墙面外多远，面前要有多远的空地，格 */
const WALL_FROM_U = 1.5
const WALL_STEP_U = 3
const WALL_OFF_U = 0.15
const WALL_FRONT_U = 1.5
/** 顺着溪离桥这么近的岸不摆口子：爬上来会被当成上了桥，格 */
const BRIDGE_CLEAR_U = 1.5
/** 巨鳄翻进溪的口子在石头那一面下游多远，格 */
const ROCKS_OFF_U = 0.5

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
function bankMarks(r: Reach, basin: Basin, from: number, skip: (x: number, y: number) => boolean): Landmark[] {
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
 * 樱花的地标，像素，按地图一次定下：ports 是寺墙、上游石组与下游竹栅一线（林子里的口子躲开它们）；wall 是寺墙朝空地的那一面，
 * bank 是溪两岸的水边（石槛与桥两边不摆），都朝空地；rocks 是石组下游那一面，朝下游；bridge 是桥面正中
 */
export function sakuraMarks(cfg: SakuraConfig, plan: SakuraPlan): Record<string, Landmark[]> {
  const at = (x: number, y: number, r: number, nx: number, ny: number): Landmark => ({ x: x * UNIT, y: y * UNIT, r: r * UNIT, nx, ny })
  const ports: Landmark[] = []
  for (const w of plan.walls) {
    const n = Math.max(1, Math.ceil(w.len / LINE_STEP_U))
    for (let k = 0; k <= n; k++) ports.push(at(w.ax + ((w.bx - w.ax) * k) / n, w.ay + ((w.by - w.ay) * k) / n, 0, 0, 0))
  }
  for (const line of [plan.rocks, plan.fence]) {
    for (let u = -line.span; u <= line.span; u += LINE_STEP_U) ports.push(at(line.x - line.ty * u, line.y + line.tx * u, 0, 0, 0))
  }
  const th = cfg.wall.thickU / 2
  const wall: Landmark[] = []
  for (const w of plan.walls) {
    for (let s = WALL_FROM_U; s <= w.len - WALL_FROM_U; s += WALL_STEP_U) {
      const t = s / w.len
      const x = w.ax + (w.bx - w.ax) * t + w.nx * (th + WALL_OFF_U)
      const y = w.ay + (w.by - w.ay) * t + w.ny * (th + WALL_OFF_U)
      if (roomAt(plan.basin, (x + w.nx * WALL_FRONT_U) * UNIT, (y + w.ny * WALL_FRONT_U) * UNIT) < 0.5 * UNIT) continue
      wall.push(at(x, y, 1, w.nx, w.ny))
    }
  }
  const b = plan.bridge
  const bank = bankMarks(plan.stream, plan.basin, 0, (x, y) => weirLocal(plan.weir, x, y).along > -cfg.sill.rampU || Math.abs(bridgeLocal(b, x, y).t) < b.width + BRIDGE_CLEAR_U)
  const rk = plan.rocks
  const rocks = [at(rk.x + rk.tx * (ROCK_FACE_U + ROCKS_OFF_U), rk.y + rk.ty * (ROCK_FACE_U + ROCKS_OFF_U), 0, rk.tx, rk.ty)]
  return { ports, wall, bank, rocks, bridge: [at(b.x, b.y, 0, 0, 0)] }
}
