import { addComponents, query } from 'bitecs'
import { newEntity } from './entity'
import { UNIT } from '../../util/units'
import { SPAWN } from '../../data/enemies'
import { Due, Telegraph } from '../components'
import { telegraphDef, telegraphTraits } from '../store'
import { attachDrawable } from './drawable'
import type { EnemyDef } from '../../types/enemies'
import type { FieldPickupDef } from '../../types/battlefield'
import type { Loot } from '../../types/runs'
import type { StatMods } from '../../types/stats'
import type { Sim } from '../sim'

/** 敌人现身时带上的：这一批的属性修正、盯着队长、战利品倍率、身上带的战场效果 */
export interface SpawnTraits {
  readonly stats?: StatMods
  readonly huntLeader?: boolean
  readonly loot?: Loot
  readonly carries?: FieldPickupDef
}

const MARK_Z = 4

export function spawnTelegraph(
  sim: Sim,
  def: EnemyDef,
  x: number,
  y: number,
  hp: number,
  elite: boolean,
  boss: boolean,
  traits: SpawnTraits = {},
  delayMs = SPAWN.telegraphMs,
): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Telegraph, Due)
  Telegraph.hp[eid] = hp
  Telegraph.elite[eid] = elite ? 1 : 0
  Telegraph.boss[eid] = boss ? 1 : 0
  Telegraph.bornMs[eid] = sim.elapsedMs
  Due.at[eid] = sim.elapsedMs + (sim.fight.rules.surprise && !boss ? 0 : delayMs)
  telegraphDef[eid] = def
  telegraphTraits[eid] = traits
  attachDrawable(sim.world, eid, sim.frames, {
    id: SPAWN.markEmoji,
    outline: undefined,
    x,
    y,
    size: SPAWN.markSize * UNIT * (boss ? 2 : 1),
    alpha: 0,
    z: MARK_Z,
  })
  return eid
}

export function telegraphCount(sim: Sim): number {
  return query(sim.world, [Telegraph]).length
}
