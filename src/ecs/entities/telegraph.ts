import { addComponents, query } from 'bitecs'
import { newEntity } from './entity'
import { UNIT } from '../../util/units'
import { SPAWN } from '../../data/enemies'
import { Due, Telegraph } from '../components'
import { telegraphDef, telegraphEntry, telegraphTraits } from '../store'
import { entranceMs } from '../worlds/gates'
import type { Entry } from '../worlds/gates'
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

/** 从出怪口进场的预兆至少打这么久，看得清落在哪 */
const MIN_MARK_MS = 300

/** 预兆打多久：突袭时只有头目打；怪物自己聚出来的地图按地图的；从出怪口进场的扣掉进场动作的时长，落地时正好是原本现身的时刻，进场动作太长的也至少打一会儿 */
export function telegraphDelay(sim: Sim, boss: boolean, delayMs: number, entry: Entry | undefined): number {
  if (sim.fight.rules.surprise && !boss) return 0
  const ms = sim.hooks.forming?.(sim, boss) ?? delayMs
  return entry ? Math.max(MIN_MARK_MS, ms - entranceMs(entry)) : ms
}

/** 在 (x, y) 打预兆；entry 是从出怪口进场的样子，此时 (x, y) 是它的落点 */
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
  entry?: Entry,
): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Telegraph, Due)
  Telegraph.hp[eid] = hp
  Telegraph.elite[eid] = elite ? 1 : 0
  Telegraph.boss[eid] = boss ? 1 : 0
  Telegraph.bornMs[eid] = sim.elapsedMs
  Due.at[eid] = sim.elapsedMs + telegraphDelay(sim, boss, delayMs, entry)
  telegraphDef[eid] = def
  telegraphTraits[eid] = traits
  telegraphEntry[eid] = entry
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
