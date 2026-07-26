import { strongestTarget } from '../utils/assassinate'
import { blinkFlash } from '../ops/assassinate'
import type { AssassinateDef } from '../../types/abilityDefs'
import { playSfx } from '../../audio/sfx'
import { Aim, Blink, Followup, Hp, Iframe, Owner, VisOff } from '../components'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { damageTarget } from '../ops/damage'
import { applyAbilityEffects } from '../ops/effects'
import { sourceOf } from '../utils/source'
import { castScan } from '../ops/castScan'
import { KindAssassinate } from '../registries/abilityKinds'
import { targetsOf } from '../utils/targets'
import type { Sim } from '../sim'

/** 瞬袭：瞬移到索敌范围内血量最高的敌人背后重斩，短暂停留（期间本体无敌）后闪回原位。
 * 位移走视觉偏移，不动阵型主权。execute 低血目标伤害翻倍；onHit 波及主目标周围 */
export function castAssassinates(sim: Sim): void {
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
