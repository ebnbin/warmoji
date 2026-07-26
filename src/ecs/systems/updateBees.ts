import { hasComponent, query, removeEntity } from 'bitecs'
import { pickTarget } from '../utils/summon'
import { playSfx } from '../../audio/sfx'
import { Built, Frozen, Minion, Sprite, Summon, Swarmer, Tint, Transform } from '../components'
import { abilityOnHit } from '../store'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { damageTarget } from '../ops/damage'
import { applyAbilityEffects } from '../ops/effects'
import { sourceOf } from '../utils/source'
import type { Sim } from '../sim'

/** 逐帧：寻路扑敌 / 候敌打转 → 撞上即施伤自毁 → 到寿命消散 */
export function updateBees(sim: Sim): void {
  const dt = sim.wdtMs
  for (const b of [...query(sim.world, [Swarmer, Minion, Built, Transform])]) {
    if (!hasComponent(sim.world, b, Minion)) continue // 同波的前一只自毁时连带回收了它
    const e = Built.by[b]! // 放出它的那件武器
    // 主人倒下：小蜂原地凝住并隐去，主人复活自然接着飞（镜像旧实现停更 + 收视觉）
    if (Frozen.v[e]) {
      Tint.alpha[b] = 0
      continue
    }
    Tint.alpha[b] = 1
    if (sim.elapsedMs >= Minion.dieAt[b]!) {
      removeEntity(sim.world, b)
      continue
    }
    const bx = Transform.x[b]!
    const by = Transform.y[b]!
    const src = sourceOf(sim, e)
    const target = pickTarget(sim, src, bx, by)
    Minion.phase[b] = Minion.phase[b]! + (Math.min(dt, 50) / 1000) * 3
    // 有目标就扑过去；没目标就在主人身边打转候敌
    const destX = target ? target.x : ownerX(e) + Math.cos(Minion.phase[b]!) * 40
    const destY = target ? target.y : ownerY(e) + Math.sin(Minion.phase[b]!) * 40 - 8
    const dx = destX - bx
    const dy = destY - by
    const d = Math.hypot(dx, dy)
    const step = (Summon.speed[e]! * Math.min(dt, 50)) / 1000
    if (d > step) {
      Transform.x[b] = bx + (dx / d) * step
      Transform.y[b] = by + (dy / d) * step
    } else {
      Transform.x[b] = destX
      Transform.y[b] = destY
    }
    Sprite.flipX[b] = dx < 0 ? 1 : 0
    if (!target) continue
    const rr = target.radius + Summon.size[e]! * 0.35
    const tx = target.x - Transform.x[b]!
    const ty = target.y - Transform.y[b]!
    if (tx * tx + ty * ty > rr * rr) continue
    // 撞上：撞击直伤 + 施毒（onHit），随即自毁
    const damage = Math.round(Summon.damage[e]! * damageMul(sim, e))
    damageTarget(sim, src, target.eid, damage, Summon.knockback[e]!, Transform.x[b]!, Transform.y[b]!)
    applyAbilityEffects(sim, src, abilityOnHit[e], { x: target.x, y: target.y, baseDamage: damage, targets: [target.eid] })
    playSfx('hit')
    removeEntity(sim.world, b)
  }
}
