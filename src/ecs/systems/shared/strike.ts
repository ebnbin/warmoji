import { spawnCoins } from '../../entities/pickup'
import { Alive, Drop, FACTION, Faction, Owner, Strike, Transform } from '../../components'
import { isSameEntity } from '../../utils/identity'
import { damageMul, ownerX, ownerY } from '../../utils/amp'
import { damageTarget } from './damage'
import { sourceOf } from '../../utils/source'
import type { Sim } from '../../sim'

export function land(sim: Sim, d: number): void {
  const e = Owner.eid[d]!
  const target = Drop.target[d]!
  const team = Faction.v[e] === FACTION.team
  if (!isSameEntity(sim.world, target, Drop.targetUid[d]!) || (!team && !Alive.v[target])) return
  const src = sourceOf(sim, e)
  const coins = Strike.coinsPerHit[e]!
  if (team && coins > 0) spawnCoins(sim, Transform.x[d]!, Drop.toY[d]!, coins)
  const damage = Math.max(1, Math.round(Strike.damage[e]! * damageMul(sim, e)))
  damageTarget(sim, src, target, damage, Strike.knockback[e]!, ownerX(e), ownerY(e))
}
