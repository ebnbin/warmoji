import { hasComponent, query } from 'bitecs'
import { Alive, DmgMul, Dormant, Enemy, ENEMY_SET, Hurt, Iframe, Morph, MPerk, Radius, Slot, Transform } from '../components'
import { applyDamage, hurtMember } from '../ops/combat'
import { applyAbilityEffects } from '../ops/effects'
import { enemySource } from '../utils/source'
import { enemyDef } from '../store'
import type { Sim } from '../sim'

/** 队员接触敌人的伤害结算(镜像 onMemberTouched 的无敌帧节流 + 基础伤害) */
export function memberContact(sim: Sim): void {
  const enemies = query(sim.world, ENEMY_SET as unknown as object[])
  if (enemies.length === 0) return
  if (sim.over) return
  const now = sim.elapsedMs
  for (const m of sim.members) {
    if (!Alive.v[m]) continue
    if (now - Iframe.last[m]! < Iframe.ms[m]!) continue
    const mx = Transform.x[m]!
    const my = Transform.y[m]!
    const hr = Hurt.radius[m]!
    for (const eid of enemies) {
      if (Dormant.v[eid]) continue // 休眠怪不参与接触判定
      const rr = hr + Radius.v[eid]!
      const d = sim.hooks.worldDelta(sim, mx, my, Transform.x[eid]!, Transform.y[eid]!)
      if (d.x * d.x + d.y * d.y > rr * rr) continue
      const def = enemyDef[eid]
      if (!def) continue
      if (def.damage <= 0) continue // 亡语诱饵尸壳(damage=0)无害:接触不伤(镜像 a.decoy 跳过)
      if (Morph.until[eid] !== 0 && now < Morph.until[eid]!) continue // 变形期无害:接触不伤
      Iframe.last[m] = now
      hurtMember(sim, m, Math.max(1, Math.round(def.damage * DmgMul.v[eid]!)), def.name)
      // 荆棘背心:接触反伤(与受击同帧、同吃无敌帧节流;击杀归属穿刺者)
      if (MPerk.thorns[m]! > 0 && hasComponent(sim.world, eid, Enemy)) {
        applyDamage(sim, eid, MPerk.thorns[m]!, 0, undefined, undefined, Slot.v[m]!)
      }
      // 接触附加效果整串走效果层(黏黏怪的攻速罚只是其中一种;伤害的真相是 def.damage,
      // 已在上面结算,故 onContact 只写伤害之外的东西——gen 校验强制)。
      // 从前这里是手挑 attackSlow 一种,别的效果写进 onContact 会被静默丢掉
      if (def.onContact && def.onContact.length > 0) {
        applyAbilityEffects(sim, enemySource(def.name, 1), def.onContact, {
          x: mx,
          y: my,
          baseDamage: 0,
          targets: [m],
        })
      }
      break // 一帧一员只吃一次(无敌帧掌管其余)
    }
  }
}
