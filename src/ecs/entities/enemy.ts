import { addComponent, hasComponent, query, removeComponent } from 'bitecs'
import { newEntity } from './entity'
import { AI, ELITE, SPAWN, SURGE } from '../../data/enemies'
import { ENEMY_BODY } from '../../data/abilities'
import type { DriveDef, EnemyDef } from '../../types/enemies'
import { waveAt } from '../../data/waves'
import {
  Alive,
  Anchored,
  Anim,
  Boss,
  BreaksWalls,
  Casting,
  Chase,
  Clock,
  CoinThief,
  Contact,
  Depth,
  Despawn,
  Dormant,
  Drive,
  EDir,
  Elite,
  Enemy,
  ENEMY_SET,
  EnemyArm,
  EnemyPhase,
  ETurn,
  FACTION,
  Faction,
  Flash,
  Flee,
  Hp,
  MARK,
  Mark,
  Nest,
  Orbit,
  Phasing,
  Phys,
  Pop,
  Quad,
  Radius,
  Roam,
  RushHit,
  Rushing,
  Slowed,
  Speed,
  Sprite,
  Standoff,
  Stay,
  Steering,
  TAG,
  Thief,
  Tint,
  Transform,
  VisOff,
} from '../components'
import { bodyRules, enemyCarries, enemyDef } from '../store'
import { interrupt } from '../systems/shared/ability'
import { addMark, hasMark } from '../utils/marks'
import { spawnTelegraph, telegraphCount } from './telegraph'
import { scheduleSurge } from './schedule'
import { armIdle } from '../systems/shared/anim'
import { ANIM_DEF } from '../../emoji/anim'
import type { Sim } from '../sim'
import type { FrameIndex } from '../frames'
import { toPx } from '../../data/px'
import { bossFor, MAPS } from '../../data/maps'
import type { MapDef } from '../../types/maps'
import { hourAt, isDayAt } from '../worlds/daynight'
import type { FieldPickupDef } from '../../types/battlefield'
import { enemyMixAt, pickEnemy } from '../utils/spawnMix'
import type { ByKind } from '../../util/record'

type DriveOf = ByKind<DriveDef>

type DriveAttach<K extends keyof DriveOf> = (sim: Sim, eid: number, d: DriveOf[K]) => void

const DRIVES: { [K in keyof DriveOf]: DriveAttach<K> } = {
  chase: (sim, eid) => addComponent(sim.world, eid, Chase),
  wander: (sim, eid) => addComponent(sim.world, eid, Roam),
  stay: (sim, eid) => addComponent(sim.world, eid, Stay),
  flee: (sim, eid, d) => {
    addComponent(sim.world, eid, Flee)
    Flee.range[eid] = d.range
  },
  coinThief: (sim, eid) => addComponent(sim.world, eid, CoinThief),
  standoff: (sim, eid, d) => {
    addComponent(sim.world, eid, Standoff)
    Standoff.detectRange[eid] = d.detectRange
    Standoff.standoffDist[eid] = d.standoffDist
  },
  orbit: (sim, eid, d) => {
    addComponent(sim.world, eid, Orbit)
    Orbit.radius[eid] = d.radius
    Orbit.spin[eid] = 0
    Orbit.aggro[eid] = d.aggroRange
    Orbit.seek[eid] = Infinity
    Orbit.fresh[eid] = 0
  },
}

function attachDrive<K extends keyof DriveOf>(sim: Sim, eid: number, d: DriveOf[K] & { readonly kind: K }): void {
  DRIVES[d.kind](sim, eid, d)
}

