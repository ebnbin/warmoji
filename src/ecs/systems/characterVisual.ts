import { Alive, CharFlash, MARK, Tint } from '../components'
import { hasMark, isHidden } from '../utils/marks'
import { statusTint } from '../utils/statusTint'
import type { Sim } from '../sim'

/** 角色的底色：受击闪色期间不改，其余按控制、攻速下降排；看不见时半透明 */
export function characterVisual(sim: Sim): void {
  for (const m of sim.characters) {
    if (!Alive.v[m]) continue
    Tint.alpha[m] = isHidden(sim, m) ? 0.45 : 1
    if (CharFlash.until[m] !== 0 && sim.fxMs >= CharFlash.until[m]!) CharFlash.until[m] = 0
    if (CharFlash.until[m] !== 0) continue
    const cc = statusTint(sim, m)
    Tint.color[m] = cc !== 0 ? cc : hasMark(sim, m, MARK.cd) ? 0x9ccc65 : 0xffffff
  }
}
