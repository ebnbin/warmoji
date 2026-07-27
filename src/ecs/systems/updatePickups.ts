import { addComponent, query, removeEntity } from 'bitecs'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { PICKUP, PICKUPS } from '../../data/pickups'
import { Alive, Collected, Grab, Hurt, Lifetime, PICKUP_SET, Pull, Tint, Transform, Vel } from '../components'
import { animatePickup } from '../entities/pickup'
import type { Sim } from '../sim'

// 拾取物管线:磁吸 → 到手 → 到期回收,外加入场弹出与待拾缓浮。
// 「不同的拾取给不同的东西」不在这条管线里:到手只挂 Collected,由各 Grant 系统各取所需。

/** 地面到期前的渐隐时长(ms) */
const FADE_MS = 250

/** 逐帧:磁吸 → 拾取 → 到期回收,外加入场弹出与待拾缓浮 */
export function updatePickups(sim: Sim): void {
  const delta = sim.dtMs
  const eids = query(sim.world, PICKUP_SET as unknown as object[])
  if (eids.length === 0) return
  const dt = delta / 1000
  const now = sim.elapsedMs
  const cx = sim.center.x
  const cy = sim.center.y
  for (const eid of eids) {
    animatePickup(sim, eid)
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    // 磁力回旋镖优先:镖旁的拾取物直接到手,省去飞回中心的路程
    if (sim.frameAttractors.length > 0 && Pull.radius[eid]! > 0) {
      let taken = false
      for (const a of sim.frameAttractors) {
        const ad = sim.hooks.worldDelta(sim, x, y, a.x, a.y)
        if (ad.x * ad.x + ad.y * ad.y <= a.r2) {
          take(sim, eid)
          taken = true
          break
        }
      }
      if (taken) continue
    }
    // 方向/距离走世界钩子(环面取最短差:隔着传送门也吸得到)
    const w = sim.hooks.worldDelta(sim, x, y, cx, cy)
    const dist2 = w.x * w.x + w.y * w.y
    // 到手:近队伍中心(拾取半径) 或 蹭到任一活着队员的身子(仅磁吸类——战场拾取要的就是走位)
    const grab = Grab.radius[eid]!
    if (dist2 <= grab * grab || (Pull.radius[eid]! > 0 && nearAliveCharacter(sim, x, y))) {
      take(sim, eid)
      continue
    }
    // 到期:末段渐隐再回收(圈随 Tint.alpha 一起淡,见 render/rings.ts)
    if (Lifetime.until[eid]! > 0) {
      const left = Lifetime.until[eid]! - now
      if (left <= 0) {
        removeEntity(sim.world, eid)
        continue
      }
      if (left < FADE_MS) Tint.alpha[eid] = left / FADE_MS
    }
    if (Pull.radius[eid]! === 0) continue
    // 闲置速度交给世界钩子(奔流:随波逐流;其余图静止);磁吸速度叠在它之上
    const idle = sim.hooks.coinIdleVelocity(sim)
    const pull = Pull.radius[eid]!
    if (dist2 < pull * pull) {
      const dir = norm(w.x, w.y)
      Vel.x[eid] = dir.x * PICKUP.magnetSpeed * UNIT + idle.x
      Vel.y[eid] = dir.y * PICKUP.magnetSpeed * UNIT + idle.y
    } else {
      Vel.x[eid] = idle.x
      Vel.y[eid] = idle.y
    }
    // 落点过世界钩子:只回绕不钳制——生成时钳过一次,此后交物理积分自由飞
    const moved = sim.hooks.wrap(sim, x + Vel.x[eid]! * dt, y + Vel.y[eid]! * dt)
    Transform.x[eid] = moved.x
    Transform.y[eid] = moved.y
    // 世界回收(奔流:漂出下游即被河水冲走)
    if (sim.hooks.cullCoin(sim, moved.x, moved.y)) removeEntity(sim.world, eid)
  }
}

/** 到手：只挂个标记。给什么、爆什么、什么时候回收，各归各的系统 */
function take(sim: Sim, eid: number): void {
  addComponent(sim.world, eid, Collected)
}

/** 是否蹭到了任一活着队员(圆-圆:队员受击圆 + 拾取物体半径,镜像旧 overlap)。
 * 受保护中心(受击圆减半)的捡币范围也随之小一圈,与旧实现一致 */
function nearAliveCharacter(sim: Sim, x: number, y: number): boolean {
  const cr = PICKUPS.coin.radius * UNIT
  for (const m of sim.characters) {
    if (!Alive.v[m]) continue
    const rr = Hurt.radius[m]! + cr
    const d = sim.hooks.worldDelta(sim, x, y, Transform.x[m]!, Transform.y[m]!)
    if (d.x * d.x + d.y * d.y <= rr * rr) return true
  }
  return false
}
