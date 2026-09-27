import { addComponent, addComponents, hasComponent, query, removeComponent } from 'bitecs'
import { spawnBody } from './body'
import { AI, ELITE, SPAWN } from '../../data/enemies'
import { ACQUIRE, ENEMY_BODY, MORPH } from '../../data/abilities'
import { UNIT } from '../../util/units'
import type { Point } from '../../util/vec'
import { leaderX, leaderY } from '../utils/team'
import { POP } from '../../data/feel'
import { startPop } from '../utils/pop'
import type { DriveDef, EnemyDef, NpcDef } from '../../types/enemies'
import type { OutlineKind } from '../../emoji/svg'
import { waveAt } from '../../data/waves'
import {
  Anchored,
  Anim,
  Boss,
  BreaksWalls,
  Chase,
  CoinThief,
  Contact,
  Depth,
  Despawn,
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
  Grow,
  GrowUp,
  Hp,
  Idle,
  Mount,
  MARK,
  Nest,
  Orbit,
  Phasing,
  Pop,
  Wander,
  Sprite,
  Standoff,
  TAG,
  Telegraph,
  Tint,
  Transform,
} from '../components'
import { bodyRules, enemyDef, enemyOf, bodyLook } from '../store'
import { attachResource } from './resource'
import { interrupt } from '../systems/shared/ability'
import { addMark, hasMark } from '../utils/marks'
import { foldBody, setStatLayer } from '../utils/stats'
import { spawnTelegraph, telegraphCount } from './telegraph'
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

/** 头目看得见全场，其余身体用通用索敌距离 */
function seekOf(eid: number): number {
  return Boss.v[eid] ? Infinity : ACQUIRE.range * UNIT
}

const DRIVES: { [K in keyof DriveOf]: DriveAttach<K> } = {
  chase: (sim, eid, d) => {
    addComponent(sim.world, eid, Chase)
    Chase.leader[eid] = d.at === 'leader' ? 1 : 0
    Chase.seek[eid] = seekOf(eid)
  },
  wander: (sim, eid) => addComponent(sim.world, eid, Wander),
  stay: () => {},
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
    Orbit.seek[eid] = seekOf(eid)
    Orbit.fresh[eid] = 0
  },
}

export function attachDrive<K extends keyof DriveOf>(sim: Sim, eid: number, d: DriveOf[K] & { readonly kind: K }): void {
  DRIVES[d.kind](sim, eid, d)
}

const DRIVE_COMPS = [Chase, Wander, Flee, CoinThief, Standoff, Orbit]

/** 换走法：先拆掉旧的 */
export function detachDrive(sim: Sim, eid: number): void {
  for (const c of DRIVE_COMPS) if (hasComponent(sim.world, eid, c)) removeComponent(sim.world, eid, c)
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
  const eid = spawnNpc(sim, atlas, def, x, y, hp, { elite, boss, alpha })
  enemyOf[eid] = def
  return eid
}

interface NpcOpts {
  readonly elite?: boolean
  readonly boss?: boolean
  readonly alpha?: number
  readonly faction?: number
}

/** 非玩家身体的描边：己方的按角色描，敌方的按精英与否 */
export function npcOutline(eid: number): OutlineKind {
  return Faction.v[eid] === FACTION.team ? 'player' : Elite.v[eid] || Boss.v[eid] ? 'elite' : 'enemy'
}

