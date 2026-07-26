import { query } from 'bitecs'
import { Dormant, ENEMY_SET, EState, EnemyPhase, Morph, Sprite, Step, Transform } from '../components'
import type { Sim } from '../sim'

/** 行走动画:环境摇摆(轻微旋转)+ 按移动方向翻转(twemoji 默认朝左)。
 * 蓄力/冲刺(EState 2/3)、蹦迪与变形由各自状态机/形象自管,此处不覆盖。
 * 翻转读「含击退」的本帧位移(被击飞时会朝击退方向转身),且读的是禁锢之前的那一份 */
export function animateEnemies(sim: Sim): void {
  const delta = sim.wdtMs
  const now = sim.elapsedMs
  const dancing = now < sim.danceEndsAt
  if (dancing) return
  const dt = delta / 1000
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid]) continue
    if (EState.v[eid] === 2 || EState.v[eid] === 3 || Morph.until[eid] !== 0) continue
    Transform.rot[eid] = Math.sin(now / 95 + EnemyPhase.v[eid]!) * 0.1
    const flipVx = dt > 0 ? Step.x[eid]! / dt : 0
    if (Math.abs(flipVx) > 8) Sprite.flipX[eid] = flipVx > 0 ? 1 : 0
  }
}
