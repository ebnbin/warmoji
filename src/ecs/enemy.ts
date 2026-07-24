import { addComponent, addEntity, query } from 'bitecs'
import { norm } from '../core/vec'
import { AI, ELITE, SPAWN } from '../enemies/registry'
import type { EnemyDef } from '../enemies/registry'
import { KNOCKBACK } from '../abilities/registry'
import { waveAt } from '../run/waves'
import { UNIT } from '../core/units'
import { playSfx } from '../audio/sfx'
import { despawnEnemy, hurtMember } from './combat'
import {
  Alive,
  Boss,
  Charge,
  Depth,
  Despawn,
  DmgMul,
  EDir,
  Elite,
  Enemy,
  ENEMY_SET,
  EState,
  ETurn,
  Flash,
  Hp,
  Kv,
  Poison,
  Radius,
  Slow,
  Speed,
  SpMul,
  Sprite,
  Tint,
  Transform,
} from './components'
import { enemyDef, enemyFireDelayMs, enemyNest, enemyNextSpawnAt, enemyVelX, enemyVelY } from './store'
import type { Sim } from './sim'
import type { EcsAtlas } from './render/atlas'
import type { Point } from '../core/vec'

// 敌人(P3):装配 + 转向。P3a 先做 chase(直奔最近活着的队员)+ 有界钳制;
// 全部 locomotion/状态机/战斗/死亡效果在后续增量追加。

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

/** 装配一个敌人实体(px 化 def),返回 eid */
export function spawnEnemy(
  sim: Sim,
  atlas: EcsAtlas,
  def: EnemyDef,
  x: number,
  y: number,
  hp: number,
  elite: boolean,
  boss: boolean,
): number {
  const world = sim.world
  const outline = elite || boss ? 'elite' : 'enemy'
  const size = def.size * (elite ? ELITE.sizeMul : 1)
  const eid = addEntity(world)
  addComponent(world, eid, Enemy)
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
  addComponent(world, eid, Flash)
  addComponent(world, eid, Slow)
  addComponent(world, eid, Poison)
  addComponent(world, eid, Charge)
  addComponent(world, eid, Despawn)
  addComponent(world, eid, EDir)
  addComponent(world, eid, ETurn)
  addComponent(world, eid, Sprite)
  addComponent(world, eid, Tint)
  addComponent(world, eid, Depth)
  Transform.x[eid] = x
  Transform.y[eid] = y
  Transform.rot[eid] = 0
  Transform.w[eid] = size
  Transform.h[eid] = size
  Speed.v[eid] = def.speed
  Hp.v[eid] = hp
  Hp.max[eid] = hp
  const lm = def.locomotion
  EState.v[eid] = lm.kind === 'dash' && lm.idle === 'chase' ? 1 : 0
  Charge.windupUntil[eid] = 0
  Charge.dashUntil[eid] = 0
  Charge.coolUntil[eid] = 0
  Charge.nextDashAt[eid] =
    lm.kind === 'dash' && lm.trigger.kind === 'timer'
      ? sim.elapsedMs + (lm.trigger.firstDelayMs ?? lm.trigger.intervalMs)
      : 0
  Despawn.at[eid] = 0
  Elite.v[eid] = elite ? 1 : 0
  Boss.v[eid] = boss ? 1 : 0
  Radius.v[eid] = def.radius
  DmgMul.v[eid] = elite ? ELITE.damageMul : 1
  SpMul.v[eid] = elite ? ELITE.speedMul : 1
  enemyNest[eid] = -1 // 非护巢子敌(spawnBrood 会覆盖为巢 eid)
  enemyNextSpawnAt[eid] = def.spawner ? sim.elapsedMs + (def.spawner.firstDelayMs ?? def.spawner.intervalMs) : 0
  Kv.x[eid] = 0
  Kv.y[eid] = 0
  Flash.until[eid] = 0
  Slow.until[eid] = 0
  Slow.mul[eid] = 1
  Poison.until[eid] = 0
  // 游荡初始方向 + 首次换向(镜像 materializeEnemy 的随机相/换向计时)
  EDir.x[eid] = Math.cos(sim.rng.next() * Math.PI * 2)
  EDir.y[eid] = Math.sin(sim.rng.next() * Math.PI * 2)
  ETurn.at[eid] = sim.elapsedMs + AI.wander.spawnTurnMinMs + sim.rng.next() * AI.wander.spawnTurnJitterMs
  // 首发延迟(镜像 materializeEnemy 的 fireAt;lazy-arm 时喂入能力初始冷却)
  enemyFireDelayMs[eid] = 900 + sim.rng.next() * 1500
  Sprite.frame[eid] = atlas.index(def.emoji, outline)
  Sprite.flipX[eid] = 0
  Tint.color[eid] = 0xffffff
  Tint.effect[eid] = 0
  Tint.alpha[eid] = 1
  Depth.z[eid] = boss ? 7 : 5
  enemyDef[eid] = def
  return eid
}

