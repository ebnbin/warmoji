import type { WeaponSpec } from './spec'
import { AreaBlastWeapon } from './AreaBlastWeapon'
import { AssassinateWeapon } from './AssassinateWeapon'
import { BoomerangWeapon } from './BoomerangWeapon'
import { ChainArcWeapon } from './ChainArcWeapon'
import { HealWeapon } from './HealWeapon'
import { LaserWeapon } from './LaserWeapon'
import { ProjectileWeapon } from './ProjectileWeapon'
import { SlowAuraWeapon } from './SlowAuraWeapon'
import { SummonWeapon } from './SummonWeapon'
import { SweepWeapon } from './SweepWeapon'
import { ThrustWeapon } from './ThrustWeapon'
import { TurretWeapon } from './TurretWeapon'
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
    case 'laser':
      return new LaserWeapon(spec, ctx, initialCooldownMs)
    case 'slowAura':
      return new SlowAuraWeapon(spec, ctx, initialCooldownMs)
    case 'assassinate':
      return new AssassinateWeapon(spec, ctx, initialCooldownMs)
    case 'turret':
      return new TurretWeapon(spec, ctx, initialCooldownMs)
    case 'summon':
      return new SummonWeapon(spec, ctx, initialCooldownMs)
    case 'heal':
      return new HealWeapon(spec, ctx, initialCooldownMs)
    case 'chainArc':
      return new ChainArcWeapon(spec, ctx, initialCooldownMs)
  }
}
