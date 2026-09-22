import { addComponent, addEntity, query } from 'bitecs'
import { AI, ELITE, SPAWN, SURGE } from '../../data/enemies'
import type { EnemyDef, LocomotionDef } from '../../types/enemies'
import { waveAt } from '../../data/waves'
import {
  Alive,
  Anim,
  BaseOrbit,
  Boss,
  BreaksWalls,
  BVel,
  Chase,
  CoinThief,
  Dash,
  DashDetect,
  DashDist,
  DashTime,
  DashTimer,
  Detonate,
  Flee,
  Roam,
  Slowed,
  Standoff,
  Stationary,
  Steering,
  Charge,
  Depth,
  Despawn,
  DmgMul,
  Dormant,
  EDir,
  Elite,
  Enemy,
  ENEMY_SET,
  EnemyArm,
  EnemyPhase,
  EState,
  ETurn,
  Flash,
  Hp,
  Kv,
  Morph,
  Nest,
  Orphan,
  Poison,
  Pop,
  Quad,
  Radius,
  Slide,
  Slow,
  Speed,
  SpMul,
  Sprite,
  Thief,
  Tint,
  Transform,
} from '../components'
import { enemyCarries, enemyDef } from '../store'
import { spawnTelegraph, telegraphCount } from './telegraph'
import { scheduleSurge } from './schedule'
import { armIdle } from '../systems/shared/anim'
import { ANIM_DEF } from '../../emoji/anim'
import type { Sim } from '../sim'
import type { FrameIndex } from '../frames'
import { crowded } from '../world'
import { toPx } from '../../data/px'
import { bossFor, MAPS } from '../../data/maps'
import type { MapDef } from '../../types/maps'
import { hourAt, isDayAt } from '../worlds/daynight'
import type { FieldPickupDef } from '../../types/battlefield'
import { enemyMixAt, pickEnemy } from '../utils/spawnMix'