/** 最近活着的队员位置(镜像 nearestAlive) */
function nearestAlive(sim: Sim, x: number, y: number): Point | null {
  let best = -1
  let bestD = Infinity
  for (const eid of sim.members) {
    if (!Alive.v[eid]) continue
    const dx = Transform.x[eid]! - x
    const dy = Transform.y[eid]! - y
    const d = dx * dx + dy * dy
    if (d < bestD) {
      bestD = d
      best = eid
    }
  }
  return best >= 0 ? { x: Transform.x[best]!, y: Transform.y[best]! } : null
}

/** 把敌人位置汇入 frameTargets(供队伍 orbit/游移门控) */
export function updateFrameTargets(sim: Sim): void {
  const eids = query(sim.world, ENEMY_SET as unknown as object[])
  const out: Point[] = []
  for (const eid of eids) out.push({ x: Transform.x[eid]!, y: Transform.y[eid]! })
  sim.frameTargets = out
}

/** 游荡方向(镜像 ArenaScene.wanderDir:换向计时 + 撞边折返;断壁在 P5) */
function wanderDir(sim: Sim, eid: number): Point {
  if (sim.elapsedMs >= ETurn.at[eid]!) {
    const ang = sim.rng.next() * Math.PI * 2
    EDir.x[eid] = Math.cos(ang)
    EDir.y[eid] = Math.sin(ang)
    ETurn.at[eid] = sim.elapsedMs + AI.wander.turnMinMs + sim.rng.next() * AI.wander.turnJitterMs
  }
  let dx = EDir.x[eid]!
  let dy = EDir.y[eid]!
  const margin = 0.6 * UNIT
  const x = Transform.x[eid]!
  const y = Transform.y[eid]!
  if ((x < margin && dx < 0) || (x > sim.mapW - margin && dx > 0)) dx = -dx
  if ((y < margin && dy < 0) || (y > sim.mapH - margin && dy > 0)) dy = -dy
  EDir.x[eid] = dx
  EDir.y[eid] = dy
  return { x: dx, y: dy }
}

/** 锁定冲刺方向(朝最近队员或队伍中心) */
function lockDashDir(sim: Sim, eid: number, aim: 'nearest' | 'teamCenter'): void {
  const to = aim === 'teamCenter' ? sim.center : nearestAlive(sim, Transform.x[eid]!, Transform.y[eid]!)
  if (!to) return
  const dir = norm(to.x - Transform.x[eid]!, to.y - Transform.y[eid]!)
  EDir.x[eid] = dir.x
  EDir.y[eid] = dir.y
}

/** 统一冲刺状态机(镜像 dash steerer):蓄力→冲刺(锁向直冲)→冷却/回到 idle 移动。
 * 返回本帧速度(px/s);脚本化姿态(颤动/前倾/tint)为视觉,P6 补 */
