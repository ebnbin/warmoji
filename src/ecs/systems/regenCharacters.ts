import { Alive, CharHp, CharPerk } from '../components'
import type { Sim } from '../sim'

/** hp 允许小数，展示处取整 */
export function regenCharacters(sim: Sim): void {
  const wdelta = sim.wdtMs
  for (const m of sim.characters) {
    if (!Alive.v[m] || CharPerk.regenPerSec[m]! <= 0) continue
    if (CharHp.hp[m]! >= CharHp.max[m]!) continue
    CharHp.hp[m] = Math.min(CharHp.max[m]!, CharHp.hp[m]! + (CharPerk.regenPerSec[m]! * wdelta) / 1000)
  }
}
