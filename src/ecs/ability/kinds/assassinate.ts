import { query } from 'bitecs'
import { DEG2RAD } from '../../../util/units'
import type { AssassinateDef } from '../../../types/abilityDefs'
import { playSfx } from '../../../audio/sfx'
import { Hp, Iframe, Tint, Transform, VisOff } from '../../components'
import { damageMul, damageTarget, ownerX, ownerY } from '../amp'
import { Ability, AbilityRef, Aim, Blink, Followup, Frozen, Gear, Owner } from '../components'
import { abilityDefAt } from '../defs'
import { applyAbilityEffects } from '../effects'
import { sourceOf } from '../source'
import { castScan } from '../systems/cast'
import { KindAssassinate } from '../tags'
import { targetsOf } from '../targets'
import type { Target } from '../targets'
import type { Sim } from '../../sim'

/** 瞬袭：瞬移到索敌范围内血量最高的敌人背后重斩，短暂停留（期间本体无敌）后闪回原位。
 * 位移走视觉偏移，不动阵型主权。execute 低血目标伤害翻倍；onHit 波及主目标周围 */
export function castAssassinates(sim: Sim, dt: number): void {
  placeAssassinGear(sim)
  tickStrikeStay(sim, dt)
  castScan<AssassinateDef>(sim, KindAssassinate, (e, def) => {
    if (Followup.left[e]! > 0) return false // 停留帧内不另起
    const src = sourceOf(sim, e)
    const ox = ownerX(e)
    const oy = ownerY(e)
    const target = strongestTarget(ox, oy, targetsOf(sim, src), def.range)
    if (!target) return false

    // 落点：目标背面（沿本体→目标方向再往前越过目标）
    const dx = target.x - ox
    const dy = target.y - oy
    const d = Math.hypot(dx, dy) || 1
    const landX = target.x + (dx / d) * (target.radius + def.behindDist)
    const landY = target.y + (dy / d) * (target.radius + def.behindDist)
    Aim.rad[e] = Math.atan2(target.y - landY, target.x - landX)
    blinkFlash(sim, ox, oy)
    Blink.x[e] = landX - ox + Blink.x[e]!
    Blink.y[e] = landY - oy + Blink.y[e]!
    const m = Owner.eid[e]!
    VisOff.x[m] = Blink.x[e]!
    VisOff.y[m] = Blink.y[e]!
    Followup.left[e] = def.strikeMs
    Iframe.last[m] = sim.elapsedMs + def.strikeMs + 200 - Iframe.ms[m]!
    playSfx('whoosh')
    blinkFlash(sim, landX, landY)

    // 斩击：主目标全额，处决按血量比例翻倍；连环刃波及周围小圈（排除主目标）
    let damage = Math.round(def.damage * damageMul(sim, e))
    const exec = def.execute
    if (exec) {
      const hp = Hp.v[target.eid] ?? 0
      const maxHp = Hp.max[target.eid] ?? 0
      if (maxHp > 0 && hp / maxHp <= exec.hpRatio) damage = Math.round(damage * exec.mul)
    }
    damageTarget(sim, src, target.eid, damage, def.knockback, landX, landY)
    applyAbilityEffects(sim, src, def.onHit, {
      x: target.x,
      y: target.y,
      baseDamage: damage,
      targets: [target.eid],
      exclude: new Set([target.eid]),
    })
    sim.pendingCues.push({ kind: 'slash', x: target.x, y: target.y, angle: Aim.rad[e]!, radius: 34 })
    return true
  })
}

/** 停留帧推进：到点闪回原位并再闪一次残影 */
function tickStrikeStay(sim: Sim, dt: number): void {
  for (const e of query(sim.world, [Ability, KindAssassinate, Followup, Blink])) {
    if (Followup.left[e]! <= 0) continue
    const m = Owner.eid[e]!
    // 阵亡即收势：立刻结束停留（镜像旧 setVisible(false) 把停留掐到最后一帧）
    Followup.left[e] = Frozen.v[e] ? 0 : Followup.left[e]! - dt
    if (Followup.left[e]! > 0) {
      VisOff.x[m] = Blink.x[e]!
      VisOff.y[m] = Blink.y[e]!
      continue
    }
    Followup.left[e] = 0
    Blink.x[e] = 0
    Blink.y[e] = 0
    VisOff.x[m] = 0
    VisOff.y[m] = 0
    blinkFlash(sim, ownerX(e), ownerY(e))
  }
}

/** 上限内血量最高的目标（厚血怪优先挨刀） */
function strongestTarget(ox: number, oy: number, list: readonly Target[], maxRange: number): Target | null {
  const r2 = maxRange * maxRange
  let best: Target | null = null
  let bestHp = -1
  for (const t of list) {
    const dx = t.x - ox
    const dy = t.y - oy
    if (dx * dx + dy * dy > r2) continue
    const hp = Hp.v[t.eid] ?? 0
    if (hp > bestHp) {
      bestHp = hp
      best = t
    }
  }
  return best
}

/** 摆位：持有物定身指向瞄准方向 */
function placeAssassinGear(sim: Sim): void {
  for (const e of query(sim.world, [Ability, KindAssassinate, Gear, Aim])) {
    const g = Gear.eid[e]!
    if (g === 0) continue
    const def = abilityDefAt(AbilityRef.def[e]!) as AssassinateDef
    const held = def.held!
    const aim = Aim.rad[e]!
    Transform.x[g] = ownerX(e) + Math.cos(aim) * held.restOffset
    Transform.y[g] = ownerY(e) + Math.sin(aim) * held.restOffset
    Transform.rot[g] = aim + held.rotationOffsetDeg * DEG2RAD
    Tint.alpha[g] = Frozen.v[e] ? 0 : 1
  }
}

/** 瞬移端点的残影闪光 */
function blinkFlash(sim: Sim, x: number, y: number): void {
  sim.pendingCues.push({
    kind: 'circle',
    x,
    y,
    radius: 26,
    o: { fill: 0xb388ff, fillAlpha: 0.4, fromScale: 1, toScale: 1.8, durationMs: 240, depth: 14 },
  })
}