export function spawnEnemy(
  sim: Sim,
  atlas: FrameIndex,
  def: EnemyDef,
  x: number,
  y: number,
  hp: number,
  elite: boolean,
  boss: boolean,
  alpha = 1,
): number {
  const world = sim.world
  const outline = elite || boss ? 'elite' : 'enemy'
  const size = def.size * (elite ? ELITE.sizeMul : 1)
  const eid = newEntity(world)
  addComponent(world, eid, Enemy)
  addComponent(world, eid, Alive)
  addComponent(world, eid, Transform)
  addComponent(world, eid, Speed)
  addComponent(world, eid, Hp)
  addComponent(world, eid, Elite)
  addComponent(world, eid, Boss)
  addComponent(world, eid, Radius)
  addComponent(world, eid, Mark)
  addComponent(world, eid, Phys)
  addComponent(world, eid, Drive)
  addComponent(world, eid, Clock)
  addComponent(world, eid, Faction)
  addComponent(world, eid, Rushing)
  addComponent(world, eid, Dormant)
  addComponent(world, eid, Flash)
  addComponent(world, eid, Casting)
  addComponent(world, eid, Nest)
  addComponent(world, eid, Despawn)
  addComponent(world, eid, EDir)
  addComponent(world, eid, ETurn)
  addComponent(world, eid, Slowed)
  addComponent(world, eid, Steering)
  addComponent(world, eid, Anim)
  addComponent(world, eid, Sprite)
  addComponent(world, eid, Tint)
  addComponent(world, eid, Depth)
  addComponent(world, eid, VisOff)
  if (def.kbImmune) addComponent(world, eid, Anchored)
  if (def.phasesWalls) addComponent(world, eid, Phasing)
  Radius.v[eid] = def.radius
  const born = sim.hooks.constrainBody(sim, eid, { x, y }, { x, y })
  Transform.x[eid] = born.x
  Transform.y[eid] = born.y
  Transform.rot[eid] = 0
  Transform.w[eid] = size * (boss ? 0.2 : 0.3)
  Transform.h[eid] = Transform.w[eid]!
  Speed.v[eid] = def.speed
  Hp.v[eid] = hp
  Hp.max[eid] = hp
  Casting.until[eid] = 0
  Casting.telegraph[eid] = 0
  Phys.vx[eid] = 0
  Phys.vy[eid] = 0
  Phys.thrust[eid] = def.speed * ENEMY_BODY.drag
  Phys.drag[eid] = ENEMY_BODY.drag
  Phys.mass[eid] = ENEMY_BODY.mass
  Phys.grip[eid] = ENEMY_BODY.grip
  Drive.x[eid] = 0
  Drive.y[eid] = 0
  Clock.v[eid] = 0
  Faction.v[eid] = FACTION.enemy
  Rushing.active[eid] = 0
  Slowed.v[eid] = 1
  Steering.v[eid] = 0
  attachDrive(sim, eid, def.drive)
  if (def.damage > 0) {
    addComponent(world, eid, Contact)
    Contact.damage[eid] = def.damage
    Contact.knockback[eid] = 0
    Contact.vanish[eid] = 0
  }
  bodyRules[eid] = def
  if (def.breaksWalls) addComponent(world, eid, BreaksWalls)
  Despawn.at[eid] = 0
  Thief.eaten[eid] = 0
  Thief.nextEatAt[eid] = 0
  enemyCarries[eid] = undefined
  Elite.v[eid] = elite ? 1 : 0
  Boss.v[eid] = boss ? 1 : 0
  if (elite) {
    addMark(eid, MARK.dmg, TAG.elite, Infinity, ELITE.damageMul)
    addMark(eid, MARK.speed, TAG.elite, Infinity, ELITE.speedMul)
  }
  Nest.of[eid] = -1
  Nest.nextSpawnAt[eid] = def.spawner ? sim.elapsedMs + (def.spawner.firstDelayMs ?? def.spawner.intervalMs) : 0
  Dormant.v[eid] = 0
  Dormant.since[eid] = 0
  EnemyArm.armed[eid] = 0
  Alive.v[eid] = 1
  Flash.until[eid] = 0
  const heading = sim.rng.next() * Math.PI * 2
  EDir.x[eid] = Math.cos(heading)
  EDir.y[eid] = Math.sin(heading)
  ETurn.at[eid] = sim.elapsedMs + AI.wander.spawnTurnMinMs + sim.rng.next() * AI.wander.spawnTurnJitterMs
  EnemyArm.fireDelayMs[eid] = 900 + sim.rng.next() * 1500
  EnemyPhase.v[eid] = sim.rng.next() * Math.PI * 2
  RushHit.stamp[eid] = -1
  Sprite.frame[eid] = atlas.index(def.emoji, outline)
  Sprite.flipX[eid] = 0
  armIdle(eid, def.emoji, outline, Sprite.frame[eid]!, (EnemyPhase.v[eid]! / (Math.PI * 2)) * ANIM_DEF.durMs)
  Tint.color[eid] = 0xffffff
  Tint.effect[eid] = 0
  Tint.alpha[eid] = boss ? 0.2 : 0.3
  Pop.until[eid] = sim.elapsedMs + (boss ? 320 : 130)
  Pop.ms[eid] = boss ? 320 : 130
  Pop.size[eid] = size
  Pop.back[eid] = boss ? 1 : 0
  Pop.alpha[eid] = alpha
  Depth.z[eid] = boss ? 7 : 5
  Quad.v[eid] = 0
  enemyDef[eid] = def
  return eid
}

export function spawnBrood(
  sim: Sim,
  atlas: FrameIndex,
  into: EnemyDef,
  count: number,
  cx: number,
  cy: number,
  scatter: number,
  ownerEid: number,
): void {
  const hpMul = waveAt((sim.run.combatMs + sim.elapsedMs) / 1000).hpMultiplier
  for (let i = 0; i < count; i++) {
    const ang = sim.rng.next() * Math.PI * 2
    const child = spawnEnemy(
      sim,
      atlas,
      into,
      cx + Math.cos(ang) * scatter,
      cy + Math.sin(ang) * scatter,
      Math.round(into.hp * hpMul),
      false,
      false,
    )
    if (ownerEid >= 0) Nest.of[child] = ownerEid
  }
}