function steerDash(sim: Sim, eid: number, slow: number): { vx: number; vy: number } {
  const lm = enemyDef[eid]!.locomotion
  if (lm.kind !== 'dash') return { vx: 0, vy: 0 }
  const now = sim.elapsedMs
  const state = EState.v[eid]!
  const ex = Transform.x[eid]!
  const ey = Transform.y[eid]!
  if (state === 2) {
    // windup:定身;到时进冲刺
    if (now >= Charge.windupUntil[eid]!) {
      if (lm.lockAt === 'launch') lockDashDir(sim, eid, lm.aim)
      EState.v[eid] = 3
      Charge.dashUntil[eid] =
        now + (lm.length.kind === 'time' ? lm.length.durationMs : (lm.length.dist / lm.dashSpeed) * 1000)
    }
    return { vx: 0, vy: 0 }
  }
  if (state === 3) {
    // dash:锁向直冲;到时冷却/回追
    if (now >= Charge.dashUntil[eid]!) {
      if (lm.trigger.kind === 'timer') {
        EState.v[eid] = 1
        Charge.nextDashAt[eid] = now + lm.trigger.intervalMs
      } else {
        EState.v[eid] = 4
        Charge.coolUntil[eid] = now + lm.trigger.cooldownMs
      }
    }
    return { vx: EDir.x[eid]! * lm.dashSpeed * slow, vy: EDir.y[eid]! * lm.dashSpeed * slow }
  }
  // 触发判定
  if (lm.trigger.kind === 'timer') {
    if (now >= Charge.nextDashAt[eid]!) {
      EState.v[eid] = 2
      Charge.windupUntil[eid] = now + lm.windupMs
      return { vx: 0, vy: 0 }
    }
  } else {
    const target = nearestAlive(sim, ex, ey)
    if (target) {
      const dx = target.x - ex
      const dy = target.y - ey
      if (state !== 4 && dx * dx + dy * dy <= lm.trigger.range * lm.trigger.range) {
        if (lm.lockAt === 'windup') lockDashDir(sim, eid, lm.aim)
        EState.v[eid] = 2
        Charge.windupUntil[eid] = now + lm.windupMs
        return { vx: 0, vy: 0 }
      }
    }
    if (state === 4 && now >= Charge.coolUntil[eid]!) EState.v[eid] = 0
  }
  // idle 移动
  const speed = Speed.v[eid]! * slow
  if (lm.idle === 'chase') {
    const to = lm.aim === 'teamCenter' ? sim.center : nearestAlive(sim, ex, ey)
    if (!to) return { vx: 0, vy: 0 }
    const dir = norm(to.x - ex, to.y - ey)
    return { vx: dir.x * speed, vy: dir.y * speed }
  }
  const dir = wanderDir(sim, eid)
  return { vx: dir.x * speed, vy: dir.y * speed }
}

/** 定距风筝(镜像 standoff steerer):太远贴近、太近后退、站位带内停手 */
function steerStandoff(sim: Sim, eid: number, slow: number): { vx: number; vy: number } {
  const lm = enemyDef[eid]!.locomotion
  if (lm.kind !== 'standoff') return { vx: 0, vy: 0 }
  const sp = Speed.v[eid]! * slow
  const ex = Transform.x[eid]!
  const ey = Transform.y[eid]!
  const target = nearestAlive(sim, ex, ey)
  if (!target) {
    const d = wanderDir(sim, eid)
    return { vx: d.x * sp * 0.5, vy: d.y * sp * 0.5 }
  }
  const dx = target.x - ex
  const dy = target.y - ey
  const dist = Math.hypot(dx, dy)
  const band = AI.standoffBandU * UNIT
  if (dist > lm.detectRange) {
    const d = wanderDir(sim, eid)
    return { vx: d.x * sp * 0.5, vy: d.y * sp * 0.5 }
  }
  if (dist > lm.standoffDist + band) {
    const d = norm(dx, dy)
    return { vx: d.x * sp, vy: d.y * sp }
  }
  if (dist < lm.standoffDist - band) {
    const d = norm(-dx, -dy) // 后退(贴边滑行 fleeDir 在 P5 补)
    return { vx: d.x * sp, vy: d.y * sp }
  }
  return { vx: 0, vy: 0 } // 站位带内停手(射击由能力驱动)
}

/** 自爆冲锋(镜像 detonate steerer + scene.detonate):追玩家→进 triggerRange 定身蓄力→
 * 蓄力完必引爆(群伤范围内队员 + 自毁)。返回本帧速度 */
