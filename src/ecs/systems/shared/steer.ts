import { AI } from '../../../data/enemies'
import { Alive, EDir, ETurn, Transform } from '../../components'
import type { Point } from '../../../util/vec'
import type { Sim } from '../../sim'
import { teamCenter } from '../../utils/team'

// 各走位系统共用的三件事：找人、游荡、瞄谁。都要过世界钩子（残垣图绕墙、有界图折返、
// 无界图回绕），所以不能是纯函数——wanderDir 还会写 EDir/ETurn。

/** 最近的活着队员（距离过世界钩子的 worldDelta：无界图要按回绕后的差量算） */
export function nearestAlive(sim: Sim, x: number, y: number): Point | null {
  let bestX = 0
  let bestY = 0
  let bestD = Infinity
  for (const eid of sim.characters) {
    if (!Alive.v[eid]) continue
    const d = sim.hooks.worldDelta(sim, x, y, Transform.x[eid]!, Transform.y[eid]!)
    const d2 = d.x * d.x + d.y * d.y
    if (d2 < bestD) {
      bestD = d2
      bestX = x + d.x
      bestY = y + d.y
    }
  }
  return bestD === Infinity ? null : { x: bestX, y: bestY }
}

/** 游荡方向：换向计时 + 世界钩子的方向修正（有界撞边折返 / 无界直走） */
export function wanderDir(sim: Sim, eid: number): Point {
  if (sim.elapsedMs >= ETurn.at[eid]!) {
    const ang = sim.rng.next() * Math.PI * 2
    EDir.x[eid] = Math.cos(ang)
    EDir.y[eid] = Math.sin(ang)
    ETurn.at[eid] = sim.elapsedMs + AI.wander.turnMinMs + sim.rng.next() * AI.wander.turnJitterMs
  }
  const d = sim.hooks.wanderDir(sim, eid, EDir.x[eid]!, EDir.y[eid]!)
  EDir.x[eid] = d.x
  EDir.y[eid] = d.y
  return d
}

/** 瞄谁：队伍中心，或最近的活着队员 */
export function aimPoint(sim: Sim, eid: number, atCenter: boolean): Point | null {
  return atCenter ? teamCenter(sim) : nearestAlive(sim, Transform.x[eid]!, Transform.y[eid]!)
}


/** 逃离转向：贴近地图边缘时叠加向内分量，沿墙滑行绕开而不是顶着边界冲。
 * 纯几何（不读 sim）——有界世界的钩子调它，无界世界不需要 */
export function fleeSteer(
  x: number,
  y: number,
  awayX: number,
  awayY: number,
  mapW: number,
  mapH: number,
  margin: number,
): Point {
  let fx = awayX
  let fy = awayY
  if (x < margin) fx += ((margin - x) / margin) * 2
  if (x > mapW - margin) fx -= ((x - (mapW - margin)) / margin) * 2
  if (y < margin) fy += ((margin - y) / margin) * 2
  if (y > mapH - margin) fy -= ((y - (mapH - margin)) / margin) * 2
  const len = Math.hypot(fx, fy)
  if (len < 1e-6) {
    // 完全抵消（顶死在边上）时沿切线走
    const t = Math.hypot(awayX, awayY) || 1
    return { x: -awayY / t, y: awayX / t }
  }
  return { x: fx / len, y: fy / len }
}
