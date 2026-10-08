import { addComponent, addComponents, hasComponent, query, removeComponent } from 'bitecs'
import { spawnBody } from './body'
import { AI, ELITE, ENEMIES, SPAWN, TENACITY } from '../../data/enemies'
import { ACQUIRE, ENEMY_BODY, MORPH } from '../../data/abilities'
import { UNIT } from '../../util/units'
import type { Point } from '../../util/vec'
import { leaderX, leaderY } from '../utils/team'
import { POP } from '../../data/feel'
import { startPop } from '../utils/pop'
import type { DriveDef, EnemyDef, EnemyKind, EnemyMixEntry, NpcDef } from '../../types/enemies'
import type { StatMods } from '../../types/stats'
import type { OutlineKind } from '../../emoji/svg'
import {
  Anchored,
  Anim,
  Boss,
  Bounty,
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
  March,
  Mount,
  MARK,
  Nest,
  Orbit,
  Phasing,
  Pop,
  Radius,
  Ring,
  Wander,
  Sprite,
  Standoff,
  TAG,
  Telegraph,
  Tint,
  Transform,
  VisOff,
} from '../components'
import { bodyRules, enemyDef, enemyLoot, enemyOf, bodyLook, marchMark } from '../store'
import { attachResource } from './resource'
import { interrupt } from '../systems/shared/ability'
import { attachTenacity } from '../systems/shared/tenacity'
import { addMark, hasMark } from '../utils/marks'
import { foldBody, setStatLayer } from '../utils/stats'
import { spawnTelegraph } from './telegraph'
import { gateEntry } from '../worlds/gates'
import type { Entry } from '../worlds/gates'
import type { SpawnTraits } from './telegraph'
import { armIdle } from '../systems/shared/anim'
import { STANDARD } from '../utils/pass'
import { hoverPx } from '../utils/ground'
import { ANIM_DEF } from '../../emoji/anim'
import type { Sim } from '../sim'
import type { FrameIndex } from '../frames'
import { toPx } from '../../data/px'
import { bossFor, MAPS } from '../../data/maps'
import { pickEnemy } from '../utils/spawnMix'
import { rollCarry } from '../utils/battleFx'
import { fightMods } from '../fight/state'
import type { FoeSpec } from '../fight/state'
import { clockWave } from '../fight/clock'
import type { ByKind } from '../../util/record'
import { rulesOf } from '../../data/reactions'

type DriveOf = ByKind<DriveDef>

/** 敌人与 Boss 同在一档，每帧按脚底相对队长的上下排：越靠下越靠前，离队长再远也不出这一档 */
export const ENEMY_Z = 5
const ENEMY_Z_SPAN = 0.45
const ENEMY_Z_RANGE_U = 30

/** dyU 是脚底在队长下方多少格 */
export function enemyZ(dyU: number): number {
  return ENEMY_Z + Math.max(-ENEMY_Z_SPAN, Math.min(ENEMY_Z_SPAN, (dyU / ENEMY_Z_RANGE_U) * ENEMY_Z_SPAN))
}

type DriveAttach<K extends keyof DriveOf> = (sim: Sim, eid: number, d: DriveOf[K]) => void

/** 头目看得见全场，其余身体用通用索敌距离 */
function seekOf(eid: number): number {
  return Boss.v[eid] ? Infinity : ACQUIRE.range * UNIT
}

