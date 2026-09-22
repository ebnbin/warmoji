import { Turret } from '../components'
import { cooldownMul } from '../utils/amp'
import { place } from '../entities/minion'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

/** 塔自己开火：带 projectile 能力进 castScan；拉弓动画时长 = 下次开火间隔 */
export function castTurrets(sim: Sim): void {
  castScan(sim, Turret, (e) => {
    place(sim, e)
    Turret.cdLeft[e] = Turret.placeIntervalMs[e]! * cooldownMul(sim, e)
  })
}