/** 一个非玩家身体：敌人、分身、亡仆同一条出生路径，阵营由出生时给 */
export function spawnNpc(sim: Sim, atlas: FrameIndex, def: NpcDef, x: number, y: number, hp: number, o: NpcOpts = {}): number {
  const world = sim.world
  const elite = o.elite === true
  const boss = o.boss === true
  const alpha = o.alpha ?? 1
  const faction = o.faction ?? FACTION.enemy
  const outline: OutlineKind = faction === FACTION.team ? 'player' : elite || boss ? 'elite' : 'enemy'
  const size = def.size
  const eid = spawnBody(world, {
    faction,
    x,
    y,
    radius: def.radius,
    stats: { exertion: def.exertionMul ?? 1, ...def.stats, maxHp: hp, moveSpeed: def.speed / UNIT },
    drag: ENEMY_BODY.drag,
    mass: ENEMY_BODY.mass,
    grip: ENEMY_BODY.grip,
    ownClock: false,
  })
  addComponents(world, eid, Enemy, Elite, Boss, Flash, Nest, Despawn, EDir, ETurn, Anim)
  Elite.v[eid] = elite ? 1 : 0
  Boss.v[eid] = boss ? 1 : 0
  if (def.kbImmune) addComponent(world, eid, Anchored)
  if (def.phasesWalls) addComponent(world, eid, Phasing)
  const born = sim.hooks.constrainBody(sim, eid, { x, y }, { x, y })
  Transform.x[eid] = born.x
  Transform.y[eid] = born.y
  Transform.w[eid] = size * (boss ? 0.2 : 0.3)
  Transform.h[eid] = Transform.w[eid]!
  attachDrive(sim, eid, def.drive)
  if (def.damage > 0) {
    addComponent(world, eid, Contact)
    Contact.damage[eid] = def.damage
  }
  bodyRules[eid] = def
  attachResource(world, eid, def.resource)
  if (def.breaksWalls) addComponent(world, eid, BreaksWalls)
  if (def.grow) {
    addComponent(world, eid, GrowUp)
    GrowUp.at[eid] = sim.elapsedMs + def.grow.ms
  }
  Idle.since[eid] = sim.elapsedMs
  Nest.of[eid] = -1
  Nest.nextSpawnAt[eid] = def.spawner ? sim.elapsedMs + (def.spawner.firstDelayMs ?? def.spawner.intervalMs) : 0
  const heading = sim.rng.next() * Math.PI * 2
  EDir.x[eid] = Math.cos(heading)
  EDir.y[eid] = Math.sin(heading)
  ETurn.at[eid] = sim.elapsedMs + AI.wander.spawnTurnMinMs + sim.rng.next() * AI.wander.spawnTurnJitterMs
  EnemyArm.fireDelayMs[eid] = AI.firstShot.minMs + sim.rng.next() * AI.firstShot.jitterMs
  EnemyPhase.v[eid] = sim.rng.next() * Math.PI * 2
  Sprite.frame[eid] = atlas.index(def.emoji, outline)
  armIdle(eid, def.emoji, outline, Sprite.frame[eid]!, (EnemyPhase.v[eid]! / (Math.PI * 2)) * ANIM_DEF.durMs)
  Tint.alpha[eid] = boss ? 0.2 : 0.3
  startPop(sim, eid, boss ? POP.bossMs : POP.enemyMs)
  Pop.size[eid] = size
  Grow.s0[eid] = size
  Pop.back[eid] = boss ? 1 : 0
  Pop.alpha[eid] = alpha
  Depth.z[eid] = boss ? 7 : 5
  enemyDef[eid] = def
  if (elite) setStatLayer(eid, 'elite', [ELITE.stats])
  foldBody(world, undefined, eid)
  Hp.v[eid] = Hp.max[eid]!
  if (def.mount) {
    addComponent(world, eid, Mount)
    Mount.max[eid] = Math.round(def.mount.hp * (Hp.max[eid]! / Math.max(1, def.hp)))
    Mount.hp[eid] = Mount.max[eid]!
    Mount.form[eid] = def.mount.form
  }
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

/** 敌方身体数，刷怪上限只看它 */
export function foeCount(sim: Sim): number {
  let n = 0
  for (const eid of query(sim.world, ENEMY_SET)) if (Faction.v[eid] === FACTION.enemy) n++
  return n
}

const SIGHTED_TRIES = 16

/** 从地图的刷怪点里挑落在队长通用索敌距离内的，一出生就看得见队伍；挑不到就取最后一个 */
export function sightedSpawnPoint(sim: Sim): Point {
  const reach = ACQUIRE.range * UNIT
  const lx = leaderX(sim)
  const ly = leaderY(sim)
  let p = sim.hooks.spawnPoint(sim, false)
  for (let i = 1; i < SIGHTED_TRIES; i++) {
    const d = sim.hooks.worldDelta(sim, lx, ly, p.x, p.y)
    if (d.x * d.x + d.y * d.y <= reach * reach) return p
    p = sim.hooks.spawnPoint(sim, false)
  }
  return p
}

/** 按这一场的配比预告一只敌人：forced 为真必是精英，否则有 chance 的几率 */
export function telegraphOne(sim: Sim, hpMultiplier: number, forced = false, chance = 0): void {
  const def = toPx(pickEnemy(currentMix(sim), () => sim.rng.next()))
  const elite = forced || (chance > 0 && sim.rng.next() < chance)
  const hp = Math.round(def.hp * hpMultiplier)
  const pos = sightedSpawnPoint(sim)
  spawnTelegraph(sim, def, pos.x, pos.y, hp, elite, false)
}

export function spawnBoss(sim: Sim): void {
  if (sim.over) return
  const def = toPx(bossFor(sim.mapId))
  const pos = sim.hooks.spawnPoint(sim, true)
  const t = spawnTelegraph(sim, def, pos.x, pos.y, def.hp, false, true, undefined, SPAWN.telegraphMs * 1.6)
  Telegraph.loud[t] = 1
}

export function spawnCarrier(sim: Sim, pickup: FieldPickupDef): void {
  if (sim.over) return
  if (foeCount(sim) + telegraphCount(sim) >= SPAWN.maxAlive) return
  const def = toPx(pickEnemy(currentMix(sim), () => sim.rng.next()))
  const hp = Math.round(def.hp * waveAt((sim.run.combatMs + sim.elapsedMs) / 1000).hpMultiplier)
  const pos = sightedSpawnPoint(sim)
  spawnTelegraph(sim, def, pos.x, pos.y, hp, false, false, pickup)
}

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
  addMark(eid, MARK.morphImmune, TAG.morph, until + MORPH.recastMs)
  addMark(eid, MARK.morph, TAG.morph, until, anchored ? 1 : 0)
  addMark(eid, MARK.guard, TAG.morph, until, spec.vulnMul ?? 1)
  const outline = npcOutline(eid)
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
  const outline = npcOutline(eid)
  const emoji = bodyLook[eid] ?? def.emoji
  Sprite.frame[eid] = atlas.index(emoji, outline)
  armIdle(eid, emoji, outline, Sprite.frame[eid]!, Anim.offset[eid]!)
}
