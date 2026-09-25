import { query } from 'bitecs'
import { Alive, ENEMY_SET, Hp, CharHp, Transform } from '../../components'
import type { Sim } from '../../sim'

export function healCharacters(sim: Sim, x: number, y: number, range: number, amount: number, all: boolean): number {
  const r2 = range * range
  if (all) {
    let n = 0
    for (const m of sim.characters) {
      if (!Alive.v[m]) continue
      const d = sim.hooks.worldDelta(sim, x, y, Transform.x[m]!, Transform.y[m]!)
      if (d.x * d.x + d.y * d.y > r2) continue
      if (CharHp.hp[m]! >= CharHp.max[m]!) continue
      CharHp.hp[m] = Math.min(CharHp.max[m]!, CharHp.hp[m]! + amount)
      n++
    }
    return n
  }
  let best = -1
  let bestRatio = Infinity
  for (const m of sim.characters) {
    if (!Alive.v[m]) continue
    const d = sim.hooks.worldDelta(sim, x, y, Transform.x[m]!, Transform.y[m]!)
    if (d.x * d.x + d.y * d.y > r2) continue
    if (CharHp.hp[m]! >= CharHp.max[m]!) continue
    const ratio = CharHp.hp[m]! / CharHp.max[m]!
    if (ratio < bestRatio) {
      bestRatio = ratio
      best = m
    }
  }
  if (best < 0) return 0
  CharHp.hp[best] = Math.min(CharHp.max[best]!, CharHp.hp[best]! + amount)
  return 1
}

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
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (eid === excludeEid) continue
    if (Hp.v[eid]! >= Hp.max[eid]!) continue
    const d = sim.hooks.worldDelta(sim, x, y, Transform.x[eid]!, Transform.y[eid]!)
    if (d.x * d.x + d.y * d.y <= r2) hurt.push(eid)
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
