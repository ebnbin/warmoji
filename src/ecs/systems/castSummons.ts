import { spawnBee } from '../ops/summon'
import type { SummonDef } from '../../types/abilityDefs'
import { cooldownMul } from '../utils/amp'
import { Cooldown } from '../components'
import { castScan } from '../ops/castScan'
import { KindSummon } from '../registries/abilityKinds'
import type { Sim } from '../sim'

/** 放蜂：每隔一段放出一波小蜂，各自寻路扑向最近的敌人（优先未中毒者，好把毒摊开），
 * 撞上即撞击直伤 + onHit 随即自毁；一直没撞到则到寿命消散 */
export function castSummons(sim: Sim): void {
  castScan<SummonDef>(sim, KindSummon, (e, def) => {
    for (let i = 0; i < def.count; i++) spawnBee(sim, e, def, i)
    Cooldown.left[e] = def.intervalMs * cooldownMul(sim, e)
  })
}
