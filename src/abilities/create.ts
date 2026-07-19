import type { AbilitySpec } from './spec'
import { AreaBlastAbility } from './AreaBlastAbility'
import { AssassinateAbility } from './AssassinateAbility'
import { BoomerangAbility } from './BoomerangAbility'
import { ChainArcAbility } from './ChainArcAbility'
import { HealAbility } from './HealAbility'
import { LaserAbility } from './LaserAbility'
import { ProjectileAbility } from './ProjectileAbility'
import { SlowAuraAbility } from './SlowAuraAbility'
import { SummonAbility } from './SummonAbility'
import { SweepAbility } from './SweepAbility'
import { ThrustAbility } from './ThrustAbility'
import { TurretAbility } from './TurretAbility'
import type { AbilityContext, AbilityRuntime } from './types'

export function createAbility(
  spec: AbilitySpec,
  ctx: AbilityContext,
  initialCooldownMs: number,
): AbilityRuntime {
  switch (spec.kind) {
    case 'thrust':
      return new ThrustAbility(spec, ctx, initialCooldownMs)
    case 'projectile':
      return new ProjectileAbility(spec, ctx, initialCooldownMs)
    case 'sweep':
      return new SweepAbility(spec, ctx, initialCooldownMs)
    case 'areaBlast':
      return new AreaBlastAbility(spec, ctx, initialCooldownMs)
    case 'boomerang':
      return new BoomerangAbility(spec, ctx, initialCooldownMs)
    case 'laser':
      return new LaserAbility(spec, ctx, initialCooldownMs)
    case 'slowAura':
      return new SlowAuraAbility(spec, ctx, initialCooldownMs)
    case 'assassinate':
      return new AssassinateAbility(spec, ctx, initialCooldownMs)
    case 'turret':
      return new TurretAbility(spec, ctx, initialCooldownMs)
    case 'summon':
      return new SummonAbility(spec, ctx, initialCooldownMs)
    case 'heal':
      return new HealAbility(spec, ctx, initialCooldownMs)
    case 'chainArc':
      return new ChainArcAbility(spec, ctx, initialCooldownMs)
  }
}
