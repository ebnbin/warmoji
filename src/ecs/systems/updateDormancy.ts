import { query } from 'bitecs'
import { Boss, Dormant, ENEMY_SET, Transform } from '../components'
import type { Sim } from '../sim'
import { centerX, centerY } from '../utils/team'

/** 休眠维护(无限世界):出活跃方形的敌人冻结、回来即唤醒。Boss 永不休眠 */
export function updateDormancy(sim: Sim): void {
  const half = sim.hooks.activeHalf(sim)
  if (half === Infinity) return
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    const within =
      Boss.v[eid] === 1 ||
      (Math.abs(Transform.x[eid]! - centerX(sim)) <= half && Math.abs(Transform.y[eid]! - centerY(sim)) <= half)
    Dormant.v[eid] = within ? 0 : 1
  }
}
