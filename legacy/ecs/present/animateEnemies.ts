import { query } from 'bitecs'
import { Casting, Depth, ENEMY_SET, EnemyPhase, Motion, MOTION, Phys, Pop, Sprite, Strike, TELEGRAPH, Transform } from '../components'
import { enemyZ } from '../entities/enemy'
import { footY } from '../render/foot'
import { isHalted } from '../utils/marks'
import { leaderX, leaderY } from '../utils/team'
import { UNIT } from '../../util/units'
import { leanToward, STRIKE_POSE, strikeDepth, WINDUP_POSE } from './pose'
import type { Sim } from '../sim'

/** 弹出动画放完的身体按姿势伸缩，尺寸以 Pop.size 为准 */
function shape(eid: number, sx: number, sy: number): void {
  const base = Pop.size[eid]!
  if (Pop.until[eid] !== 0 || base <= 0) return
  Transform.w[eid] = base * sx
  Transform.h[eid] = base * sy
}

/**
 * 按脚底排前后；冲刺中朝冲刺方向前倾；蓄力时转向瞄着的方向、越蓄越往后仰压低，抖动的再加上抖动；出手那一刻朝出手方向一探再弹回；
 * 其余时候随呼吸轻晃、按速度转身；变形、眩晕与静止中不动
 */
export function animateEnemies(sim: Sim): void {
  const now = sim.elapsedMs
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  for (const eid of query(sim.world, ENEMY_SET)) {
    Depth.z[eid] = enemyZ(sim.hooks.worldDelta(sim, lx, ly, Transform.x[eid]!, footY(sim.world, eid)).y / UNIT)
    if (isHalted(sim, eid)) {
      shape(eid, 1, 1)
      continue
    }
    if (Motion.kind[eid] === MOTION.dash) {
      const vx = Motion.vx[eid]!
      Transform.rot[eid] = (vx / (Math.hypot(vx, Motion.vy[eid]!) || 1)) * 0.3
      Sprite.flipX[eid] = vx > 0 ? 1 : 0
      shape(eid, 1, 1)
      continue
    }
    const until = Casting.until[eid]!
    if (now < until) {
      const from = Casting.from[eid]!
      const p = until > from ? Math.min(1, Math.max(0, (now - from) / (until - from))) : 1
      const angle = Casting.angle[eid]!
      const shake = Casting.telegraph[eid] === TELEGRAPH.shake ? Math.sin(now / 28) * 0.14 : 0
      Transform.rot[eid] = shake - leanToward(angle, WINDUP_POSE.lean * p)
      Sprite.flipX[eid] = Math.cos(angle) > 0 ? 1 : 0
      shape(eid, 1 + WINDUP_POSE.widen * p, 1 - WINDUP_POSE.squash * p)
      continue
    }
    const k = strikeDepth(sim.fxMs, Strike.at[eid]!)
    Transform.rot[eid] = Math.sin(now / 95 + EnemyPhase.v[eid]!) * 0.1 + leanToward(Strike.angle[eid]!, STRIKE_POSE.lean * k)
    shape(eid, 1 + STRIKE_POSE.stretch * k, 1 - STRIKE_POSE.squash * k)
    const vx = Phys.vx[eid]!
    if (Math.abs(vx) > 8) Sprite.flipX[eid] = vx > 0 ? 1 : 0
  }
}
