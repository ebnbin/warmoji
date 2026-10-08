import { UNIT } from '../../util/units'
import { endMotion } from './shared/displace'
import { REJOIN } from '../../data/feel'
import { Alive, Motion, MOTION, Revive, Transform } from '../components'
import { spawnFxCircle } from '../entities/fx'
import { startPop } from '../utils/pop'
import type { Sim } from '../sim'

/** 归队落地：脚下扩开一圈光环、扬起尘土，压扁再弹回 */
function land(sim: Sim, eid: number): void {
  Revive.drop[eid] = 0
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  sim.out.sfx.push('revive')
  startPop(sim, eid, REJOIN.bounceMs)
  spawnFxCircle(sim, x, y, REJOIN.ringRadius * UNIT, {
    fill: 0xfff59d,
    fillAlpha: 0.25,
    stroke: 0xffffff,
    lineWidth: 5,
    lineAlpha: 0.95,
    fromScale: 0.2,
    toScale: 1,
    durationMs: 420,
    depth: 7,
  })
  sim.out.bursts.push({ x, y, count: 8, kind: 'puff' })
}

/** 从空中落回坑位的队员一落地就归队 */
export function landCharacters(sim: Sim): void {
  for (const eid of sim.characters) {
    if (Alive.v[eid] && Revive.drop[eid] && Motion.kind[eid] !== MOTION.arc) land(sim, eid)
  }
}

/** 画面停住时还在空中的直接落地 */
export function settleLandings(sim: Sim): void {
  for (const eid of sim.characters) {
    if (!Alive.v[eid] || !Revive.drop[eid]) continue
    endMotion(eid)
    Revive.drop[eid] = 0
  }
}
