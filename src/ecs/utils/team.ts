import { DanceWindow, TeamDamage, Transform } from '../components'
import type { Point } from '../../util/vec'
import type { Sim } from '../sim'

// 队伍中心即队长实体的位置，只此一处真相

export function centerX(sim: Sim): number {
  return Transform.x[sim.captain]!
}

export function centerY(sim: Sim): number {
  return Transform.y[sim.captain]!
}

/** 拷贝；热路径用 centerX/centerY */
export function teamCenter(sim: Sim): Point {
  return { x: centerX(sim), y: centerY(sim) }
}

export function setCenter(sim: Sim, x: number, y: number): void {
  Transform.x[sim.captain] = x
  Transform.y[sim.captain] = y
}

/** 到期即 1 */
export function teamDamageMul(sim: Sim): number {
  return sim.elapsedMs < TeamDamage.until[sim.captain]! ? TeamDamage.mul[sim.captain]! : 1
}

/** 窗口内新登场的敌人也算 */
export function isDancing(sim: Sim): boolean {
  return sim.elapsedMs < DanceWindow.until[sim.captain]!
}
