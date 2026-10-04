import { UNIT } from '../../util/units'
import { roomAt } from '../worlds/basin'
import { copperAt } from './layout'
import type { CircuitPlan } from './layout'
import type { Landmark } from '../worlds/gates'

/** 过孔离能走的地面的边至少这么远、离带电的铜至少这么远才摆口子，格 */
const VIA_ROOM_U = 0.6
const VIA_COPPER_U = 1.2
/** 芯片底下的口子有多大、在脚尖往里多远，格；口子前这么远处要落得下、离带电的铜够远才摆 */
const CHIP_R_U = 0.8
const CHIP_IN_U = 0.4
const CHIP_FRONT_U = 1.8
const CHIP_ROOM_U = 0.8

/**
 * 电路板的地标，像素，按生成好的板子一次定下：via 是能走的板面上的过孔；
 * chip 是芯片长边的正中、在一排脚底下朝外，前面落得下又离带电的铜够远的那几边；gap 是每处电弧两尖的中点（罩壁上的口子躲开它们）
 */
export function circuitMarks(plan: CircuitPlan): Record<string, Landmark[]> {
  const via: Landmark[] = []
  for (const v of plan.vias) {
    if (roomAt(plan.basin, v.x * UNIT, v.y * UNIT) < VIA_ROOM_U * UNIT) continue
    const c = copperAt(plan.copper, v.x, v.y)
    if (c && c.dist < VIA_COPPER_U) continue
    via.push({ x: v.x * UNIT, y: v.y * UNIT, r: v.r * UNIT, nx: 0, ny: 0 })
  }
  const chip: Landmark[] = []
  for (const p of plan.parts) {
    if (p.kind !== 'ic' || !p.inside) continue
    // 长边顺着 axis，两排脚朝另一个方向伸出去
    for (const side of [-1, 1]) {
      const nx = p.axis === 0 ? 0 : side
      const ny = p.axis === 0 ? side : 0
      const out = (p.axis === 0 ? p.bh : p.bw) - CHIP_IN_U
      const ax = p.x + nx * out
      const ay = p.y + ny * out
      const fx = ax + nx * CHIP_FRONT_U
      const fy = ay + ny * CHIP_FRONT_U
      if (roomAt(plan.basin, fx * UNIT, fy * UNIT) < CHIP_ROOM_U * UNIT) continue
      const c = copperAt(plan.copper, fx, fy)
      if (c && c.dist < VIA_COPPER_U) continue
      chip.push({ x: ax * UNIT, y: ay * UNIT, r: CHIP_R_U * UNIT, nx, ny })
    }
  }
  const gap = plan.gaps.map((g): Landmark => ({ x: ((g.a.x + g.b.x) / 2) * UNIT, y: ((g.a.y + g.b.y) / 2) * UNIT, r: 0, nx: 0, ny: 0 }))
  return { via, chip, gap }
}
