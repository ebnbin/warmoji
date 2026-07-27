import { query } from 'bitecs'
import { Fx, FxBoom, Tint, Transform } from '../components'
import { backEaseOut } from '../utils/ease'
import type { Sim } from '../sim'

/** 💥 爆裂的弹出与淡出（Back.easeOut 从 0.4 倍弹到全尺寸，同时淡出）。
 * 时钟取 sim.fxMs：纯视觉钟，不吃时停拖慢，过场冻结期照旧收尾 */
export function animateBooms(sim: Sim): void {
  for (const eid of query(sim.world, [Fx, FxBoom, Transform, Tint])) {
    const e = backEaseOut((sim.fxMs - Fx.bornMs[eid]!) / Fx.durMs[eid]!)
    const s = FxBoom.size[eid]! * (0.4 + 0.6 * e)
    Transform.w[eid] = s
    Transform.h[eid] = s
    Tint.alpha[eid] = 1 - e
  }
}
