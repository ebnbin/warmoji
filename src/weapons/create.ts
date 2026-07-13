import type { WeaponSpec } from '../core/weapons'
import { AreaBlastWeapon } from './AreaBlastWeapon'
import { BoomerangWeapon } from './BoomerangWeapon'
import { ProjectileWeapon } from './ProjectileWeapon'
import { SweepWeapon } from './SweepWeapon'
import { ThrustWeapon } from './ThrustWeapon'
import type { WeaponContext, WeaponRuntime } from './types'

export function createWeapon(
  spec: WeaponSpec,
  ctx: WeaponContext,
  initialCooldownMs: number,
): WeaponRuntime {
  switch (spec.kind) {
    case 'thrust':
      return new ThrustWeapon(spec, ctx, initialCooldownMs)
    case 'projectile':
      return new ProjectileWeapon(spec, ctx, initialCooldownMs)
    case 'sweep':
      return new SweepWeapon(spec, ctx, initialCooldownMs)
    case 'areaBlast':
      return new AreaBlastWeapon(spec, ctx, initialCooldownMs)
    case 'boomerang':
      return new BoomerangWeapon(spec, ctx, initialCooldownMs)
  }
}
