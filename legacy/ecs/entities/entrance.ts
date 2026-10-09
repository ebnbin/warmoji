import { ENTRANCE } from '../../data/feel'
import { UNIT } from '../../util/units'
import { Alive, Motion, Radius, Sprite, Transform, Uid } from '../components'
import { displace } from '../systems/shared/displace'
import type { Mover } from '../systems/shared/displace'
import { entranceMs, entryLook, expectLanding, takeLandings } from '../worlds/gates'
import type { Entry } from '../worlds/gates'
import type { EntranceLook } from '../../types/maps'
import type { Sim } from '../sim'

/** 进场动作不看锚定与霸体：头目和不吃击退的也照样翻进来 */
const ENTER: Mover = { self: false, free: true }

/** 抛入至少腾空多高，格 */
const LOB_MIN_U = 1

/** 冒出的样子有几颗：按身体大小 */
function show(sim: Sim, look: EntranceLook, x: number, y: number, r: number): void {
  sim.out.bursts.push({ x, y, count: Math.round(5 + (6 * r) / UNIT), kind: look })
}

/**
 * 刚现身的敌人按进场方式动起来：钻出就在原地，落下从高处掉到落点，走出、翻进、抛入从起点（场地外也行）腾空到落点，落地就站住、脸朝进来的方向；
 * 落下的在落点、抛入的在起点与落点、其余的在起点冒出这种出怪口的样子
 */
export function enterBody(sim: Sim, eid: number, e: Entry): void {
  const look = entryLook(sim, e)
  const r = Radius.v[eid]!
  if (e.enter !== 'drop') show(sim, look, e.sx, e.sy, r)
  if (e.enter === 'rise') return
  if (e.enter === 'drop' || e.enter === 'lob') expectLanding(sim, { at: sim.elapsedMs + entranceMs(e), eid, uid: Uid.v[eid]!, look, x: e.x, y: e.y })
  if (e.enter === 'drop') {
    displace(sim, eid, { kind: 'drop', ms: entranceMs(e), height: ENTRANCE.drop.heightU * UNIT }, ENTER)
    return
  }
  Transform.x[eid] = e.sx
  Transform.y[eid] = e.sy
  const distU = Math.hypot(e.x - e.sx, e.y - e.sy) / UNIT
  const heightU = e.enter === 'lob' ? Math.max(LOB_MIN_U, distU * ENTRANCE.lob.heightPerU) : e.enter === 'walk' ? ENTRANCE.walk.heightU : ENTRANCE.climb.heightU
  displace(sim, eid, { kind: 'arc', x: e.x, y: e.y, ms: entranceMs(e), height: heightU * UNIT }, ENTER)
  Motion.vx[eid] = 0
  Motion.vy[eid] = 0
  if (e.x !== e.sx) Sprite.flipX[eid] = e.x > e.sx ? 1 : 0
}

/** 到点落地的进场：落地前倒下的不冒 */
export function landEntries(sim: Sim): void {
  for (const t of takeLandings(sim)) if (Uid.v[t.eid] === t.uid && Alive.v[t.eid]) show(sim, t.look, t.x, t.y, Radius.v[t.eid]!)
}