function steerDetonate(sim: Sim, eid: number, slow: number): { vx: number; vy: number } {
  const lm = enemyDef[eid]!.locomotion
  if (lm.kind !== 'detonate') return { vx: 0, vy: 0 }
  const now = sim.elapsedMs
  const ex = Transform.x[eid]!
  const ey = Transform.y[eid]!
  if (EState.v[eid] === 2) {
    // 定身拆弹;到时引爆
    if (now >= Charge.windupUntil[eid]!) {
      const dmg = Math.round(lm.blastDamage * DmgMul.v[eid]!)
      const r2 = lm.blastRadius * lm.blastRadius
      for (const m of sim.members) {
        if (!Alive.v[m]) continue
        const dx = Transform.x[m]! - ex
        const dy = Transform.y[m]! - ey
        if (dx * dx + dy * dy <= r2) hurtMember(sim, m, dmg)
      }
      playSfx('boom')
      despawnEnemy(sim, eid)
    }
    return { vx: 0, vy: 0 }
  }
  const target = nearestAlive(sim, ex, ey)
  if (!target) return { vx: 0, vy: 0 }
  const dx = target.x - ex
  const dy = target.y - ey
  if (dx * dx + dy * dy <= lm.triggerRange * lm.triggerRange) {
    EState.v[eid] = 2
    Charge.windupUntil[eid] = now + lm.windupMs
    return { vx: 0, vy: 0 }
  }
  const dir = norm(dx, dy)
  const sp = Speed.v[eid]! * slow
  return { vx: dir.x * sp, vy: dir.y * sp }
}

/** 护巢环绕(镜像 baseOrbit steerer):绕巢盘旋,玩家逼近巢即扑向玩家;巢被拆(enemyNest=-1)
 * 后直扑玩家(暴走档,倍率已由 orphanBrood 施加)。返回本帧速度 */
function steerBaseOrbit(sim: Sim, eid: number, slow: number): { vx: number; vy: number } {
  const lm = enemyDef[eid]!.locomotion
  if (lm.kind !== 'baseOrbit') return { vx: 0, vy: 0 }
  const sp = Speed.v[eid]! * slow
  const ex = Transform.x[eid]!
  const ey = Transform.y[eid]!
  const chasePlayer = (): { vx: number; vy: number } => {
    const t = nearestAlive(sim, ex, ey)
    if (!t) return { vx: 0, vy: 0 }
    const dir = norm(t.x - ex, t.y - ey)
    return { vx: dir.x * sp, vy: dir.y * sp }
  }
  const nest = enemyNest[eid]!
  // 巢失效(被拆/被清)→ 暴走直扑
  if (nest < 0 || enemyDef[nest] === undefined) return chasePlayer()
  const nx = Transform.x[nest]!
  const ny = Transform.y[nest]!
  // 护巢判定基准是巢的位置:玩家逼近巢即扑击
  const target = nearestAlive(sim, nx, ny)
  if (target) {
    const tdx = target.x - nx
    const tdy = target.y - ny
    if (tdx * tdx + tdy * tdy <= lm.aggroRange * lm.aggroRange) return chasePlayer()
  }
  // 绕巢:切向环绕 + 半径回正(r<orbitRadius 外扩、r>orbitRadius 内收)
  const rx = ex - nx
  const ry = ey - ny
  const r = Math.hypot(rx, ry) || 1
  const radial = (lm.orbitRadius - r) / lm.orbitRadius
  const dir = norm(-ry / r + (rx / r) * radial * 1.5, rx / r + (ry / r) * radial * 1.5)
  return { vx: dir.x * sp, vy: dir.y * sp }
}

/** 本巢名下在场子敌数(enemyNest 反查) */
function broodCount(sim: Sim, nestEid: number): number {
  let n = 0
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (enemyNest[eid] === nestEid) n++
  }
  return n
}

/** 生成一窝子敌(镜像 spawnBrood):随机散开 scatter 生成 count 只,血量吃波次曲线。
 * ownerEid≥0 时记为护巢子敌(计入本巢上限 + baseOrbit 绕巢);分裂用 -1(无巢) */
export function spawnBrood(
  sim: Sim,
  atlas: EcsAtlas,
  into: EnemyDef,
  count: number,
  cx: number,
  cy: number,
  scatter: number,
  ownerEid: number,
): void {
  const hpMul = waveAt((sim.combatMs + sim.elapsedMs) / 1000).hpMultiplier
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
    if (ownerEid >= 0) enemyNest[child] = ownerEid
  }
}

/** 虫巢周期生成(镜像 spawnFromNest):全局在场上限让路 + 本巢上限只补到 maxAlive。
 * 场景侧驱动(需 atlas);敌人已死清腾出名额自然续生,巢被拆彻底停 */
