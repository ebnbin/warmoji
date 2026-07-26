import { BATTLE_FX_IDENTITY } from '../../data/battlefield'
import { foldBattleEffects } from '../../war/battleFx'
import type { Sim } from '../sim'

/** 剔除到期的限时层后重折乘区(镜像 refoldBattleFx) */
export function refoldBattleFx(sim: Sim): void {
  if (sim.battleMods.length === 0) return
  const live = sim.battleMods.filter((m) => m.until > sim.elapsedMs)
  if (live.length === sim.battleMods.length && live.length > 0) return // 无变化则免折
  sim.battleMods = live
  sim.battleFx = live.length === 0 ? { ...BATTLE_FX_IDENTITY } : foldBattleEffects(live.map((m) => m.fx))
}
