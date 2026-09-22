import { hasComponent } from 'bitecs'
import { spawnCoins } from '../../entities/pickup'
import { Alive, Drop, Enemy, FACTION, Faction, Owner, Strike, Transform } from '../../components'
import { damageMul, ownerX, ownerY } from '../../utils/amp'
import { damageTarget } from './damage'
import { sourceOf } from '../../utils/source'
import type { Sim } from '../../sim'

/** 目标还在才结算 */
export function land(sim: Sim, d: number): void {
  const e = Owner.eid[d]!
  const target = Drop.target[d]!
  const team = Faction.v[e] === FACTION.team
  if (team ? !hasComponent(sim.world, target, Enemy) : !Alive.v[target]) return
  const src = sourceOf(sim, e)
  const coins = Strike.coinsPerHit[e]!
  if (team && coins > 0) spawnCoins(sim, Transform.x[d]!, Drop.toY[d]!, coins)
  const damage = Math.max(1, Math.round(Strike.damage[e]! * damageMul(sim, e)))
  damageTarget(sim, src, target, damage, Strike.knockback[e]!, ownerX(e), ownerY(e))
}