export function updateSpawners(sim: Sim, atlas: EcsAtlas): void {
  if (sim.over) return
  const now = sim.elapsedMs
  const eids = query(sim.world, ENEMY_SET as unknown as object[])
  const active = eids.length
  for (const eid of eids) {
    const spawner = enemyDef[eid]?.spawner
    if (!spawner) continue
    if (now < enemyNextSpawnAt[eid]!) continue
    enemyNextSpawnAt[eid] = now + spawner.intervalMs
    if (active >= SPAWN.maxAlive) continue
    const room = spawner.maxAlive - broodCount(sim, eid)
    if (room <= 0) continue
    spawnBrood(sim, atlas, spawner.into, Math.min(spawner.count, room), Transform.x[eid]!, Transform.y[eid]!, 0.6 * UNIT, eid)
  }
}

/** 敌人转向:按 locomotion 分发(chase/wander/static/dash/standoff/detonate/baseOrbit;
 * coinThief 待拾取系统)+ 击退衰减 + 受击白闪恢复。delta 为真实帧长(ms) */
export function steerEnemies(sim: Sim, delta: number): void {
  const eids = query(sim.world, ENEMY_SET as unknown as object[])
  if (eids.length === 0) return
  const dt = delta / 1000
  const now = sim.elapsedMs
  const decay = Math.exp(-delta / KNOCKBACK.tauMs) // forest knockbackTauMul=1
  for (const eid of eids) {
    // 亡语诱饵尸壳到时静默移除(不计击杀、不掉落、不放死亡效果)
    if (Despawn.at[eid] !== 0 && now >= Despawn.at[eid]!) {
      despawnEnemy(sim, eid)
      continue
    }
    // 受击白闪到时恢复
    if (Flash.until[eid] !== 0 && now >= Flash.until[eid]!) {
      Flash.until[eid] = 0
      Tint.effect[eid] = 0
      Tint.color[eid] = 0xffffff
    }
    let tx = Transform.x[eid]!
    let ty = Transform.y[eid]!
    const kind = enemyDef[eid]?.locomotion.kind ?? 'chase'
    // 速度倍率:能力限时减速/冻结 × 体质(精英加速/护巢暴走)。teamFx/battleFx/时停时标 = 1(森林)
    const slow = (now < Slow.until[eid]! ? Slow.mul[eid]! : 1) * SpMul.v[eid]!
    const speed = Speed.v[eid]! * slow
    if (kind === 'static') {
      // 原地不动
    } else if (kind === 'wander') {
      const d = wanderDir(sim, eid)
      tx += d.x * speed * dt
      ty += d.y * speed * dt
    } else if (kind === 'dash') {
      const v = steerDash(sim, eid, slow)
      tx += v.vx * dt
      ty += v.vy * dt
    } else if (kind === 'standoff') {
      const v = steerStandoff(sim, eid, slow)
      tx += v.vx * dt
      ty += v.vy * dt
    } else if (kind === 'detonate') {
      const v = steerDetonate(sim, eid, slow)
      tx += v.vx * dt
      ty += v.vy * dt
    } else if (kind === 'baseOrbit') {
      const v = steerBaseOrbit(sim, eid, slow)
      tx += v.vx * dt
      ty += v.vy * dt
    } else {
      // chase + 回落:直奔最近活着队员
      const target = nearestAlive(sim, tx, ty)
      if (target) {
        const dir = norm(target.x - tx, target.y - ty)
        tx += dir.x * speed * dt
        ty += dir.y * speed * dt
      }
    }
    // 记录本帧移动朝向(击退前的移动分量;敌方 aim:'move' 弹的 ownerHeading 读)
    if (dt > 0) {
      enemyVelX[eid] = (tx - Transform.x[eid]!) / dt
      enemyVelY[eid] = (ty - Transform.y[eid]!) / dt
    }
    // 击退冲量:叠进位移后指数衰减(镜像 decayKnockback)
    const kvx = Kv.x[eid]!
    const kvy = Kv.y[eid]!
    if (kvx !== 0 || kvy !== 0) {
      tx += kvx * dt
      ty += kvy * dt
      if ((kvx * kvx + kvy * kvy) * decay * decay < 100) {
        Kv.x[eid] = 0
        Kv.y[eid] = 0
      } else {
        Kv.x[eid] = kvx * decay
        Kv.y[eid] = kvy * decay
      }
    }
    Transform.x[eid] = clamp(tx, 0, sim.mapW)
    Transform.y[eid] = clamp(ty, 0, sim.mapH)
  }
}
