import { query } from 'bitecs'
import { Dormant, ENEMY_SET, Transform } from '../components'
import type { Point } from '../../util/vec'
import type { Sim } from '../sim'

/** 把敌人位置汇入 frameTargets(供队伍 orbit/游移门控) */
export function updateFrameTargets(sim: Sim): void {
  const eids = query(sim.world, ENEMY_SET as unknown as object[])
  const out: Point[] = []
  for (const eid of eids) {
    if (Dormant.v[eid]) continue
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    out.push({ x, y })
    // 环面:真身之外再喂三个镜像,队伍 orbit/游移门控隔着传送门也成立
    for (const g of sim.hooks.ghosts(sim, x, y)) out.push(g)
  }
  sim.frameTargets = out
}
