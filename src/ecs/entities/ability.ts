import { addComponent, addComponents, query, removeEntity } from 'bitecs'
import { newEntity } from './entity'
import {
  Ability,
  AIM,
  Aim,
  ALL_OF,
  AllShape,
  Amp,
  Anchor,
  Aura,
  BlinkShape,
  BlinkState,
  Bolt,
  Cd,
  Chain,
  Disarmed,
  DISC_AT,
  DISC_OF,
  Disc,
  Drop,
  DropShape,
  EmplaceShape,
  FACTION,
  Faction,
  Flyer,
  FlyerShape,
  Frozen,
  LeapShape,
  LOCK_AT,
  Manual,
  Minion,
  Owner,
  Payload,
  REAIM,
  Repeat,
  RepeatState,
  Sector,
  Segment,
  Shots,
  SprintShape,
  SummonShape,
  Swing,
  TELEGRAPH,
  Thrown,
  WallBlocked,
  Windup,
  WindupState,
  WorldShape,
  ZoneFollow,
  ZoneShape,
} from '../components'
import { abilityArtEmoji, abilityFireSfx, abilityOnHit, abilityOnSelf, abilityPulse, emplaceAbility } from '../store'
import type { AbilityDef, Shape } from '../../types/abilityDefs'
import { ACQUIRE, abilityPiercesWalls } from '../../data/abilities'
import { UNIT } from '../../util/units'
import { spawnWeaponBody } from './weapon'
import type { Sim } from '../sim'
import type { ByKind } from '../../util/record'

type ShapeOf = ByKind<Shape>

interface ShapeSpec<K extends keyof ShapeOf> {
  readonly comps: readonly object[]
  attach(sim: Sim, e: number, s: ShapeOf[K], faction: number): void
}

