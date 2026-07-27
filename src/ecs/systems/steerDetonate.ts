import { query } from 'bitecs'
import { playSfx } from '../../audio/sfx'
import { Alive, BVel, Charge, Detonate, DmgMul, EState, Iframe, Slowed, Speed, Steering, Tint, Transform } from '../components'
import { despawnEnemy, hurtMember } from './shared/combat'
import { nearestAlive } from './shared/steer'
import { enemyDef } from '../store'
import type { Sim } from '../sim'

/** 自爆冲锋：追队员 → 进 triggerRange 定身蓄力 → 蓄力完必引爆（群伤范围内队员 + 自毁）。
 * 蓄力前被打死则不炸（引爆不是亡语） */
export function steerDetonate(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of [...query(sim.world, [Detonate, Steering, Transform, Speed])]) {
    if (!Steering.v[eid]) continue
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!
    if (EState.v[eid] === 2) {
      // 定身拆弹 + 红白脉冲示警(脚本化姿态);到时引爆。乘算染色(白=原样、红=偏红),非纯色填充
      Tint.effect[eid] = 0
      Tint.color[eid] = now % 240 < 120 ? 0xffffff : 0xff5252
      if (now < Charge.windupUntil[eid]!) continue
      const dmg = Math.round(Detonate.blastDamage[eid]! * DmgMul.v[eid]!)
      const r = Detonate.blastRadius[eid]!
      const r2 = r * r
      for (const m of sim.members) {
        if (!Alive.v[m]) continue
        const d = sim.hooks.worldDelta(sim, ex, ey, Transform.x[m]!, Transform.y[m]!)
        if (d.x * d.x + d.y * d.y > r2) continue
        // 与敌方能力同口径:吃无敌帧节流并消费之(免得接触伤害与自爆同帧双吃)
        if (now - Iframe.last[m]! < Iframe.ms[m]!) continue
        Iframe.last[m] = now
        hurtMember(sim, m, dmg, enemyDef[eid]?.name)
      }
      sim.pendingRings.push({ x: ex, y: ey, radius: r })
      playSfx('boom')
      despawnEnemy(sim, eid)
      continue
    }
    const target = nearestAlive(sim, ex, ey)
    if (!target) continue
    const dx = target.x - ex
    const dy = target.y - ey
    const tr = Detonate.triggerRange[eid]!
    if (dx * dx + dy * dy <= tr * tr) {
      EState.v[eid] = 2
      Charge.windupUntil[eid] = now + Detonate.windupMs[eid]!
      continue
    }
    const dir = sim.hooks.chaseDir(sim, eid, target.x, target.y)
    const sp = Speed.v[eid]! * Slowed.v[eid]!
    BVel.x[eid] = dir.x * sp
    BVel.y[eid] = dir.y * sp
  }
}
