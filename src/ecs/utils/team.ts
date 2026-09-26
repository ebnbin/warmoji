import { Follow } from '../components'
import type { Point } from '../../util/vec'
import type { Sim } from '../sim'

/** 队伍没有中心，"队伍在哪"就是队长的物理位置 */
export function leaderX(sim: Sim): number {
  return Follow.x[sim.leader]!
}

export function leaderY(sim: Sim): number {
  return Follow.y[sim.leader]!
}

export function leaderPoint(sim: Sim): Point {
  return { x: leaderX(sim), y: leaderY(sim) }
}

export function placeLeader(sim: Sim, x: number, y: number): void {
  Follow.x[sim.leader] = x
  Follow.y[sim.leader] = y
}