const SHAPES: { [K in keyof ShapeOf]: ShapeSpec<K> } = {
  bolt: {
    comps: [Bolt, Shots],
    attach: (sim, e, s, faction) => {
      Bolt.frame[e] = sim.frames.index(s.projectile.emoji, faction === FACTION.enemy ? 'enemyProjectile' : 'player')
      Bolt.size[e] = s.projectile.size
      Bolt.radius[e] = s.projectile.radius
      Bolt.speed[e] = s.projectile.speed
      Bolt.rotOffset[e] = s.projectile.rotationOffsetDeg
      Bolt.lifeMs[e] = s.lifeMs
      Bolt.pierce[e] = s.pierce ?? 0
    },
  },
  segment: {
    comps: [Segment, Swing],
    attach: (_sim, e, s) => {
      Segment.reach[e] = s.reach
      Segment.radius[e] = s.radius
      Segment.ms[e] = s.ms
      Segment.lunge[e] = s.lungeDist ?? 0
      Segment.beam[e] = s.beam ? 1 : 0
    },
  },
  sector: {
    comps: [Sector, Swing],
    attach: (_sim, e, s) => {
      Sector.radius[e] = s.radius
      Sector.arcDeg[e] = s.arcDeg
      Sector.ms[e] = s.ms
    },
  },
  disc: {
    comps: [Disc],
    attach: (_sim, e, s) => {
      Disc.radius[e] = s.radius
      Disc.at[e] = DISC_AT[s.at]
      Disc.of[e] = DISC_OF[s.of ?? 'foes']
    },
  },
  chain: {
    comps: [Chain],
    attach: (_sim, e, s) => {
      Chain.hops[e] = s.hops
      Chain.hopRange[e] = s.hopRange
      Chain.decay[e] = s.decay
    },
  },
  flyer: {
    comps: [FlyerShape, Thrown],
    attach: (_sim, e, s) => {
      FlyerShape.range[e] = s.range
      FlyerShape.outMs[e] = s.outMs
      FlyerShape.returnSpeed[e] = s.returnSpeed
      FlyerShape.radius[e] = s.radius
      FlyerShape.spinDegPerSec[e] = s.spinDegPerSec
      FlyerShape.coinMagnet[e] = s.coinMagnetRadius ?? 0
    },
  },
  drop: {
    comps: [DropShape],
    attach: (_sim, e, s) => {
      DropShape.targets[e] = s.targets
      DropShape.size[e] = s.size
      DropShape.fromAbove[e] = s.fromAbove
      DropShape.dropMs[e] = s.dropMs
      DropShape.staggerMs[e] = s.staggerMs
      abilityArtEmoji[e] = s.emoji
    },
  },
  blink: {
    comps: [BlinkShape, BlinkState],
    attach: (_sim, e, s) => {
      BlinkShape.behindDist[e] = s.behindDist
      BlinkShape.strikeMs[e] = s.strikeMs
      BlinkShape.execHp[e] = s.execute?.hpRatio ?? 0
      BlinkShape.execMul[e] = s.execute?.mul ?? 1
    },
  },
  sprint: {
    comps: [SprintShape],
    attach: (_sim, e, s) => {
      SprintShape.distance[e] = s.distance
      SprintShape.ms[e] = s.ms
      SprintShape.radius[e] = s.radius ?? 0
    },
  },
  leap: {
    comps: [LeapShape],
    attach: (_sim, e, s) => {
      LeapShape.distance[e] = s.distance
      LeapShape.ms[e] = s.ms
      LeapShape.height[e] = s.height
      LeapShape.radius[e] = s.radius
    },
  },
  all: {
    comps: [AllShape],
    attach: (_sim, e, s) => {
      AllShape.of[e] = ALL_OF[s.of]
      AllShape.downed[e] = s.downed ? 1 : 0
    },
  },
  zone: {
    comps: [ZoneShape, Aura],
    attach: (_sim, e, s) => {
      ZoneShape.radius[e] = s.radius
      ZoneShape.durationMs[e] = s.durationMs
      ZoneShape.tickMs[e] = s.tickMs ?? 0
      ZoneShape.mend[e] = s.mend ?? 0
      ZoneShape.follow[e] = s.follow ? 1 : 0
      ZoneShape.pulseMs[e] = s.pulse?.intervalMs ?? 0
      ZoneShape.enterMs[e] = s.visual.enterMs
      ZoneShape.fillAlpha[e] = s.visual.fillAlpha
      ZoneShape.lineAlpha[e] = s.visual.lineAlpha
      ZoneShape.lineWidth[e] = s.visual.lineWidth
      ZoneShape.color[e] = s.visual.color
      abilityPulse[e] = s.pulse?.onHit
    },
  },
  summon: {
    comps: [SummonShape],
    attach: (_sim, e, s) => {
      SummonShape.count[e] = s.count
      SummonShape.size[e] = s.minion.size
      SummonShape.speed[e] = s.minion.speed
      SummonShape.lifeMs[e] = s.lifeMs
      SummonShape.orbitRadius[e] = s.minion.orbit.radius
      SummonShape.orbitSpin[e] = s.minion.orbit.spinRadPerSec
      abilityArtEmoji[e] = s.minion.emoji
    },
  },
  emplace: {
    comps: [EmplaceShape],
    attach: (_sim, e, s) => {
      EmplaceShape.count[e] = s.count
      EmplaceShape.spread[e] = s.spread ?? 0
      EmplaceShape.maxAlive[e] = s.maxAlive
      EmplaceShape.lifeMs[e] = s.lifeMs
      EmplaceShape.size[e] = s.turret.size
      abilityArtEmoji[e] = s.turret.emoji
      emplaceAbility[e] = s.ability
    },
  },
  world: { comps: [WorldShape], attach: () => {} },
}

/** 未指明索敌距离时，近战形状只在够得着时出手，空袭不限远，其余用通用索敌距离 */
function shapeRange(s: Shape): number {
  if (s.kind === 'segment') return s.reach + s.radius
  if (s.kind === 'sector') return s.radius
  if (s.kind === 'drop') return Infinity
  return ACQUIRE.range * UNIT
}

function attachShape<K extends keyof ShapeOf>(sim: Sim, e: number, s: ShapeOf[K] & { readonly kind: K }, faction: number): void {
  SHAPES[s.kind].attach(sim, e, s, faction)
}

interface AmpInit {
  dmg: number
  cd: number
  crit: number
  kb: number
  battle: boolean
}

export const NEUTRAL_AMP: AmpInit = { dmg: 1, cd: 1, crit: 0, kb: 1, battle: false }

interface AbilityInit {
  owner: number
  anchor: number
  faction: number
  cooldownMs: number
  amp: AmpInit
  manual: boolean
}

