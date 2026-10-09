import { query } from 'bitecs'
import { Stats } from '../components'
import { foldBody } from '../utils/stats'
import type { Sim } from '../sim'

/** 每帧开头重新汇总所有身体的属性表：限时修正、战场效果与体力都会变，这一帧里的逻辑都读它 */
export function tickStats(sim: Sim): void {
  for (const eid of query(sim.world, [Stats])) foldBody(sim.world, sim, eid)
}
