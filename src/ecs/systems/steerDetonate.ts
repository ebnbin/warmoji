import { query } from 'bitecs'
import { playSfx } from '../../audio/sfx'
import { Alive, BVel, Charge, Detonate, DmgMul, EState, Flash, Hurt, Iframe, Slowed, Speed, Steering, Tint, Transform } from '../components'
import { despawnEnemy, hurtCharacter } from './shared/combat'
import { nearestAlive } from './shared/steer'
import { enemyDef } from '../store'
import type { Sim } from '../sim'
import { spawnFxRing } from '../entities/fx'

const BLAST_RING = { color: 0xff5252, fillAlpha: 0.35, lineWidth: 3, lineAlpha: 0.9, durMs: 300 }

export function steerDetonate(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of [...query(sim.world, [Detonate, Steering, Transform, Speed])]) {
    if (!Steering.v[eid]) continue
    const ex = Transform.x[eid]!
    const ey = Transform.y[eid]!
    if (EState.v[eid] === 2) {
      if (Flash.until[eid] === 0) {
        Tint.effect[eid] = 0
        Tint.color[eid] = now % 240 < 120 ? 0xffffff : 0xff5252
      }
      if (now < Charge.windupUntil[eid]!) continue
      const dmg = Math.round(Detonate.blastDamage[eid]! * DmgMul.v[eid]!)
      const r = Detonate.blastRadius[eid]!
      for (const m of sim.characters) {
        if (!Alive.v[m]) continue
        const d = sim.hooks.worldDelta(sim, ex, ey, Transform.x[m]!, Transform.y[m]!)
        const rr = r + Hurt.radius[m]!
        if (d.x * d.x + d.y * d.y > rr * rr) continue
        if (now - Iframe.last[m]! < Iframe.ms[m]!) continue
        Iframe.last[m] = now
        hurtCharacter(sim, m, dmg, enemyDef[eid]?.name)
      }
      spawnFxRing(sim, ex, ey, r, BLAST_RING)
      playSfx('boom')
      despawnEnemy(sim, eid)
      continue
    }
    const target = nearestAlive(sim, ex, ey)
    if (!target) continue
    const dx = target.x - ex
    const dy = target.y - ey
    const tr = Detonate.triggerRange[eid]!
    if (dx * dx + dy * dy <= tr * tr) {
      EState.v[eid] = 2
      Charge.windupUntil[eid] = now + Detonate.windupMs[eid]!
      continue
    }
    const dir = sim.hooks.chaseDir(sim, eid, target.x, target.y)
    const sp = Speed.v[eid]! * Slowed.v[eid]!
    BVel.x[eid] = dir.x * sp
    BVel.y[eid] = dir.y * sp
  }
}