const DRIVES: { [K in keyof DriveOf]: DriveAttach<K> } = {
  chase: (sim, eid, d) => {
    addComponent(sim.world, eid, Chase)
    Chase.leader[eid] = d.at === 'leader' || (sim.fight.def.chaseLeader && Faction.v[eid] === FACTION.enemy) ? 1 : 0
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
  march: (sim, eid, d) => {
    addComponent(sim.world, eid, March)
    marchMark[eid] = d.mark
  },
}

export function attachDrive<K extends keyof DriveOf>(sim: Sim, eid: number, d: DriveOf[K] & { readonly kind: K }): void {
  DRIVES[d.kind](sim, eid, d)
}

const DRIVE_COMPS = [Chase, Wander, Flee, CoinThief, Standoff, Orbit, March]

/** 换走法：先拆掉旧的 */
export function detachDrive(sim: Sim, eid: number): void {
  for (const c of DRIVE_COMPS) if (hasComponent(sim.world, eid, c)) removeComponent(sim.world, eid, c)
}

/** 一只敌人：带上关卡给这一批的属性修正、盯着队长与战利品倍率 */
export function spawnEnemy(
  sim: Sim,
  atlas: FrameIndex,
  def: EnemyDef,
  x: number,
  y: number,
  hp: number,
  elite: boolean,
  boss: boolean,
  traits: SpawnTraits = {},
): number {
  const eid = spawnNpc(sim, atlas, def, x, y, hp, { elite, boss, group: traits.stats, huntLeader: traits.huntLeader })
  enemyOf[eid] = def
  enemyLoot[eid] = traits.loot
  return eid
}

/** group 是关卡给这一批的属性修正，huntLeader 让追人的盯着队长 */
interface NpcOpts {
  readonly elite?: boolean
  readonly boss?: boolean
  readonly alpha?: number
  readonly faction?: number
  readonly group?: StatMods
  readonly huntLeader?: boolean
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
    span: def.span ?? STANDARD,
    stats: { ...def.stats, maxHp: hp, moveSpeed: def.speed / UNIT },
    drag: ENEMY_BODY.drag,
    mass: ENEMY_BODY.mass,
    grip: ENEMY_BODY.grip,
    ownClock: false,
  })
  addComponents(world, eid, Enemy, Elite, Boss, Flash, Nest, Despawn, EDir, ETurn, Anim)
  Elite.v[eid] = elite ? 1 : 0
  Boss.v[eid] = boss ? 1 : 0
  if (boss || elite) attachTenacity(world, eid, boss ? TENACITY.boss : TENACITY.elite)
  if (def.kbImmune) addComponent(world, eid, Anchored)
  if (def.phasesWalls) addComponent(world, eid, Phasing)
  const born = sim.hooks.constrainBody(sim, eid, { x, y }, { x, y })
  Transform.x[eid] = born.x
  Transform.y[eid] = born.y
  VisOff.y[eid] = -hoverPx(eid)
  Transform.w[eid] = size * (boss ? 0.2 : 0.3)
  Transform.h[eid] = Transform.w[eid]!
  attachDrive(sim, eid, def.drive)
  if (o.huntLeader && hasComponent(world, eid, Chase)) Chase.leader[eid] = 1
  if (def.damage > 0) {
    addComponent(world, eid, Contact)
    Contact.damage[eid] = def.damage
  }
  bodyRules[eid] = rulesOf(def)
  attachResource(world, eid, def.resource)
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
  Depth.z[eid] = ENEMY_Z
  enemyDef[eid] = def
  if (elite) setStatLayer(eid, 'elite', [ELITE.stats])
  setStatLayer(eid, 'fight', fightMods(sim.fight, faction))
  setStatLayer(eid, 'group', o.group ? [o.group] : undefined)
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
  const hpMul = clockWave(sim).hpMultiplier
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

