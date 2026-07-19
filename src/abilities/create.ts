import type { AbilityDef } from './defs'
import { AreaBlastAbility } from './AreaBlastAbility'
import { AssassinateAbility } from './AssassinateAbility'
import { BoomerangAbility } from './BoomerangAbility'
import { BuffAbility } from './BuffAbility'
import { ChainArcAbility } from './ChainArcAbility'
import { DanceAbility } from './DanceAbility'
import { HealAbility } from './HealAbility'
import { LaserAbility } from './LaserAbility'
import { NukeAbility } from './NukeAbility'
import { ProjectileAbility } from './ProjectileAbility'
import { RallyAbility } from './RallyAbility'
import { SlowAuraAbility } from './SlowAuraAbility'
import { StrikeAbility } from './StrikeAbility'
import { SummonAbility } from './SummonAbility'
import { SweepAbility } from './SweepAbility'
import { ThrustAbility } from './ThrustAbility'
import { TurretAbility } from './TurretAbility'
import type { AbilityContext, AbilityRuntime } from './types'

export function createAbility(
  def: AbilityDef,
  ctx: AbilityContext,
  initialCooldownMs: number,
): AbilityRuntime {
  switch (def.kind) {
    case 'thrust':
      return new ThrustAbility(def, ctx, initialCooldownMs)
    case 'projectile':
      return new ProjectileAbility(def, ctx, initialCooldownMs)
    case 'sweep':
      return new SweepAbility(def, ctx, initialCooldownMs)
    case 'areaBlast':
      return new AreaBlastAbility(def, ctx, initialCooldownMs)
    case 'boomerang':
      return new BoomerangAbility(def, ctx, initialCooldownMs)
    case 'laser':
      return new LaserAbility(def, ctx, initialCooldownMs)
    case 'slowAura':
      return new SlowAuraAbility(def, ctx, initialCooldownMs)
    case 'assassinate':
      return new AssassinateAbility(def, ctx, initialCooldownMs)
    case 'turret':
      return new TurretAbility(def, ctx, initialCooldownMs)
    case 'summon':
      return new SummonAbility(def, ctx, initialCooldownMs)
    case 'heal':
      return new HealAbility(def, ctx, initialCooldownMs)
    case 'chainArc':
      return new ChainArcAbility(def, ctx, initialCooldownMs)
    case 'rally':
      return new RallyAbility(def, ctx, initialCooldownMs)
    case 'strike':
      return new StrikeAbility(def, ctx, initialCooldownMs)
    case 'dance':
      return new DanceAbility(def, ctx, initialCooldownMs)
    case 'buff':
      return new BuffAbility(def, ctx, initialCooldownMs)
    case 'nuke':
      return new NukeAbility(def, ctx, initialCooldownMs)
  }
}
