import { addComponent, hasComponent } from 'bitecs'
import { UNIT } from '../../util/units'
import { STAT_KEYS, StatFold, foldStats } from '../../data/stats'
import { sandboxFireRate } from '../sandbox/knobs'
import { FACTION, Faction, Grow, Hp, MARK, MARK_SLOTS, Mark, Slot, Stamina, Stats } from '../components'
import { statBase, statLayers } from '../store'
import { rescale } from '../systems/shared/scale'
import { fatigue, squadStamina } from '../systems/shared/stamina'
import type { StatBase, StatKey, StatLayer, StatMods, StatValues } from '../../types/stats'
import type { EcsWorld } from '../world'
import type { Sim } from '../sim'

/** 限时的属性修正由效果以标记施加，按种类折进属性表；减速只取最强的一条 */
const FROM_MARK: Partial<Record<number, { readonly stat: StatKey; readonly strongest?: boolean }>> = {
  [MARK.dmg]: { stat: 'damage' },
  [MARK.cd]: { stat: 'cooldown' },
  [MARK.guard]: { stat: 'taken' },
  [MARK.speed]: { stat: 'moveSpeed' },
  [MARK.slow]: { stat: 'moveSpeed', strongest: true },
  [MARK.grow]: { stat: 'scale' },
}

const fold = new StatFold()

/** 出手的一方在结算时用到的属性 */
export interface Offense {
  readonly damage: number
  readonly crit: number
  readonly knockback: number
  readonly healing: number
}

export const NEUTRAL: Offense = { damage: 1, crit: 0, knockback: 1, healing: 1 }

export function offenseOf(world: EcsWorld, eid: number): Offense {
  if (!hasComponent(world, eid, Stats)) return NEUTRAL
  return { damage: Stats.damage[eid]!, crit: Stats.crit[eid]!, knockback: Stats.knockback[eid]!, healing: Stats.healing[eid]! }
}

/** 身体这一帧的属性表 */
export function statsOf(eid: number): StatValues {
  const out = {} as StatValues
  for (const k of STAT_KEYS) out[k] = Stats[k][eid]!
  return out
}

/** 身体的常驻属性：基础值加各层常驻修正，不算限时修正、战场效果与体力 */
export function lastingStats(eid: number): StatValues {
  return foldStats(statBase[eid], Object.values(statLayers[eid] ?? {}).flatMap((mods) => mods ?? []))
}

/** 这一帧的移速，像素每秒 */
export function moveSpeed(eid: number): number {
  return Stats.moveSpeed[eid]! * UNIT
}

/** 身体开始有属性表：写下基础值，常驻修正清空，先按战斗外的样子汇总一次 */
export function attachStats(world: EcsWorld, eid: number, base: StatBase): void {
  addComponent(world, eid, Stats)
  statBase[eid] = base
  statLayers[eid] = {}
  foldBody(world, undefined, eid)
}

/** 整层替换一层常驻修正，空的就撤掉这一层 */
export function setStatLayer(eid: number, layer: StatLayer, mods: readonly StatMods[] | undefined): void {
  const layers = (statLayers[eid] ??= {})
  if (mods && mods.length > 0) layers[layer] = mods
  else delete layers[layer]
}

/** 这一层里某项属性的倍率，没有就是 1 */
export function layerMul(eid: number, layer: StatLayer, k: StatKey): number {
  let v = 1
  for (const m of statLayers[eid]?.[layer] ?? []) v *= m.mul?.[k] ?? 1
  return v
}

/** 身上限时的属性修正、所在阵营的战场效果与体力：队伍按最累的人走 */
function battleMods(sim: Sim, eid: number): void {
  const world = sim.world
  if (hasComponent(world, eid, Mark)) {
    const now = sim.elapsedMs
    for (let s = eid * MARK_SLOTS; s < (eid + 1) * MARK_SLOTS; s++) {
      const f = FROM_MARK[Mark.kind[s]!]
      if (!f || Mark.until[s]! <= now) continue
      if (f.strongest) fold.strongest(f.stat, Mark.a[s]!)
      else fold.times(f.stat, Mark.a[s]!)
    }
  }
  const side = Faction.v[eid]
  const field = side === FACTION.team ? sim.battleFx.team : side === FACTION.enemy ? sim.battleFx.enemy : []
  for (const m of field) fold.apply(m)
  if (sim.sandbox && side === FACTION.team) fold.times('cooldown', 1 / sandboxFireRate())
  const tired = hasComponent(world, eid, Slot) ? fatigue(squadStamina(sim)) : hasComponent(world, eid, Stamina) ? fatigue(Stamina.v[eid]!) : 1
  fold.times('moveSpeed', tired)
}

/** 汇总一个身体的属性表：基础值加常驻修正；在战斗里再加上限时修正、战场效果与体力。随后让生命上限与体型跟上 */
export function foldBody(world: EcsWorld, sim: Sim | undefined, eid: number): void {
  fold.start(statBase[eid])
  const layers = statLayers[eid]
  if (layers) for (const layer in layers) for (const m of layers[layer as StatLayer]!) fold.apply(m)
  if (sim) battleMods(sim, eid)
  for (let i = 0; i < STAT_KEYS.length; i++) Stats[STAT_KEYS[i]!][eid] = fold.value(i)
  if (hasComponent(world, eid, Hp)) {
    const max = Math.round(Stats.maxHp[eid]!)
    if (Hp.max[eid] !== max) {
      Hp.max[eid] = max
      Hp.v[eid] = Math.min(Hp.v[eid]!, max)
    }
  }
  if (hasComponent(world, eid, Grow) && Grow.v[eid] !== Stats.scale[eid]) rescale(world, eid)
}
