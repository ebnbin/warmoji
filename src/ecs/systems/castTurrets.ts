import { Cooldown, Turret } from '../components'
import { cooldownMul } from '../utils/amp'
import { place } from '../ops/turret'
import { castScan } from '../ops/castScan'
import type { Sim } from '../sim'

/** 架设弩塔：本体无攻击，周期在脚下架一座。**塔自己开火**——它带着一条 projectile
 * 能力进 castScan，与角色手上的枪走同一条管线，只是施放锚点是它自己。
 * 同时在场有上限，超编拆最旧的。Burst 三连弩 = 那条能力的 Volley。
 * 一次开火 = 一遍拉弓动画，时长恰为下次开火间隔——攻速越快拉弓越快 */
export function castTurrets(sim: Sim): void {
  castScan(sim, Turret, (e) => {
    place(sim, e)
    Cooldown.left[e] = Turret.placeIntervalMs[e]! * cooldownMul(sim, e)
  })
}
