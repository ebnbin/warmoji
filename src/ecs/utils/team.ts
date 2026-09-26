import { Transform } from '../components'
import type { Point } from '../../util/vec'
import type { Sim } from '../sim'

/** 队伍没有中心，"队伍在哪"就是队长的身体位置 */
export function leaderX(sim: Sim): number {
  return Transform.x[sim.leader]!
}

export function leaderY(sim: Sim): number {
  return Transform.y[sim.leader]!
}

export function leaderPoint(sim: Sim): Point {
  return { x: leaderX(sim), y: leaderY(sim) }
}
