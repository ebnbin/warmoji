import type { StrikeDef } from '../../../types/abilityDefs'
import { playSfx } from '../../../audio/sfx'
import { dropCoins } from '../../pickups'
import { AbilityRef, Alive, Drop, Faction, FACTION, Owner, Transform } from '../../components'
import { enemyDef } from '../../store'
import { damageMul, damageTarget, ownerX, ownerY } from '../amp'
import { abilityDefAt } from '../defs'
import { sourceOf } from '../source'
import type { Sim } from '../../sim'

/** 落地：目标还在才结算——伤害 + 击退（从锚点推开）+ 落点掉币 */
export function land(sim: Sim, d: number): void {
  const e = Owner.eid[d]!
  const target = Drop.target[d]!
  const team = Faction.v[e] === FACTION.team
  if (team ? enemyDef[target] === undefined : !Alive.v[target]) return
  const src = sourceOf(sim, e)
  const def = abilityDefAt(AbilityRef.def[e]!) as StrikeDef
  if (team && def.coinsPerHit) spawnCoins(sim, Transform.x[d]!, Drop.toY[d]!, def.coinsPerHit)
  const damage = Math.max(1, Math.round(def.damage * damageMul(sim, e)))
  damageTarget(sim, src, target, damage, def.knockback, ownerX(e), ownerY(e))
}

/** 战场掉币：落地待拾，音效与爆点随拾取管线 */
function spawnCoins(sim: Sim, x: number, y: number, count: number): void {
  if (sim.over) return
  sim.pendingBursts.push({ x, y, count: 6, kind: 'coin' })
  playSfx('coin')
  dropCoins(sim, x, y, count)
}