/** 这一阶段的配比，不写就在这张图出没的小怪里平均抽 */
function currentMix(sim: Sim): readonly EnemyMixEntry[] {
  return sim.fight.mix ?? MAPS[sim.mapId].foes.map((kind) => ({ def: ENEMIES[kind], weight: 1 }))
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

/** 身后散开的扇面有多宽 */
const BEHIND_ARC = 1.2

/** 一只敌人的站位：不写（或指定的出怪口这张图没有）就是看得见队伍的刷怪点，头目在远处；围圈按它在队里的次序均分一圈，身后按次序排成扇面 */
function foeSpot(sim: Sim, foe: FoeSpec, boss: boolean): Point {
  const at = foe.at
  if (!at || at.kind === 'gate') return boss ? sim.hooks.spawnPoint(sim, true) : sightedSpawnPoint(sim)
  const index = foe.index ?? 0
  const count = foe.count ?? 1
  switch (at.kind) {
    case 'far':
      return sim.hooks.spawnPoint(sim, true)
    case 'ring': {
      const a = (foe.phase ?? 0) + (Math.PI * 2 * index) / count
      return sim.hooks.settle(sim, { x: leaderX(sim) + Math.cos(a) * at.dist * UNIT, y: leaderY(sim) + Math.sin(a) * at.dist * UNIT })
    }
    case 'behind': {
      const a = Math.atan2(-sim.heading.y, -sim.heading.x) + (count > 1 ? (index / (count - 1) - 0.5) * BEHIND_ARC : 0)
      return sim.hooks.settle(sim, { x: leaderX(sim) + Math.cos(a) * at.dist * UNIT, y: leaderY(sim) + Math.sin(a) * at.dist * UNIT })
    }
  }
}

/** 预兆打在落点上，entry 是它从哪个出怪口、怎么进场 */
export interface Spot extends Point {
  readonly entry: Entry
}

/** 一只敌人在哪预兆、从哪进场：先按站位定点，再交给出怪口去定 */
export function placeFoe(sim: Sim, foe: FoeSpec, kind: EnemyKind, boss: boolean): Spot {
  const entry = gateEntry(sim, foe.at, kind, boss, () => foeSpot(sim, foe, boss))
  return { x: entry.x, y: entry.y, entry }
}

/** 按要求预告一只敌人：种类不指定就按它这一批的配比抽，再没有就按这一阶段的；要带效果的从地图的效果池里抽；头目预告得久、现身时轰一声 */
export function telegraphOne(sim: Sim, foe: FoeSpec): void {
  const raw = foe.enemy ?? pickEnemy(foe.mix ?? currentMix(sim), () => sim.rng.next())
  const def = toPx(raw)
  const boss = raw.role === 'boss'
  const chance = foe.chance ?? 0
  const elite = !boss && (foe.elite === true || (chance > 0 && sim.rng.next() < chance))
  const hp = Math.round(def.hp * foe.hpMul)
  const pos = placeFoe(sim, foe, raw.kind, boss)
  const carries = foe.carry ? rollCarry(sim.mapId, foe.carry, () => sim.rng.next()) : undefined
  const traits: SpawnTraits = { stats: foe.stats, huntLeader: foe.huntLeader, loot: foe.loot, carries }
  const t = spawnTelegraph(sim, def, pos.x, pos.y, hp, elite, boss, traits, boss ? SPAWN.telegraphMs * 1.6 : SPAWN.telegraphMs, pos.entry)
  if (boss) Telegraph.loud[t] = 1
  if (foe.bounty) {
    addComponent(sim.world, t, Bounty)
    sim.fight.bounties++
  }
}

const BOUNTY_COLOR = 0xff5252

/** 悬赏目标：带上标记，脚下一圈红光 */
export function markBounty(sim: Sim, eid: number): void {
  addComponents(sim.world, eid, Bounty, Ring)
  Ring.color[eid] = BOUNTY_COLOR
  Ring.radius[eid] = Radius.v[eid]! * 1.6 + 0.3 * UNIT
  Ring.fillAlpha[eid] = 0.14
  Ring.lineAlpha[eid] = 0.95
  Ring.lineWidth[eid] = 3
  Ring.born[eid] = sim.fxMs
  Ring.dy[eid] = 0
  Ring.z[eid] = 4
  Ring.breathe[eid] = 1
}

export function spawnBoss(sim: Sim): void {
  if (sim.over) return
  const raw = bossFor(sim.mapId)
  const def = toPx(raw)
  const pos = placeFoe(sim, { hpMul: 1 }, raw.kind, true)
  const t = spawnTelegraph(sim, def, pos.x, pos.y, def.hp, false, true, {}, SPAWN.telegraphMs * 1.6, pos.entry)
  Telegraph.loud[t] = 1
}

/** 变形：换外观、打断动作、解除锚定并记在标记里；变形期间与结束后一段时间免疫再次变形；脆弱是同期的易伤 */
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
  if (spec.vulnMul !== undefined) addMark(eid, MARK.exposed, TAG.morph, until, spec.vulnMul)
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
