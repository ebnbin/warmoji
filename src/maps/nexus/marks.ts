import { UNIT } from '../../util/units'
import type { NexusPlan } from './layout'
import type { NexusConfig } from '../../types/maps'
import type { Landmark } from '../landmark'

/** 检修口的盖板多大，格：一格瓷砖里留一圈缝 */
export const HATCH_R_U = 0.42

/** 天枢的地标，像素，按生成好的大厅一次定下：lift 是电梯门（朝厅里），hatch 是地上的检修口 */
export function nexusMarks(cfg: NexusConfig, plan: NexusPlan): Record<string, Landmark[]> {
  const lift = plan.cores.flatMap((c) => c.doors.map((d): Landmark => ({ x: d.x * UNIT, y: d.y * UNIT, r: (cfg.cores.doorU / 2) * UNIT, nx: d.nx, ny: d.ny })))
  const hatch = plan.hatches.map((h): Landmark => ({ x: (h.x + 0.5) * UNIT, y: (h.y + 0.5) * UNIT, r: HATCH_R_U * UNIT, nx: 0, ny: 0 }))
  return { lift, hatch }
}
