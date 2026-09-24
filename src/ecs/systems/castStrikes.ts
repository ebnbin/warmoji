import { spawnDrop } from '../entities/drop'
import { Strike } from '../components'
import { abilityArtEmoji } from '../store'
import { ownerX, ownerY } from '../utils/amp'
import { sourceOf } from '../utils/source'
import { castScan } from './shared/castScan'
import { targetsNear } from '../utils/targets'
import type { Sim } from '../sim'

/** 镜像坐标按真身去重 */
export function castStrikes(sim: Sim, scan = castScan): void {
  scan(sim, Strike, (e) => {
    const src = sourceOf(sim, e)
    const ox = ownerX(e)
    const oy = ownerY(e)
    const seen = new Set<number>()
    const nearest = targetsNear(sim, src, ox, oy, Infinity)
      .map((t) => ({ t, d2: (t.x - ox) ** 2 + (t.y - oy) ** 2 }))
      .sort((a, b) => a.d2 - b.d2)
      .filter(({ t }) => !seen.has(t.eid) && (seen.add(t.eid), true))
      .slice(0, Strike.targets[e]!)
    nearest.forEach(({ t }, i) =>
      spawnDrop(sim, e, {
        emoji: abilityArtEmoji[e]!,
        size: Strike.size[e]!,
        target: t.eid,
        x: t.x,
        y: t.y,
        fromAbove: Strike.fromAbove[e]!,
        dropMs: Strike.dropMs[e]!,
        delayMs: i * Strike.staggerMs[e]!,
      }),
    )
  })
}
