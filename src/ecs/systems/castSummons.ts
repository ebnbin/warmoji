import { spawnBee } from '../entities/minion'
import { cooldownMul } from '../utils/amp'
import { Summon } from '../components'
import { castScan } from './shared/castScan'
import type { Sim } from '../sim'

/** 放蜂：每隔一段放出一波小蜂，各自寻路扑向最近的敌人（优先未中毒者，好把毒摊开），
 * 撞上即撞击直伤 + onHit 随即自毁；一直没撞到则到寿命消散 */
export function castSummons(sim: Sim): void {
  castScan(sim, Summon, (e) => {
    const count = Summon.count[e]!
    for (let i = 0; i < count; i++) spawnBee(sim, e, i)
    Summon.cdLeft[e] = Summon.intervalMs[e]! * cooldownMul(sim, e)
  })
}
