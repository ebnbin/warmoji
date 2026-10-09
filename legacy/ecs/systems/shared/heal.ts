import { hasComponent } from 'bitecs'
import { Hp, Mark, MARK } from '../../components'
import { hasMark } from '../../utils/marks'
import { eachAlly } from '../../utils/targets'
import type { Sim } from '../../sim'

/** 回血都走这里：加上 amount，不超过生命上限；中了毒的什么都回不了；回给谁、回多少由调用方定 */
export function mend(sim: Sim, eid: number, amount: number): void {
  if (hasComponent(sim.world, eid, Mark) && hasMark(sim, eid, MARK.poison)) return
  Hp.v[eid] = Math.min(Hp.max[eid]!, Hp.v[eid]! + amount)
}

/** 治疗范围内受伤的同阵营身体：全体，或只治血量比例最低的一个；返回治到的人数 */
export function healAllies(
  sim: Sim,
  faction: number,
  x: number,
  y: number,
  range: number,
  amount: number,
  all: boolean,
  exclude = -1,
  realm = 0,
): number {
  const hurt: number[] = []
  eachAlly(sim, faction, x, y, range, false, (eid, tx, ty) => {
    if (eid === exclude || Hp.v[eid]! >= Hp.max[eid]!) return
    const dx = tx - x
    const dy = ty - y
    if (dx * dx + dy * dy > range * range) return
    hurt.push(eid)
  }, realm)
  if (hurt.length === 0) return 0
  let targets: number[]
  if (all) {
    targets = hurt
  } else {
    let best = hurt[0]!
    for (const eid of hurt) if (Hp.v[eid]! / Hp.max[eid]! < Hp.v[best]! / Hp.max[best]!) best = eid
    targets = [best]
  }
  for (const eid of targets) mend(sim, eid, amount)
  return targets.length
}
