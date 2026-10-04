import { UNIT } from '../../util/units'
import { roomAt } from '../worlds/basin'
import { bankMarks } from '../river/marks'
import { bridgeLocal, ROCK_FACE_U, weirLocal } from './layout'
import type { SakuraPlan } from './layout'
import type { SakuraConfig } from '../../types/maps'
import type { Landmark } from '../worlds/gates'

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

/**
 * 樱庭的地标，像素，按地图一次定下：ports 是寺墙、上游石组与下游竹栅一线（林子里的口子躲开它们）；wall 是寺墙朝空地的那一面，
 * bank 是溪两岸的水边（石槛与桥两边不摆），都朝空地；rocks 是石组下游那一面，朝下游
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
  return { ports, wall, bank, rocks }
}
