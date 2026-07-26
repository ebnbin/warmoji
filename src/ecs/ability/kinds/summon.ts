import { hasComponent, query, removeEntity } from 'bitecs'
import { UNIT } from '../../../util/units'
import { ACQUIRE } from '../../../data/abilities'
import type { SummonDef } from '../../../types/abilityDefs'
import { ANIM_DEF } from '../../../emoji/anim'
import { playSfx } from '../../../audio/sfx'
import { Poison, Sprite, Tint, Transform } from '../../components'
import { spawnMinion } from '../../entities/minion'
import { cooldownMul, damageMul, damageTarget, ownerX, ownerY } from '../amp'
import { AbilityRef, Built, Cooldown, Frozen, Minion, Swarmer } from '../../components'
import { abilityDefAt } from '../defs'
import { applyAbilityEffects } from '../effects'
import { sourceOf } from '../source'
import { castScan } from '../systems/cast'
import { KindSummon } from '../tags'
import { targetsOf } from '../targets'
import type { Target } from '../targets'
import type { Source } from '../source'
import type { Sim } from '../../sim'

/** 放蜂：每隔一段放出一波小蜂，各自寻路扑向最近的敌人（优先未中毒者，好把毒摊开），
 * 撞上即撞击直伤 + onHit 随即自毁；一直没撞到则到寿命消散 */
export function castSummons(sim: Sim): void {
  const dt = sim.wdtMs
  updateBees(sim, dt)
  castScan<SummonDef>(sim, KindSummon, (e, def) => {
    for (let i = 0; i < def.count; i++) spawnBee(sim, e, def, i)
    Cooldown.left[e] = def.intervalMs * cooldownMul(sim, e)
  })
}

/** 一只小蜂：出生在主人身上，相位错开好让一波蜂散得开 */
function spawnBee(sim: Sim, e: number, def: SummonDef, index: number): void {
  spawnMinion(sim, e, {
    tag: Swarmer,
    emoji: def.minion.emoji,
    size: def.minion.size,
    bornScale: 1,
    x: ownerX(e),
    y: ownerY(e),
    z: 12,
    lifeMs: def.lifeMs,
    phase: (index * Math.PI * 2) / def.count,
    cd: 0,
    animOffsetMs: (index * ANIM_DEF.durMs) / def.count,
  })
}

/** 逐帧：寻路扑敌 / 候敌打转 → 撞上即施伤自毁 → 到寿命消散 */
function updateBees(sim: Sim, dt: number): void {
  for (const b of [...query(sim.world, [Swarmer, Minion, Built, Transform])]) {
    if (!hasComponent(sim.world, b, Minion)) continue // 同波的前一只自毁时连带回收了它
    const e = Built.by[b]! // 放出它的那件武器
    const def = abilityDefAt(AbilityRef.def[e]!) as SummonDef
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
    const step = (def.minion.speed * Math.min(dt, 50)) / 1000
    if (d > step) {
      Transform.x[b] = bx + (dx / d) * step
      Transform.y[b] = by + (dy / d) * step
    } else {
      Transform.x[b] = destX
      Transform.y[b] = destY
    }
    Sprite.flipX[b] = dx < 0 ? 1 : 0
    if (!target) continue
    const rr = target.radius + def.minion.size * 0.35
    const tx = target.x - Transform.x[b]!
    const ty = target.y - Transform.y[b]!
    if (tx * tx + ty * ty > rr * rr) continue
    // 撞上：撞击直伤 + 施毒（onHit），随即自毁
    const damage = Math.round(def.damage * damageMul(sim, e))
    damageTarget(sim, src, target.eid, damage, def.knockback, Transform.x[b]!, Transform.y[b]!)
    applyAbilityEffects(sim, src, def.onHit, { x: target.x, y: target.y, baseDamage: damage, targets: [target.eid] })
    playSfx('hit')
    removeEntity(sim.world, b)
  }
}

/** 优先未中毒的最近敌人；没有未中毒者则退而求其次取最近的 */
function pickTarget(sim: Sim, src: Source, bx: number, by: number): Target | null {
  const max = ACQUIRE.range * UNIT
  let bestFresh: Target | null = null
  let bestFreshD = max * max
  let bestAny: Target | null = null
  let bestAnyD = max * max
  for (const t of targetsOf(sim, src)) {
    const dx = t.x - bx
    const dy = t.y - by
    const d = dx * dx + dy * dy
    if (d < bestAnyD) {
      bestAnyD = d
      bestAny = t
    }
    if (Poison.until[t.eid]! <= sim.elapsedMs && d < bestFreshD) {
      bestFreshD = d
      bestFresh = t
    }
  }
  return bestFresh ?? bestAny
}