export function dayNightOf(sim: Sim): { cfg: NonNullable<MapDef['dayNight']>; hour: number } | undefined {
  const cfg = MAPS[sim.mapId].dayNight
  if (!cfg) return undefined
  return { cfg, hour: hourAt((sim.run.combatMs + sim.elapsedMs) / 1000, cfg) }
}

function currentMix(sim: Sim): ReturnType<typeof enemyMixAt> {
  const m = MAPS[sim.mapId]
  const dn = dayNightOf(sim)
  const rows = dn ? ((isDayAt(dn.hour) ? m.dayMix : m.nightMix) ?? m.mix) : m.mix
  return enemyMixAt(rows, sim.run.wave)
}

export function awakeCount(sim: Sim): number {
  let n = 0
  for (const eid of query(sim.world, ENEMY_SET)) if (!Dormant.v[eid]) n++
  return n
}

export function telegraphOne(sim: Sim, hpMultiplier: number, forceElite = false): void {
  const def = toPx(pickEnemy(currentMix(sim), () => sim.rng.next()))
  const elite = !sim.sandbox && (forceElite || (sim.run.wave >= ELITE.fromWave && sim.rng.next() < ELITE.chance))
  const hp = Math.round(def.hp * hpMultiplier * (elite ? ELITE.hpMul : 1))
  const pos = sim.hooks.spawnPoint(sim, false)
  spawnTelegraph(sim, def, pos.x, pos.y, hp, elite, false)
}

export function spawnSurge(sim: Sim): void {
  if (sim.over) return
  const hpMul = waveAt((sim.run.combatMs + sim.elapsedMs) / 1000).hpMultiplier
  for (let i = 0; i < SURGE.count; i++) {
    scheduleSurge(sim, sim.elapsedMs + (i * SURGE.spreadMs) / SURGE.count, hpMul, i < SURGE.elites)
  }
}

export function spawnBoss(sim: Sim): void {
  if (sim.over) return
  const def = toPx(bossFor(sim.mapId))
  const pos = sim.hooks.spawnPoint(sim, true)
  spawnTelegraph(sim, def, pos.x, pos.y, def.hp, false, true, undefined, SPAWN.telegraphMs * 1.6)
}

export function spawnCarrier(sim: Sim, pickup: FieldPickupDef): void {
  if (sim.over) return
  if (awakeCount(sim) + telegraphCount(sim) >= SPAWN.maxAlive) return
  const def = toPx(pickEnemy(currentMix(sim), () => sim.rng.next()))
  const hp = Math.round(def.hp * waveAt((sim.run.combatMs + sim.elapsedMs) / 1000).hpMultiplier)
  const pos = sim.hooks.spawnPoint(sim, false)
  spawnTelegraph(sim, def, pos.x, pos.y, hp, false, false, pickup)
}

const MORPH_RECAST_CD = 5000

/** 变形：换外观、打断动作、解除锚定并记在标记里；变形期间与结束后一段时间免疫再次变形；脆弱是同期的承伤标记 */
export function applyMorph(
  sim: Sim,
  atlas: FrameIndex,
  eid: number,
  spec: { durationMs: number; morphEmoji: string; vulnMul?: number },
): void {
  if (Boss.v[eid] || hasMark(sim, eid, MARK.morphImmune)) return
  const until = sim.elapsedMs + spec.durationMs
  const anchored = hasComponent(sim.world, eid, Anchored)
  addMark(eid, MARK.morphImmune, TAG.morph, until + MORPH_RECAST_CD)
  addMark(eid, MARK.morph, TAG.morph, until, anchored ? 1 : 0)
  addMark(eid, MARK.guard, TAG.morph, until, spec.vulnMul ?? 1)
  const outline = Elite.v[eid] ? 'elite' : 'enemy'
  Sprite.frame[eid] = atlas.index(spec.morphEmoji, outline)
  armIdle(eid, spec.morphEmoji, outline, Sprite.frame[eid]!, Anim.offset[eid]!)
  interrupt(sim, eid)
  Transform.rot[eid] = 0
  if (anchored) removeComponent(sim.world, eid, Anchored)
  sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 8, kind: 'puff' })
}

/** 变形到期：外观换回，曾锚定的重新锚定 */
export function restoreMorph(sim: Sim, atlas: FrameIndex, eid: number, anchored: boolean): void {
  const def = enemyDef[eid]
  if (!def) return
  if (anchored) addComponent(sim.world, eid, Anchored)
  const outline = Elite.v[eid] ? 'elite' : 'enemy'
  Sprite.frame[eid] = atlas.index(def.emoji, outline)
  armIdle(eid, def.emoji, outline, Sprite.frame[eid]!, Anim.offset[eid]!)
}
