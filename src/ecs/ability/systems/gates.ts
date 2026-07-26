import { query } from 'bitecs'
import { Alive, Dormant, Morph, Transform } from '../../components'
import { Ability, AnchorCenter, Disarmed, FACTION, Faction, Frozen, Owner } from '../../components'
import type { Sim } from '../../sim'

/** 队伍锚点跟随队伍中心：唯一职责是把队伍中心写进锚点实体的位姿 */
export function followTeamCenter(sim: Sim): void {
  for (const e of query(sim.world, [AnchorCenter, Transform])) {
    Transform.x[e] = sim.center.x
    Transform.y[e] = sim.center.y
  }
}

/** 由持有者状态刷新出手闸门：阵亡/休眠者冻结（连冷却都不推进），被压制者缴械
 *（推进冷却但不出手）。施放系统只读这两个标志，不各自去查持有者是什么状态 */
export function updateAbilityGates(sim: Sim): void {
  const now = sim.elapsedMs
  const dancing = now < sim.danceEndsAt
  for (const e of query(sim.world, [Ability, Owner, Frozen, Disarmed])) {
    const o = Owner.eid[e]!
    Frozen.v[e] = Alive.v[o] === 1 && Dormant.v[o] === 0 ? 0 : 1
    const morphed = Morph.until[o] !== 0 && now < Morph.until[o]!
    Disarmed.v[e] = morphed || (dancing && Faction.v[e] === FACTION.enemy) ? 1 : 0
  }
}
