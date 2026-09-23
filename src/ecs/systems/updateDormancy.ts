import { query } from 'bitecs'
import { Boss, Dormant, ENEMY_SET, Transform } from '../components'
import type { Sim } from '../sim'
import { centerX, centerY } from '../utils/team'
import { despawnEnemy } from './shared/combat'

/** 连续休眠满此时长（世界时钟）即销毁；中途醒来则下次入眠重新计时 */
const DORMANT_TTL_MS = 30000

export function updateDormancy(sim: Sim): void {
  const half = sim.hooks.activeHalf(sim)
  if (half === Infinity) return
  const now = sim.elapsedMs
  const expired: number[] = []
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    const within =
      Boss.v[eid] === 1 ||
      (Math.abs(Transform.x[eid]! - centerX(sim)) <= half && Math.abs(Transform.y[eid]! - centerY(sim)) <= half)
    if (within) {
      Dormant.v[eid] = 0
    } else if (!Dormant.v[eid]) {
      Dormant.v[eid] = 1
      Dormant.since[eid] = now
    } else if (now - Dormant.since[eid]! >= DORMANT_TTL_MS) {
      expired.push(eid)
    }
  }
  // 遍历完再删：despawnEnemy 内的查询会提交删除，改动正在遍历的集合
  for (const eid of expired) despawnEnemy(sim, eid, false)
}
