import { query } from 'bitecs'
import type { AreaBlastDef } from '../../../data/abilityDefs'
import { ACQUIRE } from '../../../data/abilities'
import { UNIT } from '../../../core/units'
import { playSfx } from '../../../audio/sfx'
import { damageMul, ownerX, ownerY } from '../amp'
import { Ability, AbilityRef, Followup, Frozen } from '../components'
import { abilityDefAt } from '../defs'
import { applyAbilityEffects, applyBlast } from '../effects'
import { castScan } from '../systems/cast'
import { KindAreaBlast } from '../tags'
import { nearestTarget, targetsOf, targetsWithin } from '../targets'
import type { Sim } from '../../sim'

/** 远程范围轰炸：在侦测范围内以最近敌人为爆心，对爆心圆内所有敌人各一次伤害。
 * echo 连锁：主炸后延迟一段向索敌上限内的随机敌人再补一发折损轰炸 */
export function castAreaBlasts(sim: Sim, dt: number): void {
  tickEchoes(sim, dt)
  castScan<AreaBlastDef>(sim, KindAreaBlast, (e, def) => {
    const center = nearestTarget(ownerX(e), ownerY(e), targetsOf(sim, e), def.detectRange)
    if (!center) return false // 侦测范围内无敌人就不出手
    const damage = Math.round(def.damage * damageMul(sim, e))
    blastAt(sim, e, def, center.x, center.y, damage)
    if (def.echo) {
      Followup.left[e] = def.echo.delayMs
      Followup.damage[e] = Math.max(1, Math.round(damage * def.echo.ratio))
    }
    return true
  })
}

/** 后手轰炸的倒计时：与冷却同口径，只在未冻结时推进 */
function tickEchoes(sim: Sim, dt: number): void {
  for (const e of query(sim.world, [Ability, KindAreaBlast, Followup])) {
    if (Followup.left[e]! <= 0 || Frozen.v[e]) continue
    Followup.left[e] = Followup.left[e]! - dt
    if (Followup.left[e]! > 0) continue
    Followup.left[e] = 0
    // 落点取索敌上限内的随机敌人：无限地图上不能轰到无穷远
    const near = targetsWithin(ownerX(e), ownerY(e), targetsOf(sim, e), ACQUIRE.range * UNIT)
    if (near.length === 0) continue
    const t = near[Math.floor(Math.random() * near.length)]!
    blastAt(sim, e, abilityDefAt(AbilityRef.def[e]!) as AreaBlastDef, t.x, t.y, Followup.damage[e]!)
  }
}

/** 一次完整爆炸：伤害 + 命中效果 + 白闪核心/冲击环/爆裂 */
function blastAt(sim: Sim, e: number, def: AreaBlastDef, x: number, y: number, damage: number): void {
  playSfx('boom')
  applyBlast(sim, e, x, y, damage, def.blastRadius, def.knockback)
  applyAbilityEffects(sim, e, def.onHit, { x, y, baseDamage: damage })
  sim.pendingCues.push(
    {
      kind: 'circle',
      x,
      y,
      radius: def.blastRadius * 0.55,
      o: { fill: 0xffffff, fillAlpha: 0.9, fromScale: 1, toScale: 1.7, durationMs: 170, depth: 8 },
    },
    {
      kind: 'circle',
      x,
      y,
      radius: def.blastRadius,
      o: {
        fill: def.color,
        fillAlpha: 0.4,
        stroke: def.color,
        lineWidth: 6,
        lineAlpha: 1,
        fromScale: 0.25,
        toScale: 1.08,
        durationMs: 400,
        depth: 7,
      },
    },
    { kind: 'boom', x, y, size: def.blastRadius * 1.5 },
  )
}
