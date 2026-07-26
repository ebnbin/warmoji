import { query, removeEntity } from 'bitecs'
import { Alive, EProj, EPROJ_SET, Hurt, Iframe, Transform, Vel } from '../components'
import { hurtMember } from '../combat'
import { eprojSrcName } from '../store'
import type { Sim } from '../sim'

// 敌弹(P3e):圆-圆命中队员(吃无敌帧节流)+ 按寿命/出界回收。

export function updateEnemyProjectiles(sim: Sim): void {
  const delta = sim.wdtMs
  const shots = query(sim.world, EPROJ_SET as unknown as object[])
  if (shots.length === 0) return
  const dt = delta / 1000
  const now = sim.elapsedMs
  for (const eid of shots) {
    const moved = sim.hooks.wrap(sim, Transform.x[eid]! + Vel.x[eid]! * dt, Transform.y[eid]! + Vel.y[eid]! * dt)
    const x = moved.x
    const y = moved.y
    Transform.x[eid] = x
    Transform.y[eid] = y
    // 命中队员:圆-圆(敌弹半径 + 队员受击半径),吃无敌帧节流
    let hitMember = false
    const pr = EProj.radius[eid]!
    if (!sim.over) {
      for (const m of sim.members) {
        if (!Alive.v[m]) continue
        const rr = pr + Hurt.radius[m]!
        const d = sim.hooks.worldDelta(sim, x, y, Transform.x[m]!, Transform.y[m]!)
        if (d.x * d.x + d.y * d.y > rr * rr) continue
        if (now - Iframe.last[m]! < Iframe.ms[m]!) {
          hitMember = true // 命中但被无敌帧挡下:敌弹照常销毁
          break
        }
        Iframe.last[m] = now
        hurtMember(sim, m, EProj.damage[eid]!, eprojSrcName[eid])
        hitMember = true
        break
      }
    }
    if (hitMember) {
      removeEntity(sim.world, eid)
      continue
    }
    // 寿命回收 + 世界钩子的额外回收(有界图出地图即灭;无界只按寿命)
    if (now >= EProj.dieAt[eid]! || sim.hooks.cullEnemyProjectile(sim, x, y)) removeEntity(sim.world, eid)
  }
}
