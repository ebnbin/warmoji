import { addComponents, query } from 'bitecs'
import { newEntity } from './entity'
import { UNIT } from '../../util/units'
import { SPAWN } from '../../data/enemies'
import { Due, Telegraph } from '../components'
import { telegraphCarries, telegraphDef } from '../store'
import { attachDrawable } from './drawable'
import type { EnemyDef } from '../../types/enemies'
import type { FieldPickupDef } from '../../types/battlefield'
import type { Sim } from '../sim'


const MARK_Z = 4

export function spawnTelegraph(
  sim: Sim,
  def: EnemyDef,
  x: number,
  y: number,
  hp: number,
  elite: boolean,
  boss: boolean,
  carries?: FieldPickupDef,
  delayMs = SPAWN.telegraphMs,
): number {
  const eid = newEntity(sim.world)
  addComponents(sim.world, eid, Telegraph, Due)
  Telegraph.hp[eid] = hp
  Telegraph.elite[eid] = elite ? 1 : 0
  Telegraph.boss[eid] = boss ? 1 : 0
  Telegraph.bornMs[eid] = sim.elapsedMs
  Due.at[eid] = sim.elapsedMs + delayMs
  telegraphDef[eid] = def
  telegraphCarries[eid] = carries
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
