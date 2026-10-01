import { ENTRANCE } from '../../data/feel'
import { UNIT } from '../../util/units'
import { Transform } from '../components'
import { displace } from '../systems/shared/displace'
import type { Mover } from '../systems/shared/displace'
import { entranceMs } from '../worlds/gates'
import type { Entry } from '../worlds/gates'
import type { Sim } from '../sim'

/** 进场动作不看锚定与霸体：头目和不吃击退的也照样翻进来 */
const ENTER: Mover = { self: false, free: true }

/** 抛入至少腾空多高，格 */
const LOB_MIN_U = 1

/** 刚现身的敌人按进场方式动起来：钻出就在原地，落下从高处掉到落点，走出、翻进、抛入从起点（场地外也行）腾空到落点；起点冒一团烟 */
export function enterBody(sim: Sim, eid: number, e: Entry): void {
  sim.out.bursts.push({ x: e.sx, y: e.sy, count: 6, kind: 'puff' })
  if (e.enter === 'rise') return
  if (e.enter === 'drop') {
    displace(sim, eid, { kind: 'drop', ms: entranceMs(e), height: ENTRANCE.drop.heightU * UNIT }, ENTER)
    return
  }
  Transform.x[eid] = e.sx
  Transform.y[eid] = e.sy
  const distU = Math.hypot(e.x - e.sx, e.y - e.sy) / UNIT
  const heightU = e.enter === 'lob' ? Math.max(LOB_MIN_U, distU * ENTRANCE.lob.heightPerU) : e.enter === 'walk' ? ENTRANCE.walk.heightU : ENTRANCE.climb.heightU
  displace(sim, eid, { kind: 'arc', x: e.x, y: e.y, ms: entranceMs(e), height: heightU * UNIT }, ENTER)
}
