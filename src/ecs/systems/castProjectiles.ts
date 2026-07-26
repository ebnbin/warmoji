import { headingOf, muzzle, random, shoot } from '../ability/kinds/projectile'
import { DEG2RAD } from '../../util/units'
import type { ProjectileDef } from '../../types/abilityDefs'
import { playSfx } from '../../audio/sfx'
import { damageMul, ownerX, ownerY } from '../ability/amp'
import { Aim, Shots } from '../components'
import { sourceOf } from '../ability/source'
import { castScan } from '../ability/castScan'
import { KindProjectile } from '../ability/tags'
import { nearestAngle, targetsOf } from '../ability/targets'
import type { Sim } from '../sim'

/** 发射：held 时持有物定身指向目标（可带左右手挂载位），无 held 时角色本体出弹。
 * 瞄准 nearest 最近目标 / move 持有者移动方向（无需目标）；整圈齐射也无需目标。
 * volley 恒定齐射（≥360° 为整圈，可随机整体旋转）；everyN 每第 n 次改打一轮特殊齐射 */
export function castProjectiles(sim: Sim): void {
  castScan<ProjectileDef>(sim, KindProjectile, (e, def) => {
    const fullRing = def.volley !== undefined && def.volley.spreadDeg >= 360 - 1e-9
    if (def.aim === 'move') {
      const h = headingOf(sim, e)
      Aim.rad[e] = Math.atan2(h.y, h.x)
    } else if (!fullRing) {
      const aim = nearestAngle(ownerX(e), ownerY(e), targetsOf(sim, sourceOf(sim, e)), def.range)
      if (aim === null) return false
      Aim.rad[e] = aim
    }
    const aim = Aim.rad[e]!
    const damage = Math.round(def.damage * damageMul(sim, e))
    const from = muzzle(sim, e)
    Shots.n[e] = Shots.n[e]! + 1
    const special = def.everyN && Shots.n[e]! % def.everyN.n === 0
    const volley: { count: number; spreadDeg: number; randomRotate?: boolean } | undefined = special
      ? { count: def.everyN!.count, spreadDeg: def.everyN!.spreadDeg }
      : def.volley
    if (volley && volley.count > 1) {
      const full = volley.spreadDeg >= 360 - 1e-9
      const base = full && volley.randomRotate ? random(sim, e) * Math.PI * 2 : aim
      for (let i = 0; i < volley.count; i++) {
        // 整圈按 count 均分步进（端点不重叠）；扇形沿瞄准方向对称散开
        const angle = full
          ? base + (i * volley.spreadDeg * DEG2RAD) / volley.count
          : aim + volley.spreadDeg * DEG2RAD * (i / (volley.count - 1) - 0.5)
        shoot(sim, e, def, from.x, from.y, angle, damage)
      }
    } else {
      shoot(sim, e, def, from.x, from.y, aim, damage)
    }
    if (def.fireSfx) playSfx(def.fireSfx)
    return true
  })
}
