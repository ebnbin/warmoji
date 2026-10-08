import { query } from 'bitecs'
import { Act, Alive, Transform } from '../components'
import { enemyDef } from '../store'
import { attachDrive, detachDrive } from '../entities/enemy'
import { npcDrive } from '../entities/form'
import { test } from '../utils/cond'
import { selfSource } from '../utils/source'
import { nearestTarget } from '../utils/targets'
import type { Sim } from '../sim'

/** 按条件换走法：有规则的非玩家身体每一刻取第一条成立的（target 是离它最近的敌人），换了才重挂走法 */
export function tickDriveRules(sim: Sim): void {
  for (const eid of query(sim.world, [Act, Transform])) {
    const rules = enemyDef[eid]?.drives
    if (!rules || !Alive.v[eid]) continue
    const src = selfSource(sim, eid)
    const near = nearestTarget(sim, src, Transform.x[eid]!, Transform.y[eid]!, Infinity)
    const target = near ? near.eid : -1
    const idx = rules.findIndex((r) => test(sim, src, eid, target, r.if))
    if (idx === Act.rule[eid]) continue
    Act.rule[eid] = idx
    detachDrive(sim, eid)
    attachDrive(sim, eid, npcDrive(sim, eid))
  }
}
