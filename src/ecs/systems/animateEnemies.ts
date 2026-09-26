import { query } from 'bitecs'
import { Casting, Dormant, ENEMY_SET, EnemyPhase, MARK, Phys, Rushing, Sprite, TELEGRAPH, Transform } from '../components'
import { hasMark } from '../utils/marks'
import type { Sim } from '../sim'

/** 冲刺中朝冲刺方向前倾，蓄力抖动是预兆，其余时候随呼吸轻晃、按速度转身；变形与定身中不动 */
export function animateEnemies(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, ENEMY_SET)) {
    if (Dormant.v[eid] || hasMark(sim, eid, MARK.morph) || hasMark(sim, eid, MARK.stun)) continue
    if (Rushing.active[eid]) {
      const vx = Rushing.vx[eid]!
      Transform.rot[eid] = (vx / (Math.hypot(vx, Rushing.vy[eid]!) || 1)) * 0.3
      Sprite.flipX[eid] = vx > 0 ? 1 : 0
      continue
    }
    if (now < Casting.until[eid]!) {
      if (Casting.telegraph[eid] === TELEGRAPH.shake) Transform.rot[eid] = Math.sin(now / 28) * 0.14
      continue
    }
    Transform.rot[eid] = Math.sin(now / 95 + EnemyPhase.v[eid]!) * 0.1
    const vx = Phys.vx[eid]!
    if (Math.abs(vx) > 8) Sprite.flipX[eid] = vx > 0 ? 1 : 0
  }
}
