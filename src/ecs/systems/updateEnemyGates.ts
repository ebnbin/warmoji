import { query } from 'bitecs'
import { BVel, Dormant, ENEMY_SET, EnemyPhase, Morph, Slow, Slowed, Speed, SpMul, Steering, Transform, ZoneSlow } from '../components'
import { wanderDir } from './shared/steer'
import type { Sim } from '../sim'
import { isDancing } from '../utils/team'

/** 由局面派生转向的闸门与倍率：**「谁来开车」只在这一处决定**。
 *
 * Slowed = 本帧移速倍率（减速区 × 能力限时减速 × 体质 × 团队卡与战场拾取）。
 * 时停不在此处乘——世界侧统一按 wdelta 积分已等价于时间放缩。
 *
 * Steering = 本职走位这一帧要不要接管。休眠 / 蹦迪 / 变形三种情况由本系统当场把
 * BVel 写完并置 0，各走位系统只认这一个标志，不必各自再问一遍「是不是在蹦迪」。 */
export function updateEnemyGates(sim: Sim): void {
  const now = sim.elapsedMs
  const dancing = isDancing(sim)
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    BVel.x[eid] = 0
    BVel.y[eid] = 0
    // 休眠:冻结 AI 与位移,状态原样保留,回到活跃范围自然接管
    if (Dormant.v[eid]) {
      Steering.v[eid] = 0
      continue
    }
    const slow =
      ZoneSlow.v[eid]! *
      (now < Slow.until[eid]! ? Slow.mul[eid]! : 1) *
      SpMul.v[eid]! *
      sim.enemySlowMul *
      sim.battleFx.enemySlowMul
    Slowed.v[eid] = slow
    if (dancing) {
      // 蹦迪:定身摇摆(不位移),摇摆幅度大于常态行走
      Transform.rot[eid] = Math.sin(now / 80 + EnemyPhase.v[eid]!) * 0.3
      Steering.v[eid] = 0
      continue
    }
    if (Morph.until[eid] !== 0 && now < Morph.until[eid]!) {
      // 魔尘变形期:失去本职行为,顶绵羊形象缓速游荡(半速)。缴械/无害/复形在能力层与战斗层
      const d = wanderDir(sim, eid)
      const sp = Speed.v[eid]! * slow * 0.5
      BVel.x[eid] = d.x * sp
      BVel.y[eid] = d.y * sp
      Steering.v[eid] = 0
      continue
    }
    Steering.v[eid] = 1
  }
}
