import { query } from 'bitecs'
import { Dormant, ENEMY_SET, EnemyPhase, EState, Morph, Sprite, Step, Transform } from '../components'
import type { Sim } from '../sim'
import { isDancing } from '../utils/team'

export function animateEnemies(sim: Sim): void {
  const delta = sim.wdtMs
  const now = sim.elapsedMs
  const dancing = isDancing(sim)
  if (dancing) return
  const dt = delta / 1000
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (Dormant.v[eid]) continue
    if (EState.v[eid] === 2 || EState.v[eid] === 3 || Morph.until[eid] !== 0) continue
    Transform.rot[eid] = Math.sin(now / 95 + EnemyPhase.v[eid]!) * 0.1
    const flipVx = dt > 0 ? Step.x[eid]! / dt : 0
    if (Math.abs(flipVx) > 8) Sprite.flipX[eid] = flipVx > 0 ? 1 : 0
  }
}
