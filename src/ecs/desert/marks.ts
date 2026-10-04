import { UNIT } from '../../util/units'
import type { Landmark } from '../worlds/gates'
import type { DesertPlan } from './terrain'

/** 标志物的口子在实心部分背阴一侧的边往里这么多，格：从它身后钻出来 */
const BEHIND_U = 0.3

/**
 * 沙漠的地标，像素，按地图一次定下（环面上基准的那一份）：crest 是每团沙包的顶，朝下风；
 * marker 是每样标志物实心部分背阴一侧的边，朝影子那边
 */
export function desertMarks(plan: DesertPlan): Record<string, Landmark[]> {
  const m = plan.meterPerU
  const crest = plan.dunes.flatMap((d) =>
    d.lobes.map((l) => ({ x: (d.x + (l.du * d.c - l.dv * d.s) / m) * UNIT, y: (d.y + (l.du * d.s + l.dv * d.c) / m) * UNIT, r: 0, nx: d.c, ny: d.s })),
  )
  const len = Math.hypot(plan.offX, plan.offY) || 1
  const nx = plan.offX / len
  const ny = plan.offY / len
  const marker = plan.landmarks.map((l) => {
    let edge = 0
    for (const s of l.shape.solids) edge = Math.max(edge, s.x0 * nx + s.y0 * ny + s.r, s.x1 * nx + s.y1 * ny + s.r)
    const out = Math.max(0, edge - BEHIND_U)
    return { x: (l.x + nx * out) * UNIT, y: (l.y + ny * out) * UNIT, r: 0, nx, ny }
  })
  return { crest, marker }
}
