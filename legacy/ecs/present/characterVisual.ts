import { DOWN, REJOIN } from '../../data/feel'
import { Alive, CharFlash, Revive, Sprite, Tint, Transform } from '../components'
import { presence, statusTint } from '../utils/statusTint'
import type { Sim } from '../sim'

/** 倒下的人原地朝面向歪倒，停一会儿再淡出 */
function fallen(sim: Sim, m: number): void {
  const t = sim.fxMs - Revive.fell[m]!
  Transform.rot[m] = (Sprite.flipX[m] ? 1 : -1) * DOWN.tilt * Math.min(1, t / DOWN.fallMs)
  Tint.alpha[m] = Math.min(1, Math.max(0, 1 - (t - DOWN.holdMs) / DOWN.fadeMs))
}

/** 角色的底色：受击闪色期间不改，其余按状态表里带底色的排；透明度随存在感，归队时从空中渐显 */
export function characterVisual(sim: Sim): void {
  for (const m of sim.characters) {
    if (!Alive.v[m]) {
      fallen(sim, m)
      continue
    }
    const show = Revive.drop[m] ? Math.min(1, (sim.fxMs - Revive.rose[m]!) / REJOIN.fadeInMs) : 1
    Tint.alpha[m] = presence(sim, m) * show
    if (CharFlash.until[m] !== 0 && sim.fxMs >= CharFlash.until[m]!) CharFlash.until[m] = 0
    if (CharFlash.until[m] !== 0) continue
    const cc = statusTint(sim, m)
    Tint.color[m] = cc !== 0 ? cc : 0xffffff
  }
}
