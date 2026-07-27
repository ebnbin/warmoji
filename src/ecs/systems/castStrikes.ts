import { spawnDrop } from '../entities/drop'
import { Strike } from '../components'
import { abilityArtEmoji } from '../store'
import { ownerX, ownerY } from '../utils/amp'
import { sourceOf } from '../utils/source'
import { castScan } from './shared/castScan'
import { targetsOf } from '../utils/targets'
import type { Sim } from '../sim'

/** 点名打击：坠物逐个砸向离锚点最近的 N 个目标——落地才结算伤害与掉币。
 * 镜像坐标按真身去重（坠物落在可见的那一处） */
export function castStrikes(sim: Sim): void {
  castScan(sim, Strike, (e) => {
    const src = sourceOf(sim, e)
    const ox = ownerX(e)
    const oy = ownerY(e)
    const seen = new Set<number>()
    const nearest = targetsOf(sim, src)
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