/** 每条能力住在自己的实体里：持械的住在武器身体上，其余住在空实体上；宿主是所有者，锚点是出手位置 */
function attachAbility(sim: Sim, e: number, def: AbilityDef, init: AbilityInit): void {
  const world = sim.world
  const spec = SHAPES[def.shape.kind]
  addComponents(world, e, Ability, Owner, Anchor, Faction, Amp, Frozen, Disarmed, WallBlocked, Cd, Aim, Payload, ...spec.comps)
  if (init.manual) addComponent(world, e, Manual)
  Owner.eid[e] = init.owner
  Anchor.eid[e] = init.anchor
  Faction.v[e] = init.faction
  Cd.left[e] = init.cooldownMs
  Cd.base[e] = def.trigger === 'auto' ? def.cooldownMs : 0
  Amp.dmg[e] = init.amp.dmg
  Amp.cd[e] = init.amp.cd
  Amp.crit[e] = init.amp.crit
  Amp.kb[e] = init.amp.kb
  Amp.battle[e] = init.amp.battle ? 1 : 0
  Frozen.v[e] = 0
  Disarmed.v[e] = 0
  WallBlocked.v[e] = init.manual || abilityPiercesWalls(def) ? 0 : 1
  Aim.kind[e] = AIM[def.aim]
  Aim.rad[e] = 0
  Aim.range[e] = def.range ?? shapeRange(def.shape)
  Payload.damage[e] = def.damage ?? 0
  Payload.knockback[e] = def.knockback ?? 0
  Payload.bossRatio[e] = def.bossRatio ?? 1
  Payload.waveScale[e] = def.waveScale ? 1 : 0
  Payload.color[e] = def.color ?? 0
  Payload.fxRadius[e] = def.fxRadius ?? 0
  if (def.repeat) {
    addComponents(world, e, Repeat, RepeatState)
    Repeat.count[e] = def.repeat.count
    Repeat.spreadDeg[e] = def.repeat.spreadDeg ?? 0
    Repeat.delayMs[e] = def.repeat.delayMs ?? 0
    Repeat.ratio[e] = def.repeat.ratio ?? 1
    Repeat.everyN[e] = def.repeat.everyN ?? 0
    Repeat.reaim[e] = REAIM[def.repeat.reaim ?? 'same']
  }
  if (def.windup) {
    addComponents(world, e, Windup, WindupState)
    Windup.ms[e] = def.windup.ms
    Windup.lockAt[e] = LOCK_AT[def.windup.lockAt]
    Windup.telegraph[e] = TELEGRAPH[def.windup.telegraph]
    WindupState.until[e] = 0
    WindupState.angle[e] = 0
  }
  abilityOnHit[e] = def.onHit
  abilityOnSelf[e] = def.onSelf
  abilityFireSfx[e] = def.fireSfx
  attachShape(sim, e, def.shape, init.faction)
}

export function equipAbility(
  sim: Sim,
  host: number,
  def: AbilityDef,
  faction: number,
  cooldownMs: number,
  amp: AmpInit,
  opts: { manual?: boolean; owner?: number } = {},
): number {
  const e = def.held ? spawnWeaponBody(sim, host, def.held, faction) : newEntity(sim.world)
  attachAbility(sim, e, def, { owner: opts.owner ?? host, anchor: host, faction, cooldownMs, amp, manual: opts.manual === true })
  return e
}

/** 主动技能：所有者与锚点都是宿主，由附身者按键触发 */
export function equipSkill(sim: Sim, host: number, def: AbilityDef, amp: AmpInit): number {
  return equipAbility(sim, host, def, FACTION.team, 0, amp, { manual: true })
}

/** 撤掉一个身体的全部能力，连同它们造出来的场、召唤物、飞返体、坠物 */
export function unequipAbilities(sim: Sim, ownerEid: number): void {
  const world = sim.world
  const owned: number[] = []
  for (const e of query(world, [Ability, Owner])) if (Owner.eid[e] === ownerEid) owned.push(e)
  for (const d of [...query(world, [Drop, Owner])]) if (owned.includes(Owner.eid[d]!)) removeEntity(world, d)
  for (const z of [...query(world, [ZoneFollow, Owner])]) if (owned.includes(Owner.eid[z]!)) removeEntity(world, z)
  for (const m of [...query(world, [Minion, Owner])]) if (Owner.eid[m] === ownerEid) removeEntity(world, m)
  for (const f of [...query(world, [Flyer])]) if (owned.includes(Flyer.of[f]!)) removeEntity(world, f)
  for (const e of owned) {
    abilityOnHit[e] = undefined
    abilityOnSelf[e] = undefined
    abilityPulse[e] = undefined
    abilityArtEmoji[e] = undefined
    abilityFireSfx[e] = undefined
    emplaceAbility[e] = undefined
    removeEntity(world, e)
  }
}
