import { playSfx } from '../../audio/sfx'
import { Leap } from '../components'
import { centerX, centerY } from '../utils/team'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

/** 落点先经场地约束，再折算回起点附近，环面上才不会跨图飞 */
export function castLeaps(sim: Sim, scan = castScan): void {
  scan(sim, Leap, (e) => {
    const from = { x: centerX(sim), y: centerY(sim) }
    const dist = Leap.distance[e]!
    const to = sim.hooks.constrainBody(sim, from, { x: from.x + sim.aim.x * dist, y: from.y + sim.aim.y * dist }, sim.dtMs)
    const d = sim.hooks.worldDelta(sim, from.x, from.y, to.x, to.y)
    sim.leap = { msLeft: Leap.ms[e]!, ms: Leap.ms[e]!, fromX: from.x, fromY: from.y, toX: from.x + d.x, toY: from.y + d.y, e, landed: false }
    playSfx('whoosh')
  })
}
