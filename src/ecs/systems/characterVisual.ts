import { Alive, CharFlash, MARK, Tint } from '../components'
import { hasMark } from '../utils/marks'
import type { Sim } from '../sim'

/** 角色的底色：受击闪色期间不改，其余按攻速下降与否；隐匿时半透明 */
export function characterVisual(sim: Sim): void {
  for (const m of sim.characters) {
    if (!Alive.v[m]) continue
    Tint.alpha[m] = hasMark(sim, m, MARK.hide) ? 0.45 : 1
    if (CharFlash.until[m] !== 0 && sim.fxMs >= CharFlash.until[m]!) CharFlash.until[m] = 0
    if (CharFlash.until[m] === 0) Tint.color[m] = hasMark(sim, m, MARK.cd) ? 0x9ccc65 : 0xffffff
  }
}
