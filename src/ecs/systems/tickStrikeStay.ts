import { query } from 'bitecs'
import { blinkFlash } from '../ability/kinds/assassinate'
import { Ability, Blink, Followup, Frozen, Owner, VisOff } from '../components'
import { ownerX, ownerY } from '../ability/amp'
import { KindAssassinate } from '../ability/tags'
import type { Sim } from '../sim'

/** 停留帧推进：到点闪回原位并再闪一次残影 */
export function tickStrikeStay(sim: Sim): void {
  const dt = sim.wdtMs
  for (const e of query(sim.world, [Ability, KindAssassinate, Followup, Blink])) {
    if (Followup.left[e]! <= 0) continue
    const m = Owner.eid[e]!
    // 阵亡即收势：立刻结束停留（镜像旧 setVisible(false) 把停留掐到最后一帧）
    Followup.left[e] = Frozen.v[e] ? 0 : Followup.left[e]! - dt
    if (Followup.left[e]! > 0) {
      VisOff.x[m] = Blink.x[e]!
      VisOff.y[m] = Blink.y[e]!
      continue
    }
    Followup.left[e] = 0
    Blink.x[e] = 0
    Blink.y[e] = 0
    VisOff.x[m] = 0
    VisOff.y[m] = 0
    blinkFlash(sim, ownerX(e), ownerY(e))
  }
}
