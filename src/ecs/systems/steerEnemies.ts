import { query } from 'bitecs'
import { Dormant, ENEMY_SET, EnemyPhase, EnemyVel, Morph, Slow, Speed, SpMul, Step, Transform, ZoneSlow } from '../components'
import { STEERERS, wanderDir } from '../steering'
import type { Steerer } from '../steering'
import { enemyDef } from '../store'
import type { LocomotionDef } from '../../types/enemies'
import type { Sim } from '../sim'

/** 敌人转向:按 locomotion 求本帧「行为速度」(px/s)→ 过世界钩子(冰面打滑/河流漂移)
 * → 写进 Step。delta = 世界时长(吃时停) */
export function steerEnemies(sim: Sim): void {
  const delta = sim.wdtMs
  const dt = delta / 1000
  const now = sim.elapsedMs
  const dancing = now < sim.danceEndsAt
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid]) continue // 休眠:冻结 AI 与位移,状态原样保留,回到活跃范围自然接管
    // 速度倍率:减速区 × 能力限时减速/冻结 × 体质(精英加速/护巢暴走) × 团队卡与战场拾取的敌速乘区。
    // 时停不在此处乘——世界侧统一按 wdelta 积分已等价于时间放缩
    const slow =
      ZoneSlow.v[eid]! *
      (now < Slow.until[eid]! ? Slow.mul[eid]! : 1) *
      SpMul.v[eid]! *
      sim.enemySlowMul *
      sim.battleFx.enemySlowMul
    const speed = Speed.v[eid]! * slow
    const kind = enemyDef[eid]?.locomotion.kind ?? 'chase'
    let bvx = 0
    let bvy = 0
    if (dancing) {
      // 蹦迪:定身摇摆(不位移),摇摆幅度大于常态行走
      Transform.rot[eid] = Math.sin(now / 80 + EnemyPhase.v[eid]!) * 0.3
    } else if (Morph.until[eid] !== 0 && now < Morph.until[eid]!) {
      // 魔尘变形期:失去本职行为,顶绵羊形象缓速游荡(半速)。缴械/无害/复形在能力层与战斗层
      const d = wanderDir(sim, eid)
      bvx = d.x * speed * 0.5
      bvy = d.y * speed * 0.5
    } else {
      const v = (STEERERS[kind] as Steerer<LocomotionDef['kind']>)(sim, eid, speed, slow, enemyDef[eid]!.locomotion)
      bvx = v.vx
      bvy = v.vy
    }
    // 世界钩子:冰面打滑等把行为速度过一道低通(击退分量不参与,见 worlds.ts)
    const post = sim.hooks.postSteerEnemy(sim, eid, bvx, bvy, delta)
    Step.x[eid] = post.vx * dt
    Step.y[eid] = post.vy * dt
    // 记录本帧移动朝向(击退前的移动分量;敌方 aim:'move' 弹的 ownerHeading 读)
    if (dt > 0) {
      EnemyVel.x[eid] = post.vx
      EnemyVel.y[eid] = post.vy
    }
  }
}
