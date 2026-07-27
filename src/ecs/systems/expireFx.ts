import { query, removeEntity } from 'bitecs'
import { Fx } from '../components'
import type { Sim } from '../sim'

/** 一次性特效到期回收。时钟取 sim.fxMs——纯视觉钟，故特效不吃时停拖慢，
 * 波末过场冻结期也能自然收尾（stepFrozenVisuals 里同样调它） */
export function expireFx(sim: Sim): void {
  for (const eid of [...query(sim.world, [Fx])]) {
    if (sim.fxMs - Fx.bornMs[eid]! < Fx.durMs[eid]!) continue
    removeEntity(sim.world, eid)
  }
}
