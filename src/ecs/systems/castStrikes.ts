import type { StrikeDef } from '../../types/abilityDefs'
import { spawnDrop } from '../entities/drop'
import { ownerX, ownerY } from '../ability/amp'
import { sourceOf } from '../ability/source'
import { castScan } from '../ability/castScan'
import { KindStrike } from '../ability/tags'
import { targetsOf } from '../ability/targets'
import type { Sim } from '../sim'

/** 点名打击：坠物逐个砸向离锚点最近的 N 个目标——落地才结算伤害与掉币。
 * 镜像坐标按真身去重（坠物落在可见的那一处） */
export function castStrikes(sim: Sim): void {
  castScan<StrikeDef>(sim, KindStrike, (e, def) => {
    const src = sourceOf(sim, e)
    const ox = ownerX(e)
    const oy = ownerY(e)
    const seen = new Set<number>()
    const nearest = targetsOf(sim, src)
      .map((t) => ({ t, d2: (t.x - ox) ** 2 + (t.y - oy) ** 2 }))
      .sort((a, b) => a.d2 - b.d2)
      .filter(({ t }) => !seen.has(t.eid) && (seen.add(t.eid), true))
      .slice(0, def.targets)
    nearest.forEach(({ t }, i) =>
      spawnDrop(sim, e, {
        visual: def.drop,
        target: t.eid,
        x: t.x,
        y: t.y,
        fromAbove: def.drop.fromAbove,
        dropMs: def.drop.dropMs,
        delayMs: i * def.drop.staggerMs,
      }),
    )
  })
}
