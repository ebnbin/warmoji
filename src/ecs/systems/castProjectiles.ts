import { hasComponent } from 'bitecs'
import { DEG2RAD } from '../../util/units'
import { playSfx } from '../../audio/sfx'
import { Aim, AimMove, EveryN, Shoot, Shots, Volley } from '../components'
import { damageMul, ownerX, ownerY } from '../utils/amp'
import { headingOf, muzzle } from '../utils/projectile'
import { fireSfxOf, random, shoot } from './shared/projectile'
import { sourceOf } from '../utils/source'
import { castScan } from './shared/castScan'
import { nearestAngle, targetsOf } from '../utils/targets'
import type { Sim } from '../sim'

export function castProjectiles(sim: Sim): void {
  castScan(sim, Shoot, (e) => {
    const w = sim.world
    const hasVolley = hasComponent(w, e, Volley)
    const fullRing = hasVolley && Volley.spreadDeg[e]! >= 360 - 1e-9
    if (hasComponent(w, e, AimMove)) {
      const h = headingOf(sim, e)
      Aim.rad[e] = Math.atan2(h.y, h.x)
    } else if (!fullRing) {
      const range = Shoot.range[e]!
      const aim = nearestAngle(ownerX(e), ownerY(e), targetsOf(sim, sourceOf(sim, e)), range > 0 ? range : undefined)
      if (aim === null) return false
      Aim.rad[e] = aim
    }
    const aim = Aim.rad[e]!
    const damage = Math.round(Shoot.damage[e]! * damageMul(sim, e))
    const from = muzzle(sim, e)
    Shots.n[e] = Shots.n[e]! + 1
    const special = hasComponent(w, e, EveryN) && Shots.n[e]! % EveryN.n[e]! === 0
    const count = special ? EveryN.count[e]! : hasVolley ? Volley.count[e]! : 0
    const spreadDeg = special ? EveryN.spreadDeg[e]! : hasVolley ? Volley.spreadDeg[e]! : 0
    if (count > 1) {
      const full = spreadDeg >= 360 - 1e-9
      const randomRotate = !special && Volley.randomRotate[e] === 1
      const base = full && randomRotate ? random(sim, e) * Math.PI * 2 : aim
      for (let i = 0; i < count; i++) {
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