/** locomotion.kind 只在此读一次 */
type LocoAttach<K extends LocomotionDef['kind']> = (
  sim: Sim,
  eid: number,
  lm: Extract<LocomotionDef, { kind: K }>,
) => void
const LOCOMOTIONS: { [K in LocomotionDef['kind']]: LocoAttach<K> } = {
  chase: (sim, eid) => addComponent(sim.world, eid, Chase),
  wander: (sim, eid) => addComponent(sim.world, eid, Roam),
  static: (sim, eid) => addComponent(sim.world, eid, Stationary),
  flee: (sim, eid, lm) => {
    addComponent(sim.world, eid, Flee)
    Flee.range[eid] = lm.range
  },
  coinThief: (sim, eid) => addComponent(sim.world, eid, CoinThief),
  standoff: (sim, eid, lm) => {
    addComponent(sim.world, eid, Standoff)
    Standoff.detectRange[eid] = lm.detectRange
    Standoff.standoffDist[eid] = lm.standoffDist
  },
  detonate: (sim, eid, lm) => {
    addComponent(sim.world, eid, Detonate)
    Detonate.triggerRange[eid] = lm.triggerRange
    Detonate.windupMs[eid] = lm.windupMs
    Detonate.blastRadius[eid] = lm.blastRadius
    Detonate.blastDamage[eid] = lm.blastDamage
    // def.knockback 无人读，不抄
  },
  baseOrbit: (sim, eid, lm) => {
    addComponent(sim.world, eid, BaseOrbit)
    BaseOrbit.orbitRadius[eid] = lm.orbitRadius
    BaseOrbit.aggroRange[eid] = lm.aggroRange
    addComponent(sim.world, eid, Orphan)
    Orphan.speedMul[eid] = lm.orphanSpeedMul
    Orphan.damageMul[eid] = lm.orphanDamageMul
  },
  dash: (sim, eid, lm) => {
    addComponent(sim.world, eid, Dash)
    Dash.windupMs[eid] = lm.windupMs
    Dash.dashSpeed[eid] = lm.dashSpeed
    Dash.idleChase[eid] = lm.idle === 'chase' ? 1 : 0
    Dash.aimTeamCenter[eid] = lm.aim === 'teamCenter' ? 1 : 0
    Dash.lockAtLaunch[eid] = lm.lockAt === 'launch' ? 1 : 0
    Dash.whoosh[eid] = lm.sfx ? 1 : 0
    EState.v[eid] = lm.idle === 'chase' ? 1 : 0
    if (lm.trigger.kind === 'timer') {
      addComponent(sim.world, eid, DashTimer)
      DashTimer.intervalMs[eid] = lm.trigger.intervalMs
      Charge.nextDashAt[eid] = sim.elapsedMs + (lm.trigger.firstDelayMs ?? lm.trigger.intervalMs)
    } else {
      addComponent(sim.world, eid, DashDetect)
      DashDetect.range[eid] = lm.trigger.range
      DashDetect.cooldownMs[eid] = lm.trigger.cooldownMs
    }
    if (lm.length.kind === 'time') {
      addComponent(sim.world, eid, DashTime)
      DashTime.durationMs[eid] = lm.length.durationMs
    } else {
      addComponent(sim.world, eid, DashDist)
      DashDist.dist[eid] = lm.length.dist
    }
  },
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
  /** 目标透明度，入场弹入收敛到它 */
  alpha = 1,
): number {
  const world = sim.world
  const outline = elite || boss ? 'elite' : 'enemy'
  const size = def.size * (elite ? ELITE.sizeMul : 1)
  const eid = addEntity(world)
  addComponent(world, eid, Enemy)
  addComponent(world, eid, Alive)
  addComponent(world, eid, Transform)
  addComponent(world, eid, Speed)
  addComponent(world, eid, Hp)
  addComponent(world, eid, EState)
  addComponent(world, eid, Elite)
  addComponent(world, eid, Boss)
  addComponent(world, eid, Radius)
  addComponent(world, eid, DmgMul)
  addComponent(world, eid, SpMul)
  addComponent(world, eid, Kv)
  addComponent(world, eid, Slide)
  addComponent(world, eid, Dormant)
  addComponent(world, eid, Flash)
  addComponent(world, eid, Slow)
  addComponent(world, eid, Poison)
  addComponent(world, eid, Charge)
  addComponent(world, eid, Despawn)
  addComponent(world, eid, Morph)
  addComponent(world, eid, EDir)
  addComponent(world, eid, ETurn)
  // 走位系统的 query 认这几个，漏挂则敌人不动
  addComponent(world, eid, BVel)
  addComponent(world, eid, Slowed)
  addComponent(world, eid, Steering)
  addComponent(world, eid, Anim)
  addComponent(world, eid, Sprite)
  addComponent(world, eid, Tint)
  addComponent(world, eid, Depth)
  const born = sim.hooks.constrainSpawn(sim, x, y, def.radius)
  Transform.x[eid] = born.x
  Transform.y[eid] = born.y
  Transform.rot[eid] = 0
  Transform.w[eid] = size * (boss ? 0.2 : 0.3)
  Transform.h[eid] = Transform.w[eid]!
  Speed.v[eid] = def.speed
  Hp.v[eid] = hp
  Hp.max[eid] = hp
  EState.v[eid] = 0
  Charge.windupUntil[eid] = 0
  Charge.dashUntil[eid] = 0
  Charge.coolUntil[eid] = 0
  Charge.nextDashAt[eid] = 0
  BVel.x[eid] = 0
  BVel.y[eid] = 0
  Slowed.v[eid] = 1
  Steering.v[eid] = 0
  ;(LOCOMOTIONS[def.locomotion.kind] as LocoAttach<LocomotionDef['kind']>)(sim, eid, def.locomotion)
  if (def.breaksWalls) addComponent(world, eid, BreaksWalls)
  Despawn.at[eid] = 0
  Morph.until[eid] = 0
  Morph.vuln[eid] = 1
  Morph.cdUntil[eid] = 0
  Thief.eaten[eid] = 0
  Thief.nextEatAt[eid] = 0
  enemyCarries[eid] = undefined // 携带者由 spawnCarrier 落地后覆写
  Elite.v[eid] = elite ? 1 : 0
  Boss.v[eid] = boss ? 1 : 0
  Radius.v[eid] = def.radius
  DmgMul.v[eid] = elite ? ELITE.damageMul : 1
  SpMul.v[eid] = elite ? ELITE.speedMul : 1
  Nest.of[eid] = -1 // spawnBrood 会覆盖为巢 eid
  Nest.nextSpawnAt[eid] = def.spawner ? sim.elapsedMs + (def.spawner.firstDelayMs ?? def.spawner.intervalMs) : 0
  Kv.x[eid] = 0
  Kv.y[eid] = 0
  Slide.x[eid] = 0
  Slide.y[eid] = 0
  Dormant.v[eid] = 0
  EnemyArm.armed[eid] = 0 // eid 复用:新实体须重新装配能力
  Alive.v[eid] = 1
  Flash.until[eid] = 0
  Slow.until[eid] = 0
  Slow.mul[eid] = 1
  Poison.until[eid] = 0
  EDir.x[eid] = Math.cos(sim.rng.next() * Math.PI * 2)
  EDir.y[eid] = Math.sin(sim.rng.next() * Math.PI * 2)
  ETurn.at[eid] = sim.elapsedMs + AI.wander.spawnTurnMinMs + sim.rng.next() * AI.wander.spawnTurnJitterMs
  EnemyArm.fireDelayMs[eid] = 900 + sim.rng.next() * 1500
  EnemyPhase.v[eid] = sim.rng.next() * Math.PI * 2
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

/** ownerEid ≥ 0 记为护巢子敌；分裂用 -1 */
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
    if (crowded(sim.world)) return
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

// ── 刷怪 ──

/** 非昼夜图为 undefined */
export function dayNightOf(sim: Sim): { cfg: NonNullable<MapDef['dayNight']>; hour: number } | undefined {
  const cfg = MAPS[sim.mapId].dayNight
  if (!cfg) return undefined
  return { cfg, hour: hourAt((sim.run.combatMs + sim.elapsedMs) / 1000, cfg) }
}

export function currentMix(sim: Sim): ReturnType<typeof enemyMixAt> {
  const m = MAPS[sim.mapId]
  const dn = dayNightOf(sim)
  const rows = dn ? ((isDayAt(dn.hour) ? m.dayMix : m.nightMix) ?? m.mix) : m.mix
  return enemyMixAt(rows, sim.run.wave)
}

/** 休眠者不计 */
export function awakeCount(sim: Sim): number {
  let n = 0
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) if (!Dormant.v[eid]) n++
  return n
}

