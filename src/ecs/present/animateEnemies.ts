import { query } from 'bitecs'
import { Casting, Depth, ENEMY_SET, EnemyPhase, MARK, Motion, MOTION, Phys, Sprite, TELEGRAPH, Transform } from '../components'
import { enemyZ } from '../entities/enemy'
import { footY } from '../utils/ground'
import { hasMark } from '../utils/marks'
import { leaderX, leaderY } from '../utils/team'
import { UNIT } from '../../util/units'
import type { Sim } from '../sim'

/** 按脚底排前后；冲刺中朝冲刺方向前倾，蓄力抖动是预兆，其余时候随呼吸轻晃、按速度转身；变形、眩晕与静止中不动 */
export function animateEnemies(sim: Sim): void {
  const now = sim.elapsedMs
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  for (const eid of query(sim.world, ENEMY_SET)) {
    Depth.z[eid] = enemyZ(sim.hooks.worldDelta(sim, lx, ly, Transform.x[eid]!, footY(sim.world, eid)).y / UNIT)
    if (hasMark(sim, eid, MARK.morph) || hasMark(sim, eid, MARK.stun) || hasMark(sim, eid, MARK.stasis)) continue
    if (Motion.kind[eid] === MOTION.dash) {
      const vx = Motion.vx[eid]!
      Transform.rot[eid] = (vx / (Math.hypot(vx, Motion.vy[eid]!) || 1)) * 0.3
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
