import { hasComponent } from 'bitecs'
import { DEG2RAD } from '../../util/units'
import { playSfx } from '../../audio/sfx'
import { Aim, AimMove, EveryN, Shoot, Shots, Volley } from '../components'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { headingOf, muzzle } from '../utils/projectile'
import { fireSfxOf, random, shoot } from '../ops/projectile'
import { sourceOf } from '../utils/source'
import { castScan } from '../ops/castScan'
import { nearestAngle, targetsOf } from '../utils/targets'
import type { Sim } from '../sim'

/** 发射：held 时持有物定身指向目标（可带左右手挂载位），无 held 时角色本体出弹。
 * 瞄准最近目标；挂了 AimMove 则朝持有者移动方向（无需目标），整圈齐射也无需目标。
 * Volley 恒定齐射（≥360° 为整圈，可随机整体旋转）；EveryN 每第 n 次改打一轮特殊齐射 */
export function castProjectiles(sim: Sim): void {
  castScan(sim, Shoot, (e) => {
    const w = sim.world
    const hasVolley = hasComponent(w, e, Volley)
    const fullRing = hasVolley && Volley.spreadDeg[e]! >= 360 - 1e-9
    if (hasComponent(w, e, AimMove)) {
      const h = headingOf(sim, e)
      Aim.rad[e] = Math.atan2(h.y, h.x)
    } else if (!fullRing) {
      // range = 0 表示不覆写索敌上限，交给 nearestAngle 的缺省
      const range = Shoot.range[e]!
      const aim = nearestAngle(ownerX(e), ownerY(e), targetsOf(sim, sourceOf(sim, e)), range > 0 ? range : undefined)
      if (aim === null) return false
      Aim.rad[e] = aim
    }
    const aim = Aim.rad[e]!
    const damage = Math.round(Shoot.damage[e]! * damageMul(sim, e))
    const from = muzzle(sim, e)
    Shots.n[e] = Shots.n[e]! + 1
    // 每第 n 次改打一轮特殊齐射（取代常规齐射）
    const special = hasComponent(w, e, EveryN) && Shots.n[e]! % EveryN.n[e]! === 0
    const count = special ? EveryN.count[e]! : hasVolley ? Volley.count[e]! : 0
    const spreadDeg = special ? EveryN.spreadDeg[e]! : hasVolley ? Volley.spreadDeg[e]! : 0
    if (count > 1) {
      const full = spreadDeg >= 360 - 1e-9
      const randomRotate = !special && Volley.randomRotate[e] === 1
      const base = full && randomRotate ? random(sim, e) * Math.PI * 2 : aim
      for (let i = 0; i < count; i++) {
        // 整圈按 count 均分步进（端点不重叠）；扇形沿瞄准方向对称散开
        const angle = full
          ? base + (i * spreadDeg * DEG2RAD) / count
          : aim + spreadDeg * DEG2RAD * (i / (count - 1) - 0.5)
        shoot(sim, e, from.x, from.y, angle, damage)
      }
    } else {
      shoot(sim, e, from.x, from.y, aim, damage)
    }
    const sfx = fireSfxOf(e)
    if (sfx) playSfx(sfx)
    return true
  })
}
