import { playSfx } from '../../audio/sfx'
import { Rush } from '../components'
import { ownerX, ownerY } from '../utils/amp'
import { castScan } from './shared/castScan'
import { spawnFxCircle } from '../entities/fx'
import type { Sim } from '../sim'

/** 冲刺的位移由 moveTeam 推进，沿途撞击由 tickSkillStates 结算 */
export function castRushes(sim: Sim, scan = castScan): void {
  scan(sim, Rush, (e) => {
    const speed = Rush.distance[e]! / (Rush.ms[e]! / 1000)
    sim.rush = { msLeft: Rush.ms[e]!, vx: sim.aim.x * speed, vy: sim.aim.y * speed, e, hit: new Set() }
    playSfx('whoosh')
    spawnFxCircle(sim, ownerX(e), ownerY(e), Rush.hitRadius[e]!, {
      fill: Rush.color[e]!,
      fillAlpha: 0.35,
      stroke: Rush.color[e]!,
      lineWidth: 3,
      lineAlpha: 0.9,
      fromScale: 0.4,
      toScale: 1.6,
      durationMs: 260,
      depth: 8,
    })
  })
}
