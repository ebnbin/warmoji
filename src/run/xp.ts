import { XP } from '../data/waves'
import type { XpCurve } from '../types/xp'
import { runDef } from './state'
import type { RunState } from './state'

/** 这一局的经验曲线：靠全队升级的一局按它自己写的 */
function curveOf(run: RunState): XpCurve {
  return runDef(run).teamLevel ?? XP
}

/** 全队从当前等级升到下一级要的经验 */
export function xpToNext(run: RunState): number {
  const c = curveOf(run)
  return Math.round(c.first * (c.ratio - (c.ratio - 1) * Math.exp(-(run.xp.level - 1) / c.k)))
}

/** 全队攒经验，够了就升级，返回升了几级 */
export function gainXp(run: RunState, amount: number): number {
  let gained = 0
  run.xp.xp += amount
  while (run.xp.xp >= xpToNext(run)) {
    run.xp.xp -= xpToNext(run)
    run.xp.level++
    gained++
  }
  return gained
}
