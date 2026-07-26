import { addComponent, addEntity, hasComponent, query, removeEntity } from 'bitecs'
import type { StrikeDef } from '../../../types/abilityDefs'
import { playSfx } from '../../../audio/sfx'
import { Alive, Tint, Transform } from '../../components'
import { attachDrawable } from '../../drawable'
import { enemyDef } from '../../store'
import { damageMul, damageTarget, ownerX, ownerY } from '../amp'
import { AbilityRef, Drop, FACTION, Faction, Owner } from '../../components'
import { abilityDefAt } from '../defs'
import { sourceOf } from '../source'
import { castScan } from '../systems/cast'
import { KindStrike } from '../tags'
import { targetsOf } from '../targets'
import type { Target } from '../targets'
import type { Sim } from '../../sim'

/** 点名打击：坠物逐个砸向离锚点最近的 N 个目标——落地才结算伤害与掉币。
 * 镜像坐标按真身去重（坠物落在可见的那一处） */
export function castStrikes(sim: Sim): void {
  updateDrops(sim)
  castScan<StrikeDef>(sim, KindStrike, (e, def) => {
    const src = sourceOf(sim, e)
    const ox = ownerX(e)
    const oy = ownerY(e)
    const seen = new Set<number>()
    const nearest = targetsOf(sim, src)
      .map((t) => ({ t, d2: (t.x - ox) ** 2 + (t.y - oy) ** 2 }))
      .sort((a, b) => a.d2 - b.d2)
      .filter(({ t }) => !seen.has(t.eid) && (seen.add(t.eid), true))
      .slice(0, def.targets)
    nearest.forEach(({ t }, i) => spawnDrop(sim, e, def, t, i))
  })
}

/** 一枚坠物：起点在目标正上方，错峰延迟后开始下落 */
function spawnDrop(sim: Sim, e: number, def: StrikeDef, t: Target, index: number): void {
  const d = addEntity(sim.world)
  attachDrawable(sim.world, d, sim.frames, {
    id: def.drop.emoji,
    outline: Faction.v[e] === FACTION.enemy ? 'enemy' : 'player',
    x: t.x,
    y: t.y - def.drop.fromAbove,
    size: def.drop.size,
    alpha: 0,
    z: 30,
  })
  addComponent(sim.world, d, Drop)
  addComponent(sim.world, d, Owner)
  Owner.eid[d] = e
  Drop.startMs[d] = sim.fxMs + index * def.drop.staggerMs
  Drop.durMs[d] = def.drop.dropMs
  Drop.fromY[d] = t.y - def.drop.fromAbove
  Drop.toY[d] = t.y
  Drop.target[d] = t.eid
}

/** 坠落推进（Quad.easeIn，位置与显形同一条曲线）+ 落地结算 */
function updateDrops(sim: Sim): void {
  for (const d of [...query(sim.world, [Drop, Owner])]) {
    if (!hasComponent(sim.world, d, Drop)) continue // 上一枚落地时连带回收了它
    const p = (sim.fxMs - Drop.startMs[d]!) / Drop.durMs[d]!
    if (p < 0) continue // 错峰等待：停在起点不显形
    if (p < 1) {
      const q = p * p
      Transform.y[d] = Drop.fromY[d]! + (Drop.toY[d]! - Drop.fromY[d]!) * q
      Tint.alpha[d] = q
      continue
    }
    land(sim, d)
    removeEntity(sim.world, d)
  }
}

/** 落地：目标还在才结算——伤害 + 击退（从锚点推开）+ 落点掉币 */
function land(sim: Sim, d: number): void {
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
  sim.pendingCoins.push({ x, y, count })
}
