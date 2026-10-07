import { query } from 'bitecs'
import { Alive, ENEMY_SET, Seen, Transform, Uid } from '../components'
import { canSee, eyeM } from '../utils/pass'
import type { Sim } from '../sim'

/** 多久重新判断一次看不看得见，毫秒；各个敌人按编号错开 */
const CHECK_MS = 120
/** 看得见与看不见之间渐变的时间常数，秒：约四分之一秒变到位 */
const FADE_S = 0.08

/** 队伍里有没有哪个活着的队员从自己的眼睛看得见这个敌人的眼睛 */
function seenByTeam(sim: Sim, eid: number): boolean {
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  const eye = eyeM(sim.world, eid)
  for (const m of sim.characters) {
    if (Alive.v[m] && canSee(sim, Transform.x[m]!, Transform.y[m]!, eyeM(sim.world, m), x, y, eye)) return true
  }
  return false
}

/** 每个敌人有没有被队伍看见：地图里有挡视线的障碍才判断，没有的一律看得见；判断的结果渐变成 Seen.v，画面按它淡出 */
export function trackSight(sim: Sim): void {
  const blocks = sim.hooks.trace !== undefined
  const now = sim.elapsedMs
  const k = 1 - Math.exp(-Math.min(sim.dtMs, 50) / 1000 / FADE_S)
  for (const eid of query(sim.world, ENEMY_SET)) {
    const fresh = Seen.uid[eid] !== Uid.v[eid]
    if (fresh) {
      Seen.uid[eid] = Uid.v[eid]!
      Seen.at[eid] = now
    }
    if (!blocks) {
      Seen.v[eid] = 1
      continue
    }
    if (now >= Seen.at[eid]!) {
      Seen.at[eid] = now + CHECK_MS * (0.75 + 0.5 * ((eid * 0.618034) % 1))
      Seen.want[eid] = seenByTeam(sim, eid) ? 1 : 0
    }
    Seen.v[eid] = fresh ? Seen.want[eid]! : Seen.v[eid]! + (Seen.want[eid]! - Seen.v[eid]!) * k
  }
}
