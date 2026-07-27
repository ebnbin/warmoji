import { hasComponent } from 'bitecs'
import { playSfx } from '../../audio/sfx'
import { Alive, FACTION, Faction, Heal, HealAoe, HealDefib, Revive, Transform } from '../components'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { healEnemies, healCharacters } from './shared/heal'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'
import { spawnFxCircle } from '../entities/fx'

/** 周期治疗：治血量比例最低的己方（aoe 则范围全体）。治疗量吃伤害乘区——磨刀石对军医同样有意义。
 * 己方是谁由阵营决定：队伍侧治队员，敌方侧治敌群 */
export function castHeals(sim: Sim): void {
  castScan(sim, Heal, (e) => {
    const x = ownerX(e)
    const y = ownerY(e)
    const range = Heal.range[e]!
    const team = Faction.v[e] === FACTION.team
    // 电击起搏优先：救倒下的比奶站着的更急（复活倒计时是队伍侧独有的机制）
    if (
      team &&
      hasComponent(sim.world, e, HealDefib) &&
      cutReviveTimer(sim, x, y, range, HealDefib.reviveCutMs[e]!)
    ) {
      pulse(sim, x, y, range, 0xfff176)
      playSfx('zap')
      return true
    }
    const base = Math.max(1, Math.round(Heal.amount[e]! * damageMul(sim, e)))
    // 群体处方：范围内全体各回 ratio × 基准；否则只补最缺血的一个
    const all = hasComponent(sim.world, e, HealAoe)
    const amount = all ? Math.max(1, Math.round(base * HealAoe.ratio[e]!)) : base
    const healed = team
      ? healCharacters(sim, x, y, range, amount, all)
      : healEnemies(sim, x, y, range, amount, all)
    if (healed === 0) {
      Heal.cdLeft[e] = 300 // 全员满血：小步重试，不空耗完整冷却
      return false
    }
    pulse(sim, x, y, range, 0x81c784)
    playSfx('upgrade')
    return true
  })
}

/** 给范围内复活倒计时最长的阵亡队友减 ms；无阵亡者返回 false */
function cutReviveTimer(sim: Sim, x: number, y: number, range: number, ms: number): boolean {
  const r2 = range * range
  let best = -1
  for (const m of sim.characters) {
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
  spawnFxCircle(sim, x, y, radius, {
    fill: color,
    fillAlpha: 0.08,
    stroke: color,
    lineWidth: 3,
    lineAlpha: 0.7,
    fromScale: 0.25,
    toScale: 1,
    durationMs: 420,
    depth: 6,
  })
}