/** forceElite 强制精英 */
export function telegraphOne(sim: Sim, hpMultiplier: number, forceElite = false): void {
  const def = toPx(pickEnemy(currentMix(sim), () => sim.rng.next()))
  const elite = !sim.sandbox && (forceElite || (sim.run.wave >= ELITE.fromWave && sim.rng.next() < ELITE.chance))
  const hp = Math.round(def.hp * hpMultiplier * (elite ? ELITE.hpMul : 1))
  const pos = sim.hooks.spawnPoint(sim, false)
  spawnTelegraph(sim, def, pos.x, pos.y, hp, elite, false)
}

/** 只排何时出；落点与出怪表到点才算 */
export function spawnSurgeEcs(sim: Sim): void {
  if (sim.over) return
  const hpMul = waveAt((sim.run.combatMs + sim.elapsedMs) / 1000).hpMultiplier
  for (let i = 0; i < SURGE.count; i++) {
    scheduleSurge(sim, sim.elapsedMs + (i * SURGE.spreadMs) / SURGE.count, hpMul, i < SURGE.elites)
  }
}

export function spawnBossEcs(sim: Sim): void {
  if (sim.over) return
  const def = toPx(bossFor(sim.mapId))
  const pos = sim.hooks.spawnPoint(sim, true)
  spawnTelegraph(sim, def, pos.x, pos.y, def.hp, false, true, undefined, SPAWN.telegraphMs * 1.6)
}

/** 场上过挤则跳过 */
export function spawnCarrierEcs(sim: Sim, pickup: FieldPickupDef): void {
  if (sim.over) return
  if (awakeCount(sim) + telegraphCount(sim) >= SPAWN.maxAlive) return
  const def = toPx(pickEnemy(currentMix(sim), () => sim.rng.next()))
  const hp = Math.round(def.hp * waveAt((sim.run.combatMs + sim.elapsedMs) / 1000).hpMultiplier)
  const pos = sim.hooks.spawnPoint(sim, false)
  spawnTelegraph(sim, def, pos.x, pos.y, hp, false, false, pickup)
}

// ── 魔尘变形 ──

/** 变形 + 复形冷却 */
export const MORPH_RECAST_CD = 5000

/** Boss 或冷却中拒绝 */
export function applyMorph(
  sim: Sim,
  atlas: FrameIndex,
  eid: number,
  spec: { durationMs: number; morphEmoji: string; vulnMul?: number },
): void {
  if (Boss.v[eid]) return
  if (sim.elapsedMs < Morph.cdUntil[eid]!) return
  const wasMorphed = Morph.until[eid] !== 0
  const until = sim.elapsedMs + spec.durationMs
  Morph.cdUntil[eid] = until + MORPH_RECAST_CD
  Morph.until[eid] = until
  Morph.vuln[eid] = spec.vulnMul ?? 1
  if (!wasMorphed) {
    const outline = Elite.v[eid] ? 'elite' : 'enemy'
    Sprite.frame[eid] = atlas.index(spec.morphEmoji, outline)
    armIdle(eid, spec.morphEmoji, outline, Sprite.frame[eid]!, Anim.offset[eid]!)
    if (EState.v[eid] === 2) {
      Tint.effect[eid] = 0
      Tint.color[eid] = 0xffffff
    }
    EState.v[eid] = 0
    Transform.rot[eid] = 0
    sim.out.bursts.push({ x: Transform.x[eid]!, y: Transform.y[eid]!, count: 8, kind: 'puff' })
  }
}

export function restoreMorphVisual(atlas: FrameIndex, eid: number): void {
  const def = enemyDef[eid]
  if (!def) return
  const outline = Elite.v[eid] ? 'elite' : 'enemy'
  Sprite.frame[eid] = atlas.index(def.emoji, outline)
  armIdle(eid, def.emoji, outline, Sprite.frame[eid]!, Anim.offset[eid]!)
  Morph.until[eid] = 0
}
