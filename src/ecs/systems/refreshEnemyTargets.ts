import { query } from 'bitecs'
import { Dormant, ENEMY_SET, Radius, Transform } from '../components'
import type { Target } from '../utils/targets'
import type { Sim } from '../sim'

// 索敌快照（敌方）：须先于任何队伍侧出手（含抛射物 onHit 命中链）。
// 环面地图上真身之外再喂几个镜像坐标，能力零改动即可隔着传送门瞄准。

/** 重建敌方存活快照：须先于任何队伍侧出手（含抛射物 onHit 命中链） */
export function refreshEnemyTargets(sim: Sim): void {
  const list: Target[] = []
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid]) continue // 休眠怪不可被索敌
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    const radius = Radius.v[eid]!
    list.push({ eid, x, y, radius })
    for (const g of sim.hooks.ghosts(sim, x, y)) list.push({ eid, x: g.x, y: g.y, radius })
  }
  sim.enemyTargets = list
}
