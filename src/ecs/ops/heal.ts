import { query } from 'bitecs'
import { Alive, ENEMY_SET, Hp, MHp, Transform } from '../components'
import type { Sim } from '../sim'

// 治疗的两侧落点（阵营中立的一对原语）：谁被治由调用方按阵营选，挑选规则两侧一致——
// all=false 只治「血量比例」最低的一个，满血者不计，返回实际被治数。

/** 治疗范围内我方队员 */
export function healMembers(sim: Sim, x: number, y: number, range: number, amount: number, all: boolean): number {
  const r2 = range * range
  if (all) {
    let n = 0
    for (const m of sim.members) {
      if (!Alive.v[m]) continue
      const dx = Transform.x[m]! - x
      const dy = Transform.y[m]! - y
      if (dx * dx + dy * dy > r2) continue
      if (MHp.hp[m]! >= MHp.max[m]!) continue
      MHp.hp[m] = Math.min(MHp.max[m]!, MHp.hp[m]! + amount)
      n++
    }
    return n
  }
  let best = -1
  let bestRatio = Infinity
  for (const m of sim.members) {
    if (!Alive.v[m]) continue
    const dx = Transform.x[m]! - x
    const dy = Transform.y[m]! - y
    if (dx * dx + dy * dy > r2) continue
    if (MHp.hp[m]! >= MHp.max[m]!) continue
    const ratio = MHp.hp[m]! / MHp.max[m]!
    if (ratio < bestRatio) {
      bestRatio = ratio
      best = m
    }
  }
  if (best < 0) return 0
  MHp.hp[best] = Math.min(MHp.max[best]!, MHp.hp[best]! + amount)
  return 1
}

/** 治疗范围内敌群；excludeEid 排除一只（亡语治疗时排除正在死亡的自己） */
export function healEnemies(
  sim: Sim,
  x: number,
  y: number,
  range: number,
  amount: number,
  all: boolean,
  excludeEid?: number,
): number {
  const r2 = range * range
  const hurt: number[] = []
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (eid === excludeEid) continue
    if (Hp.v[eid]! >= Hp.max[eid]!) continue
    const dx = Transform.x[eid]! - x
    const dy = Transform.y[eid]! - y
    if (dx * dx + dy * dy <= r2) hurt.push(eid)
  }
  if (hurt.length === 0) return 0
  let targets: number[]
  if (all) {
    targets = hurt
  } else {
    let best = hurt[0]!
    for (const eid of hurt) if (Hp.v[eid]! / Hp.max[eid]! < Hp.v[best]! / Hp.max[best]!) best = eid
    targets = [best]
  }
  for (const eid of targets) Hp.v[eid] = Math.min(Hp.max[eid]!, Hp.v[eid]! + amount)
  return targets.length
}
