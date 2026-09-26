import { query } from 'bitecs'
import { Dancing, Dormant, ENEMY_SET, EnemyPhase, EState, Morph, Phys, Sprite, Transform } from '../components'
import type { Sim } from '../sim'

export function animateEnemies(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (Dormant.v[eid]) continue
    if (EState.v[eid] === 2 || EState.v[eid] === 3 || Morph.until[eid] !== 0 || Dancing.until[eid] !== 0) continue
    Transform.rot[eid] = Math.sin(now / 95 + EnemyPhase.v[eid]!) * 0.1
    const vx = Phys.vx[eid]!
    if (Math.abs(vx) > 8) Sprite.flipX[eid] = vx > 0 ? 1 : 0
  }
}
