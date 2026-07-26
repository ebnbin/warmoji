import type { HealDef } from '../../types/abilityDefs'
import { playSfx } from '../../audio/sfx'
import { Alive, Cooldown, Faction, FACTION, Revive, Transform } from '../components'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { healEnemies, healMembers } from '../ops/heal'
import { castScan } from '../ops/castScan'
import { KindHeal } from '../registries/abilityKinds'
import type { Sim } from '../sim'

/** 周期治疗：治血量比例最低的己方（aoe 则范围全体）。治疗量吃伤害乘区——磨刀石对军医同样有意义。
 * 己方是谁由阵营决定：队伍侧治队员，敌方侧治敌群 */
export function castHeals(sim: Sim): void {
  castScan<HealDef>(sim, KindHeal, (e, def) => {
    const x = ownerX(e)
    const y = ownerY(e)
    const team = Faction.v[e] === FACTION.team
    // 电击起搏优先：救倒下的比奶站着的更急（复活倒计时是队伍侧独有的机制）
    if (team && def.defib && cutReviveTimer(sim, x, y, def.range, def.defib.reviveCutMs)) {
      pulse(sim, x, y, def.range, 0xfff176)
      playSfx('zap')
      return true
    }
    const base = Math.max(1, Math.round(def.amount * damageMul(sim, e)))
    // 群体处方：范围内全体各回 ratio × 基准；否则只补最缺血的一个
    const amount = def.aoe ? Math.max(1, Math.round(base * def.aoe.ratio)) : base
    const all = def.aoe !== undefined
    const healed = team
      ? healMembers(sim, x, y, def.range, amount, all)
      : healEnemies(sim, x, y, def.range, amount, all)
    if (healed === 0) {
      Cooldown.left[e] = 300 // 全员满血：小步重试，不空耗完整冷却
      return false
    }
    pulse(sim, x, y, def.range, 0x81c784)
    playSfx('upgrade')
    return true
  })
}

/** 给范围内复活倒计时最长的阵亡队友减 ms；无阵亡者返回 false */
function cutReviveTimer(sim: Sim, x: number, y: number, range: number, ms: number): boolean {
  const r2 = range * range
  let best = -1
  for (const m of sim.members) {
    if (Alive.v[m]) continue
    const dx = Transform.x[m]! - x
    const dy = Transform.y[m]! - y
    if (dx * dx + dy * dy > r2) continue
    if (best < 0 || Revive.at[m]! > Revive.at[best]!) best = m
  }
  if (best < 0) return false
  Revive.at[best] = Revive.at[best]! - ms
  return true
}

/** 治疗脉冲环 */
function pulse(sim: Sim, x: number, y: number, radius: number, color: number): void {
  sim.pendingCues.push({
    kind: 'circle',
    x,
    y,
    radius,
    o: {
      fill: color,
      fillAlpha: 0.08,
      stroke: color,
      lineWidth: 3,
      lineAlpha: 0.7,
      fromScale: 0.25,
      toScale: 1,
      durationMs: 420,
      depth: 6,
    },
  })
}
