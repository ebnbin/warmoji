import type { WeaponSpec } from '../core/weapons'
import { ProjectileWeapon } from './ProjectileWeapon'
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
  }
}
