import { playSfx } from '../../audio/sfx'
import { Leap, Leaping, Owner, Transform } from '../components'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

/** 落点先经场地约束，再折算回起点附近，环面上才不会跨图飞 */
export function castLeaps(sim: Sim, scan = castScan): void {
  scan(sim, Leap, (e) => {
    const m = Owner.eid[e]!
    const from = { x: Transform.x[m]!, y: Transform.y[m]! }
    const dist = Leap.distance[e]!
    const to = sim.hooks.constrainBody(sim, m, from, { x: from.x + sim.aim.x * dist, y: from.y + sim.aim.y * dist })
    const d = sim.hooks.worldDelta(sim, from.x, from.y, to.x, to.y)
    Leaping.active[m] = 1
    Leaping.landed[m] = 0
    Leaping.msLeft[m] = Leap.ms[e]!
    Leaping.ms[m] = Leap.ms[e]!
    Leaping.fromX[m] = from.x
    Leaping.fromY[m] = from.y
    Leaping.toX[m] = from.x + d.x
    Leaping.toY[m] = from.y + d.y
    Leaping.skill[m] = e
    playSfx('whoosh')
  })
}
