import { AI } from '../../../data/enemies'
import { Alive, EDir, ETurn, Transform } from '../../components'
import type { Point } from '../../../util/vec'
import type { Sim } from '../../sim'

// 各走位系统共用的三件事：找人、游荡、瞄谁。都要过世界钩子（残垣图绕墙、有界图折返、
// 无界图回绕），所以不能是纯函数——wanderDir 还会写 EDir/ETurn。

/** 最近的活着队员（距离过世界钩子的 worldDelta：无界图要按回绕后的差量算） */
export function nearestAlive(sim: Sim, x: number, y: number): Point | null {
  let bestX = 0
  let bestY = 0
  let bestD = Infinity
  for (const eid of sim.members) {
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
export function aimPoint(sim: Sim, eid: number, teamCenter: boolean): Point | null {
  return teamCenter ? sim.center : nearestAlive(sim, Transform.x[eid]!, Transform.y[eid]!)
}
