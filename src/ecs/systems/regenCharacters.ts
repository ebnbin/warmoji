import { Alive, Hp, CharPerk } from '../components'
import type { Sim } from '../sim'

export function regenCharacters(sim: Sim): void {
  const wdelta = sim.wdtMs
  for (const m of sim.characters) {
    if (!Alive.v[m] || CharPerk.regenPerSec[m]! <= 0) continue
    if (Hp.v[m]! >= Hp.max[m]!) continue
    Hp.v[m] = Math.min(Hp.max[m]!, Hp.v[m]! + (CharPerk.regenPerSec[m]! * wdelta) / 1000)
  }
}
