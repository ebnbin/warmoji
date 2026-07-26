import { query } from 'bitecs'
import { PICKUP_SET } from '../components'
import { animatePickup } from '../pickups'
import type { Sim } from '../sim'

/** 只推进视觉(入场弹出 / 待拾缓浮),不做磁吸与拾取:波末过场冻结期用——
 * 世界停了,但已在飞的弹入动画照旧收尾(旧实现里这是 tween 天然不受冻结影响) */
export function stepPickupVisuals(sim: Sim): void {
  for (const eid of query(sim.world, PICKUP_SET as unknown as object[])) animatePickup(sim, eid)
}
