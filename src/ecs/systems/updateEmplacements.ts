import { hasComponent, query, removeEntity } from 'bitecs'
import { POP_MS, RETIRE_MS } from '../ability/kinds/turret'
import { Aim, Cooldown, Emplacement, Fired, Frozen, Minion, Retiring, Tint, Transform } from '../components'
import { playClip } from '../anim'
import { backEaseOut } from '../ease'
import type { Sim } from '../sim'

/** 逐帧：入场弹入 / 退场淡出 / 建造者倒下时隐去 + 开火那一下的拉弓动画与朝向。
 * 索敌、冷却、出弹全归 castProjectiles——塔与角色手里的枪走的是同一条管线 */
export function updateEmplacements(sim: Sim): void {
  for (const t of [...query(sim.world, [Emplacement, Minion, Transform])]) {
    if (hasComponent(sim.world, t, Retiring)) {
      const left = Retiring.until[t]! - sim.fxMs
      if (left <= 0) {
        removeEntity(sim.world, t)
        continue
      }
      const p = 1 - left / RETIRE_MS
      const k = Minion.size[t]! * (1 - 0.7 * p)
      Transform.w[t] = k
      Transform.h[t] = k
      Tint.alpha[t] = 1 - p
      continue
    }
    // 建造者倒下：塔停火（Frozen 由闸门按建造者状态置位，castScan 自会跳过）并隐去，
    // 复活自然接着打
    if (Frozen.v[t]) {
      Tint.alpha[t] = 0
      continue
    }
    // 入场弹入（Back.easeOut，0.2 → 1 倍尺寸）
    const age = sim.fxMs - Minion.bornMs[t]!
    if (age < POP_MS) {
      const k = Minion.size[t]! * (0.2 + 0.8 * backEaseOut(age / POP_MS))
      Transform.w[t] = k
      Transform.h[t] = k
    } else if (Transform.w[t] !== Minion.size[t]) {
      Transform.w[t] = Minion.size[t]!
      Transform.h[t] = Minion.size[t]!
    }
    Tint.alpha[t] = 1
    // 本帧刚开过火：拉弓动画铺满到下一发，朝向对准这一发
    if (Fired.at[t] === sim.fxMs) {
      Transform.rot[t] = Aim.rad[t]! - Math.PI / 4
      playClip(sim, sim.frames, t, 'attack', Cooldown.left[t]!)
    }
  }
}
