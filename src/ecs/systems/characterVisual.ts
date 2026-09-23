import { Alive, CharAtkSlow, CharFlash, Tint } from '../components'
import type { Sim } from '../sim'

/** 黏滞是战斗效果，按世界时；着色是纯视觉，按 fxMs */
export function characterVisual(sim: Sim): void {
  const now = sim.elapsedMs
  for (const m of sim.characters) {
    if (!Alive.v[m]) continue
    if (CharAtkSlow.until[m]! > now) {
      Tint.color[m] = 0x9ccc65
    } else if (CharAtkSlow.until[m]! !== 0) {
      CharAtkSlow.until[m] = 0
      CharFlash.until[m] = 0
      Tint.color[m] = 0xffffff
    } else if (CharFlash.until[m] !== 0 && sim.fxMs >= CharFlash.until[m]!) {
      CharFlash.until[m] = 0
      Tint.color[m] = 0xffffff
    }
  }
}
