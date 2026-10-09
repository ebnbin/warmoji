import { addComponent, addComponents, removeEntity } from 'bitecs'
import { newEntity } from './entity'
import { UNIT } from '../../util/units'
import { ACQUIRE, MINION_BODY, MINION_FIRST_SHOT_MS, SWARM_SPAN } from '../../data/abilities'
import { EMPLACE } from '../../data/feel'
import { attachDrawable } from './drawable'
import { holderSide } from './weapon'
import {
  Alive,
  AROUND,
  Built,
  Clock,
  Contact,
  Drive,
  Emplacement,
  EmplaceShape,
  Faction,
  Fired,
  Minion,
  Nest,
  Orbit,
  Owner,
  Payload,
  Phasing,
  Phys,
  Radius,
  Retiring,
  Span,
  Ctl,
  SummonShape,
  Swarmer,
  VisOff,
} from '../components'
import type { Sim } from '../sim'
import { abilityArtEmoji, abilityOnHit, bodyRules, emplaceAbility } from '../store'
import { anchorX, anchorY } from '../utils/ability'
import { abilityGroup, equipAbility } from '../entities/ability'
import { attachStats } from '../utils/stats'
import { hoverPx } from '../utils/ground'
import { liveOnes } from '../utils/turret'

interface MinionSpec {
  tag: object
  emoji: string
  size: number
  bornScale: number
  x: number
  y: number
  z: number
  lifeMs: number
}

function spawnMinion(sim: Sim, weaponEid: number, spec: MinionSpec): number {
  const m = newEntity(sim.world)
  attachDrawable(sim.world, m, sim.frames, {
    id: spec.emoji,
    side: holderSide(Faction.v[weaponEid]!),
    x: spec.x,
    y: spec.y,
    size: spec.size * spec.bornScale,
    z: spec.z,
  })
  addComponents(sim.world, m, Minion, Owner, Built, spec.tag)
  Owner.eid[m] = Owner.eid[weaponEid]!
  Built.by[m] = weaponEid
  Minion.bornMs[m] = sim.fxMs
  Minion.dieAt[m] = spec.lifeMs > 0 ? sim.elapsedMs + spec.lifeMs : 0
  Minion.size[m] = spec.size
  Minion.ability[m] = 0
  return m
}

/** 一只蜜蜂：飞在空中、无视墙的身体，绕着主人转，看见敌人就扑上去蜇一下然后消散 */
export function spawnBee(sim: Sim, e: number, index: number): void {
  const world = sim.world
  const count = SummonShape.count[e]!
  const size = SummonShape.size[e]!
  const owner = Owner.eid[e]!
  const phase = (index * Math.PI * 2) / count
  const r = SummonShape.orbitRadius[e]!
  const m = spawnMinion(sim, e, {
    tag: Swarmer,
    emoji: abilityArtEmoji[e]!,
    size,
    bornScale: 1,
    x: anchorX(e) + Math.cos(phase) * r,
    y: anchorY(e) + Math.sin(phase) * r,
    z: 12,
    lifeMs: SummonShape.lifeMs[e]!,
  })
  addComponents(world, m, Phys, Drive, Clock, Radius, Span, Faction, Alive, Ctl, Nest, Orbit, Contact, Phasing)
  Phys.vx[m] = 0
  Phys.vy[m] = 0
  Phys.drag[m] = MINION_BODY.drag
  Phys.mass[m] = MINION_BODY.mass
  Phys.grip[m] = MINION_BODY.grip
  Drive.x[m] = 0
  Drive.y[m] = 0
  Clock.v[m] = 0
  Radius.v[m] = size * 0.35
  Span.lo[m] = SWARM_SPAN[0]
  Span.hi[m] = SWARM_SPAN[1]
  Faction.v[m] = Faction.v[e]!
  Alive.v[m] = 1
  attachStats(world, m, { moveSpeed: SummonShape.speed[e]! / UNIT })
  Ctl.move[m] = 1
  Ctl.act[m] = 1
  Nest.of[m] = owner
  Nest.nextSpawnAt[m] = 0
  Orbit.radius[m] = r
  Orbit.spin[m] = SummonShape.orbitSpin[e]!
  Orbit.aggro[m] = 0
  Orbit.seek[m] = ACQUIRE.range * UNIT
  Orbit.fresh[m] = 1
  Orbit.around[m] = AROUND.nest
  Contact.damage[m] = Payload.damage[e]!
  Contact.knockback[m] = Payload.knockback[e]!
  Contact.vanish[m] = 1
  bodyRules[m] = { onTouch: abilityOnHit[e] }
  VisOff.y[m] = -hoverPx(m)
}

/** 装置退场：先撤它的能力（连同轮换的各式与连段的各段），再缩小淡出 */
export function retireEmplacement(sim: Sim, t: number): void {
  addComponent(sim.world, t, Retiring)
  Retiring.until[t] = sim.fxMs + EMPLACE.retireMs
  const a = Minion.ability[t]!
  if (a !== 0) {
    for (const x of abilityGroup(sim, a)) removeEntity(sim.world, x)
    Minion.ability[t] = 0
  }
}

/** 架一座装置：一个固定身体，带着定义里那条能力，所有者仍是施法者 */
export function place(sim: Sim, e: number, at?: { x: number; y: number }, lifeMs = 0): void {
  const live = liveOnes(sim, e)
  const m = spawnMinion(sim, e, {
    tag: Emplacement,
    emoji: abilityArtEmoji[e]!,
    size: EmplaceShape.size[e]!,
    bornScale: 0.2,
    x: at ? at.x : anchorX(e),
    y: at ? at.y : anchorY(e) + 6,
    z: 5,
    lifeMs,
  })
  addComponent(sim.world, m, Fired)
  Fired.v[m] = 0
  const def = emplaceAbility[e]!
  const a = equipAbility(sim, m, def, Faction.v[e]!, MINION_FIRST_SHOT_MS, { owner: Owner.eid[e]! })
  Minion.ability[m] = a
  let over = live.length + 1 - EmplaceShape.maxAlive[e]!
  while (over-- > 0) {
    let oldest = -1
    for (const o of live) if (oldest < 0 || Minion.bornMs[o]! < Minion.bornMs[oldest]!) oldest = o
    if (oldest < 0) break
    retireEmplacement(sim, oldest)
    live.splice(live.indexOf(oldest), 1)
  }
}
