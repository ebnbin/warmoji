import { query } from 'bitecs'
import { BVel, Dormant, ENEMY_SET, EnemyVel, Step } from '../components'
import type { Sim } from '../sim'

/** 把本帧的行为速度落成位移：过世界钩子（冰面打滑 / 河流漂移把行为速度低通一道，
 * 击退分量不参与，见 worlds.ts）→ 写进 Step，并记下本帧移动朝向。
 * delta = 世界时长（吃时停） */
export function applyEnemySteps(sim: Sim): void {
  const delta = sim.wdtMs
  const dt = delta / 1000
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid]) continue
    const post = sim.hooks.postSteerEnemy(sim, eid, BVel.x[eid]!, BVel.y[eid]!, delta)
    Step.x[eid] = post.vx * dt
    Step.y[eid] = post.vy * dt
    // 本帧移动朝向(击退前的移动分量;敌方 aim:'move' 弹的 ownerHeading 读)
    if (dt > 0) {
      EnemyVel.x[eid] = post.vx
      EnemyVel.y[eid] = post.vy
    }
  }
}
