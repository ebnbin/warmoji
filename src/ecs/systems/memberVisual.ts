import { Alive, MAtkSlow, MFlash, Tint } from '../components'
import type { Sim } from '../sim'

/** 队员染色恢复(仅活着的):受击红闪到时恢复;非红闪期按黏滞态染色(黏液绿/常态白) */
export function memberVisual(sim: Sim): void {
  const now = sim.elapsedMs
  for (const m of sim.members) {
    if (!Alive.v[m]) continue
    // 镜像旧 updateMembers 的三分支:黏滞期逐帧重涂黏液绿(压过受击红闪),
    // 黏滞到期那帧清一次(连进行中的红闪一并抹白),其余情况由红闪自己到点转白
    if (MAtkSlow.until[m]! > now) {
      Tint.color[m] = 0x9ccc65
    } else if (MAtkSlow.until[m]! !== 0) {
      MAtkSlow.until[m] = 0
      MFlash.until[m] = 0
      Tint.color[m] = 0xffffff
    } else if (MFlash.until[m] !== 0 && now >= MFlash.until[m]!) {
      MFlash.until[m] = 0
      Tint.color[m] = 0xffffff
    }
  }
}
