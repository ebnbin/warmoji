import type { SfxId } from './sfx'
import type { GroundEffectDef } from './groundEffects'

interface ProjectileSpec {
  readonly emoji: string
  readonly size: number
  readonly radius: number
  readonly speed: number
  readonly rotationOffsetDeg: number
}
export interface HeldVisual {
  readonly emoji: string
  readonly size: number
  readonly restOffset: number
  readonly rotationOffsetDeg: number
  readonly mountSide?: -1 | 1
  readonly mountGap?: number
}
interface BlastRing {
  readonly color: number
  readonly fillAlpha: number
  readonly lineWidth: number
  readonly lineAlpha: number
  readonly durMs: number
}
interface BlastEffect {
  readonly kind: 'blast'
  readonly radius: number
  readonly ratio: number
  readonly knockback: number
  readonly ring?: BlastRing
}
interface SlowEffect {
  readonly kind: 'slow'
  readonly factor: number
  readonly durationMs: number
}
interface PoisonEffect {
  readonly kind: 'poison'
  readonly damage: number
  readonly tickMs: number
  readonly durationMs: number
}
interface GroundZone {
  readonly kind: 'ground'
  readonly def: GroundEffectDef
}
interface MorphEffect {
  readonly kind: 'morph'
  readonly durationMs: number
  readonly morphEmoji: string
  readonly vulnMul?: number
}
interface SpawnProjectileEffect {
  readonly kind: 'spawnProjectile'
  readonly projectile: ProjectileSpec
  readonly damage: number
  readonly lifeMs: number
  readonly aim: 'nearest'
}
interface HealEffect {
  readonly kind: 'heal'
  readonly range: number
  readonly amount: number
  readonly all?: boolean
}
interface AttackSlowEffect {
  readonly kind: 'attackSlow'
  readonly mul: number
  readonly durationMs: number
}
export type Effect =
  | BlastEffect
  | SlowEffect
  | PoisonEffect
  | GroundZone
  | MorphEffect
  | SpawnProjectileEffect
  | HealEffect
  | AttackSlowEffect
export interface ThrustDef {
  readonly kind: 'thrust'
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  readonly reach: number
  readonly hitRadius: number
  readonly thrustMs: number
  readonly lungeDist: number
  readonly held?: HeldVisual
  readonly combo?: { readonly delayMs: number }
  readonly onHit?: readonly Effect[]
}
export interface ProjectileDef {
  readonly kind: 'projectile'
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  readonly aim?: 'nearest' | 'move'
  readonly range?: number
  readonly lifeMs: number
  readonly firstDelayMs?: number
  readonly fireSfx?: SfxId
  readonly held?: HeldVisual
  readonly projectile: ProjectileSpec
  readonly volley?: { readonly count: number; readonly spreadDeg: number; readonly randomRotate?: boolean }
  readonly everyN?: { readonly n: number; readonly count: number; readonly spreadDeg: number }
  readonly pierce?: number
  readonly onHit?: readonly Effect[]
}
export interface SweepDef {
  readonly kind: 'sweep'
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  readonly radius: number
  readonly arcDeg: number
  readonly sweepMs: number
  readonly held: HeldVisual
  readonly onHit?: readonly Effect[]
}
export interface AreaBlastDef {
  readonly kind: 'areaBlast'
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  readonly detectRange: number
  readonly blastRadius: number
  readonly color: number
  readonly onHit?: readonly Effect[]
  readonly echo?: { readonly delayMs: number; readonly ratio: number }
}
export interface BoomerangDef {
  readonly kind: 'boomerang'
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  readonly range: number
  readonly outMs: number
  readonly returnSpeed: number
  readonly hitRadius: number
  readonly spinDegPerSec: number
  readonly held: HeldVisual
  readonly twin?: boolean
  readonly coinMagnetRadius?: number
}
export interface LaserDef {
  readonly kind: 'laser'
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  readonly range: number
  readonly beamRadius: number
  readonly color: number
  readonly held: HeldVisual
  readonly backBeam?: boolean
  readonly radial?: { readonly beams: number; readonly ratio: number; readonly stepMs: number }
  readonly piercesWalls?: boolean
}
export interface SlowAuraDef {
  readonly kind: 'slowAura'
  readonly radius: number
  readonly slowFactor: number
  readonly color: number
  readonly dps?: number
  readonly freeze?: { readonly intervalMs: number; readonly durationMs: number }
}
export interface AssassinateDef {
  readonly kind: 'assassinate'
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  readonly range: number
  readonly behindDist: number
  readonly strikeMs: number
  readonly held?: HeldVisual
  readonly onHit?: readonly Effect[]
  readonly execute?: { readonly hpRatio: number; readonly mul: number }
}
export interface TurretDef {
  readonly kind: 'turret'
  readonly placeIntervalMs: number
  readonly maxTurrets: number
  readonly turret: { readonly emoji: string; readonly size: number }
  readonly fireIntervalMs: number
  readonly damage: number
  readonly knockback: number
  readonly range: number
  readonly lifeMs: number
  readonly projectile: ProjectileSpec
  readonly burst?: { readonly count: number; readonly spreadDeg: number }
}
export interface SummonDef {
  readonly kind: 'summon'
  readonly count: number
  readonly minion: { readonly emoji: string; readonly size: number; readonly speed: number }
  readonly damage: number
  readonly knockback: number
  readonly intervalMs: number
  readonly lifeMs: number
  readonly onHit?: readonly Effect[]
}
export interface HealDef {
  readonly kind: 'heal'
  readonly amount: number
  readonly cooldownMs: number
  readonly range: number
  readonly aoe?: { readonly ratio: number }
  readonly defib?: { readonly reviveCutMs: number }
}
export interface ChainArcDef {
  readonly kind: 'chainArc'
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  readonly range: number
  readonly arcRange: number
  readonly bounces: number
  readonly decay: number
  readonly color: number
  readonly onHit?: readonly Effect[]
}
export interface RallyDef {
  readonly kind: 'rally'
  readonly cooldownMs: number
  readonly healRatio: number
  readonly invulnMs: number
  readonly ringRadius: number
  readonly color: number
}
export interface StrikeDef {
  readonly kind: 'strike'
  readonly damage: number
  readonly cooldownMs: number
  readonly knockback: number
  readonly targets: number
  readonly coinsPerHit?: number
  readonly drop: {
    readonly emoji: string
    readonly size: number
    readonly fromAbove: number
    readonly dropMs: number
    readonly staggerMs: number
  }
}
export interface DanceDef {
  readonly kind: 'dance'
  readonly cooldownMs: number
  readonly durationMs: number
}
export interface BuffDef {
  readonly kind: 'buff'
  readonly cooldownMs: number
  readonly damageMul: number
  readonly durationMs: number
}
export interface NukeDef {
  readonly kind: 'nuke'
  readonly damage: number
  readonly cooldownMs: number
  readonly bossRatio: number
}
export interface TimeStopDef {
  readonly kind: 'timeStop'
  readonly cooldownMs: number
  readonly durationMs: number
}
export type AbilityDef =
  | ThrustDef
  | ProjectileDef
  | SweepDef
  | AreaBlastDef
  | BoomerangDef
  | LaserDef
  | SlowAuraDef
  | AssassinateDef
  | TurretDef
  | SummonDef
  | HealDef
  | ChainArcDef
  | RallyDef
  | StrikeDef
  | DanceDef
  | BuffDef
  | NukeDef
  | TimeStopDef
