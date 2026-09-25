import { DanceWindow, TeamDamage, Transform } from '../components'
import type { Point } from '../../util/vec'
import type { Sim } from '../sim'

export function centerX(sim: Sim): number {
  return Transform.x[sim.captain]!
}

export function centerY(sim: Sim): number {
  return Transform.y[sim.captain]!
}

export function teamCenter(sim: Sim): Point {
  return { x: centerX(sim), y: centerY(sim) }
}

export function setCenter(sim: Sim, x: number, y: number): void {
  Transform.x[sim.captain] = x
  Transform.y[sim.captain] = y
}

export function teamDamageMul(sim: Sim): number {
  return sim.elapsedMs < TeamDamage.until[sim.captain]! ? TeamDamage.mul[sim.captain]! : 1
}

export function isDancing(sim: Sim): boolean {
  return sim.elapsedMs < DanceWindow.until[sim.captain]!
}
