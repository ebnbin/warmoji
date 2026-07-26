import { query, removeEntity } from 'bitecs'
import { norm } from '../util/vec'
import { AI, SPAWN } from '../data/enemies'

import { KNOCKBACK } from '../data/abilities'
import { PICKUPS } from '../data/pickups'

import { UNIT } from '../util/units'
import { playSfx } from '../audio/sfx'
import { despawnEnemy, hurtMember } from './combat'
import { Alive, Boss, Charge, Despawn, DmgMul, Dormant, EDir, ENEMY_SET, EState, ETurn, EnemyPhase, EnemyVel, Flash, Iframe, Kv, Morph, Nest, PICKUP_SET, Pickup, Poison, Pop, Slow, SpMul, Speed, Sprite, Step, Thief, Tint, Transform, ZoneSlow } from './components'
import { enemyDef } from './store'
import { COIN } from './pickups'

import { backEaseOut } from './ease'
import { spawnBrood } from './entities/enemy'
import type { Sim } from './sim'
import type { BaseOrbitLocomotion, DashLength, DashLocomotion, DetonateLocomotion, LocomotionDef, StandoffLocomotion, DashTrigger } from '../types/enemies'
import type { FrameIndex } from './frames'
import type { Point } from '../util/vec'

// 敌人:装配 + 转向(locomotion 状态机 + 击退 + 世界钩子后处理)。

function nearestAlive(sim: Sim, x: number, y: number): Point | null {
  let bestX = 0
  let bestY = 0
  let bestD = Infinity
  for (const eid of sim.members) {
    if (!Alive.v[eid]) continue
    const d = sim.hooks.worldDelta(sim, x, y, Transform.x[eid]!, Transform.y[eid]!)
    const d2 = d.x * d.x + d.y * d.y
    if (d2 < bestD) {
      bestD = d2
      bestX = x + d.x
      bestY = y + d.y
    }
  }
  return bestD === Infinity ? null : { x: bestX, y: bestY }
}

/** 把敌人位置汇入 frameTargets(供队伍 orbit/游移门控) */
export function updateFrameTargets(sim: Sim): void {
  const eids = query(sim.world, ENEMY_SET as unknown as object[])
  const out: Point[] = []
  for (const eid of eids) {
    if (Dormant.v[eid]) continue
    const x = Transform.x[eid]!
    const y = Transform.y[eid]!
    out.push({ x, y })
    // 环面:真身之外再喂三个镜像,队伍 orbit/游移门控隔着传送门也成立
    for (const g of sim.hooks.ghosts(sim, x, y)) out.push(g)
  }
  sim.frameTargets = out
}

/** 游荡方向(镜像 wanderDir):换向计时 + 世界钩子的方向修正(有界撞边折返/无界直走) */
function wanderDir(sim: Sim, eid: number): Point {
  if (sim.elapsedMs >= ETurn.at[eid]!) {
    const ang = sim.rng.next() * Math.PI * 2
    EDir.x[eid] = Math.cos(ang)
    EDir.y[eid] = Math.sin(ang)
    ETurn.at[eid] = sim.elapsedMs + AI.wander.turnMinMs + sim.rng.next() * AI.wander.turnJitterMs
  }
  const d = sim.hooks.wanderDir(sim, eid, EDir.x[eid]!, EDir.y[eid]!)
  EDir.x[eid] = d.x
  EDir.y[eid] = d.y
  return d
}

/** 锁定冲刺方向(朝最近队员或队伍中心) */
function lockDashDir(sim: Sim, eid: number, aim: 'nearest' | 'teamCenter'): void {
  const to = aim === 'teamCenter' ? sim.center : nearestAlive(sim, Transform.x[eid]!, Transform.y[eid]!)
  if (!to) return
  const dir = norm(to.x - Transform.x[eid]!, to.y - Transform.y[eid]!)
  EDir.x[eid] = dir.x
  EDir.y[eid] = dir.y
}

/** 冲刺时长的两种写法 → 毫秒。**全映射**：DashLength 新增一种即编译不过 */
const DASH_MS: { [K in DashLength['kind']]: (l: Extract<DashLength, { kind: K }>, speed: number) => number } = {
  time: (l) => l.durationMs,
  dist: (l, speed) => (l.dist / speed) * 1000,
}

/** 冲刺触发的两种方式：一次冲完之后回到哪个状态、以及非冲刺期怎么判定起冲。
 * **全映射**：DashTrigger 新增一种即编译不过（从前是 `if timer / else`，
 * 第三种会被静默当成 detect） */
interface TriggerOps<K extends DashTrigger['kind']> {
  /** 一次冲刺结束：写回状态与下一次的计时 */
  afterDash(sim: Sim, eid: number, t: Extract<DashTrigger, { kind: K }>): void
  /** 非冲刺期这一帧的判定：返回 true = 进蓄力。各自的冷却/计时簿记自管 */
  step(sim: Sim, eid: number, t: Extract<DashTrigger, { kind: K }>, state: number, x: number, y: number): boolean
}
const DASH_TRIGGERS: { [K in DashTrigger['kind']]: TriggerOps<K> } = {
  timer: {
    afterDash: (sim, eid, t) => {
      EState.v[eid] = 1
      Charge.nextDashAt[eid] = sim.elapsedMs + t.intervalMs
    },
    step: (sim, eid) => sim.elapsedMs >= Charge.nextDashAt[eid]!,
  },
  detect: {
    afterDash: (sim, eid, t) => {
      EState.v[eid] = 4
      Charge.coolUntil[eid] = sim.elapsedMs + t.cooldownMs
    },
    step: (sim, eid, t, state, x, y) => {
      const target = state !== 4 ? nearestAlive(sim, x, y) : null
      if (target) {
        const dx = target.x - x
        const dy = target.y - y
        if (dx * dx + dy * dy <= t.range * t.range) return true
      }
      // 冷却到点：回 idle（下一帧才可能再进圈起冲）
      if (state === 4 && sim.elapsedMs >= Charge.coolUntil[eid]!) EState.v[eid] = 0
      return false
    },
  },
}

/** 统一冲刺状态机(镜像 dash steerer):蓄力→冲刺(锁向直冲)→冷却/回到 idle 移动。
 * 返回本帧速度(px/s);脚本化姿态(蓄力颤动/冲刺前倾/橙染)在各分支自管 */
function steerDash(sim: Sim, eid: number, slow: number, lm: DashLocomotion): { vx: number; vy: number } {
  const now = sim.elapsedMs
  const state = EState.v[eid]!
  const ex = Transform.x[eid]!
  const ey = Transform.y[eid]!
  if (state === 2) {
    // windup:定身颤动(脚本化姿态,主循环不再叠环境摇摆);到时进冲刺
    Transform.rot[eid] = Math.sin(now / 28) * 0.14
    if (now >= Charge.windupUntil[eid]!) {
      if (lm.lockAt === 'launch') lockDashDir(sim, eid, lm.aim)
      EState.v[eid] = 3
      Charge.dashUntil[eid] =
        now + (DASH_MS[lm.length.kind] as (l: DashLength, s: number) => number)(lm.length, lm.dashSpeed)
      Transform.rot[eid] = 0
      if (lm.sfx) playSfx(lm.sfx)
    }
    return { vx: 0, vy: 0 }
  }
  if (state === 3) {
    // dash:锁向直冲;到时冷却/回追
    if (now >= Charge.dashUntil[eid]!) {
      ;(DASH_TRIGGERS[lm.trigger.kind].afterDash as (s: Sim, e: number, t: DashTrigger) => void)(sim, eid, lm.trigger)
    }
    // 脚本化姿态:本体前倾并按冲刺方向翻转
    Transform.rot[eid] = EDir.x[eid]! * 0.3
    Sprite.flipX[eid] = EDir.x[eid]! > 0 ? 1 : 0
    // 冲刺碾墙(残垣图拆迁 Boss):沿途碾碎断壁,只在冲刺态生效
    if (enemyDef[eid]?.breaksWalls) sim.hooks.smashWall(sim, ex, ey)
    return { vx: EDir.x[eid]! * lm.dashSpeed * slow, vy: EDir.y[eid]! * lm.dashSpeed * slow }
  }
  // 触发判定：两种 trigger 各自的簿记归 DASH_TRIGGERS，起冲的共同动作在这里
  const ops = DASH_TRIGGERS[lm.trigger.kind] as TriggerOps<DashTrigger['kind']>
  if (ops.step(sim, eid, lm.trigger, state, ex, ey)) {
    // 进蓄力即锁向（可预判横躲）；'launch' 档留到起跑瞬间再锁。
    // 从前这一句只写在 detect 分支里，timer + lockAt:'windup' 会静默不锁——
    // 现行数据的 timer 敌人恰好都是 launch，所以看不出来
    if (lm.lockAt === 'windup') lockDashDir(sim, eid, lm.aim)
    EState.v[eid] = 2
    Charge.windupUntil[eid] = now + lm.windupMs
    return { vx: 0, vy: 0 }
  }
  // idle 移动:逼近走位经世界钩子(残垣图流场绕墙;冲刺本身仍锁直线)
  const speed = Speed.v[eid]! * slow
  if (lm.idle === 'chase') {
    const to = lm.aim === 'teamCenter' ? sim.center : nearestAlive(sim, ex, ey)
    if (!to) return { vx: 0, vy: 0 }
    const dir = sim.hooks.chaseDir(sim, eid, to.x, to.y)
    return { vx: dir.x * speed, vy: dir.y * speed }
  }
  const dir = wanderDir(sim, eid)
  return { vx: dir.x * speed, vy: dir.y * speed }
}

/** 定距风筝(镜像 standoff steerer):太远贴近、太近后退、站位带内停手 */
function steerStandoff(sim: Sim, eid: number, slow: number, lm: StandoffLocomotion): { vx: number; vy: number } {
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
    // 后退:方向经世界钩子(有界图贴边沿墙滑行,不顶死在边上)
    const away = norm(-dx, -dy)
    const d = sim.hooks.fleeDir(sim, eid, away.x, away.y)
    return { vx: d.x * sp, vy: d.y * sp }
  }
  return { vx: 0, vy: 0 } // 站位带内停手(射击由能力驱动)
}

/** 自爆冲锋(镜像 detonate steerer + scene.detonate):追玩家→进 triggerRange 定身蓄力→
 * 蓄力完必引爆(群伤范围内队员 + 自毁)。返回本帧速度 */
function steerDetonate(sim: Sim, eid: number, slow: number, lm: DetonateLocomotion): { vx: number; vy: number } {
  const now = sim.elapsedMs
  const ex = Transform.x[eid]!
  const ey = Transform.y[eid]!
  if (EState.v[eid] === 2) {
    // 定身拆弹 + 红白脉冲示警(脚本化姿态);到时引爆。乘算染色(白=原样、红=偏红),非纯色填充
    Tint.effect[eid] = 0
    Tint.color[eid] = now % 240 < 120 ? 0xffffff : 0xff5252
    if (now >= Charge.windupUntil[eid]!) {
      const dmg = Math.round(lm.blastDamage * DmgMul.v[eid]!)
      const r2 = lm.blastRadius * lm.blastRadius
      for (const m of sim.members) {
        if (!Alive.v[m]) continue
        const d = sim.hooks.worldDelta(sim, ex, ey, Transform.x[m]!, Transform.y[m]!)
        if (d.x * d.x + d.y * d.y > r2) continue
        // 与敌方能力同口径:吃无敌帧节流并消费之(免得接触伤害与自爆同帧双吃)
        if (now - Iframe.last[m]! < Iframe.ms[m]!) continue
        Iframe.last[m] = now
        hurtMember(sim, m, dmg, enemyDef[eid]?.name)
      }
      sim.pendingRings.push({ x: ex, y: ey, radius: lm.blastRadius })
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
  const dir = sim.hooks.chaseDir(sim, eid, target.x, target.y)
  const sp = Speed.v[eid]! * slow
  return { vx: dir.x * sp, vy: dir.y * sp }
}

/** 护巢环绕(镜像 baseOrbit steerer):绕巢盘旋,玩家逼近巢即扑向玩家;巢被拆(Nest.of=-1)
 * 后直扑玩家(暴走档,倍率已由 orphanBrood 施加)。返回本帧速度 */
function steerBaseOrbit(sim: Sim, eid: number, slow: number, lm: BaseOrbitLocomotion): { vx: number; vy: number } {
  const sp = Speed.v[eid]! * slow
  const ex = Transform.x[eid]!
  const ey = Transform.y[eid]!
  const chasePlayer = (): { vx: number; vy: number } => {
    const t = nearestAlive(sim, ex, ey)
    if (!t) return { vx: 0, vy: 0 }
    // 扑向玩家经世界钩子(残垣图绕墙寻路)
    const dir = sim.hooks.chaseDir(sim, eid, t.x, t.y)
    return { vx: dir.x * sp, vy: dir.y * sp }
  }
  const nest = Nest.of[eid]!
  // 巢失效(被拆/被清)→ 暴走直扑
  if (nest < 0 || enemyDef[nest] === undefined) return chasePlayer()
  const nx = Transform.x[nest]!
  const ny = Transform.y[nest]!
  // 护巢判定:目标是「离本体最近的队员」(与 chasePlayer 同一个人),再量他到巢的距离
  const target = nearestAlive(sim, ex, ey)
  if (target) {
    const td = sim.hooks.worldDelta(sim, nx, ny, target.x, target.y)
    if (td.x * td.x + td.y * td.y <= lm.aggroRange * lm.aggroRange) return chasePlayer()
  }
  // 绕巢:切向环绕 + 半径回正(r<orbitRadius 外扩、r>orbitRadius 内收)
  const rx = ex - nx
  const ry = ey - ny
  const r = Math.hypot(rx, ry) || 1
  const radial = (lm.orbitRadius - r) / lm.orbitRadius
  const dir = norm(-ry / r + (rx / r) * radial * 1.5, rx / r + (ry / r) * radial * 1.5)
  return { vx: dir.x * sp, vy: dir.y * sp }
}

/** 逃跑(镜像 arcade 的 flee steerer):队伍进 range 就背身逃开(方向经世界钩子修正,
 * 有界图贴边沿墙滑行),否则慢速游荡 */
function steerFlee(sim: Sim, eid: number, slow: number, lm: Extract<LocomotionDef, { kind: 'flee' }>): { vx: number; vy: number } {
  const speed = Speed.v[eid]!
  const ex = Transform.x[eid]!
  const ey = Transform.y[eid]!
  const target = nearestAlive(sim, ex, ey)
  if (target) {
    const d = sim.hooks.worldDelta(sim, ex, ey, target.x, target.y)
    if (d.x * d.x + d.y * d.y <= lm.range * lm.range) {
      const away = norm(-d.x, -d.y)
      const dir = sim.hooks.fleeDir(sim, eid, away.x, away.y)
      return { vx: dir.x * speed * slow, vy: dir.y * speed * slow }
    }
  }
  const w = wanderDir(sim, eid)
  const sp = speed * AI.fleeIdleSpeedMul * slow
  return { vx: w.x * sp, vy: w.y * sp }
}

/** 偷币鼠(镜像 coinThief steerer):直奔最近金币,贴上按冷却逐枚吞(偷走不入账);
 * 没金币慢速游荡。吞下的币死亡时吐回(+利息),见 grantKillRewards */
function steerCoinThief(sim: Sim, eid: number, slow: number): { vx: number; vy: number } {
  const def = enemyDef[eid]!
  const ex = Transform.x[eid]!
  const ey = Transform.y[eid]!
  let coin = -1
  let bestD = Infinity
  let coinX = 0
  let coinY = 0
  for (const c of query(sim.world, PICKUP_SET as unknown as object[])) {
    if (Pickup.kind[c] !== COIN) continue // 只认金币:战场增/减益不是它的口粮
    const w = sim.hooks.worldDelta(sim, ex, ey, Transform.x[c]!, Transform.y[c]!)
    const d = w.x * w.x + w.y * w.y
    if (d < bestD) {
      bestD = d
      coin = c
      coinX = ex + w.x
      coinY = ey + w.y
    }
  }
  if (coin < 0) {
    // 没金币:慢速游荡
    const d = wanderDir(sim, eid)
    const sp = def.speed * 0.3 * slow
    return { vx: d.x * sp, vy: d.y * sp }
  }
  const eatR = def.radius + PICKUPS.coin.radius * UNIT
  const onCoin = bestD <= eatR * eatR
  if (onCoin) {
    // 贴上金币:过冷却才吞一枚(偷走,不入账)
    if (sim.elapsedMs >= Thief.nextEatAt[eid]!) {
      removeEntity(sim.world, coin)
      Thief.eaten[eid] = Thief.eaten[eid]! + 1
      Thief.nextEatAt[eid] = sim.elapsedMs + AI.coinThiefEatCdMs
    }
    return { vx: 0, vy: 0 }
  }
  const dir = norm(coinX - ex, coinY - ey)
  const sp = def.speed * slow
  return { vx: dir.x * sp, vy: dir.y * sp }
}

/** 本巢名下在场子敌数(Nest.of 反查) */
function broodCount(sim: Sim, nestEid: number): number {
  let n = 0
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Nest.of[eid] === nestEid) n++
  }
  return n
}

export function updateSpawners(sim: Sim, atlas: FrameIndex): void {
  if (sim.over) return
  const now = sim.elapsedMs
  const eids = query(sim.world, ENEMY_SET as unknown as object[])
  let active = eids.length
  for (const eid of eids) {
    if (Dormant.v[eid]) continue // 休眠的巢不生子敌
    const spawner = enemyDef[eid]?.spawner
    if (!spawner) continue
    // 压制期(全场蹦迪 / 魔尘变羊)既不产子也不推进计时——旧实现产子块在两个 continue 之后
    if (now < sim.danceEndsAt) continue
    if (Morph.until[eid] !== 0 && now < Morph.until[eid]!) continue
    if (now < Nest.nextSpawnAt[eid]!) continue
    Nest.nextSpawnAt[eid] = now + spawner.intervalMs
    if (active >= SPAWN.maxAlive) continue
    const room = spawner.maxAlive - broodCount(sim, eid)
    if (room <= 0) continue
    const n = Math.min(spawner.count, room)
    spawnBrood(sim, atlas, spawner.into, n, Transform.x[eid]!, Transform.y[eid]!, 0.6 * UNIT, eid)
    active += n // 实时计数:同帧后面的巢看得到前面刚产的子敌(镜像旧每次现数 countActive)
  }
}

/** 入场弹入:缩放/透明插值到位后清零(Boss 走 Back.easeOut 过冲,普通怪线性)。
 * 休眠者也照常弹入——出生即被冻结的怪不该卡在 0.3 倍大小 */
export function popInEnemies(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Pop.until[eid] === 0) continue
    const left = Pop.until[eid]! - now
    if (left <= 0) {
      Pop.until[eid] = 0
      Transform.w[eid] = Pop.size[eid]!
      Transform.h[eid] = Pop.size[eid]!
      Tint.alpha[eid] = Pop.alpha[eid]!
      continue
    }
    const raw = 1 - left / Pop.ms[eid]!
    const t = Pop.back[eid] ? backEaseOut(raw) : raw
    const from = Boss.v[eid] ? 0.2 : 0.3
    const k = Pop.size[eid]! * (from + (1 - from) * t)
    Transform.w[eid] = k
    Transform.h[eid] = k
    Tint.alpha[eid] = from + (Pop.alpha[eid]! - from) * t // 与 scale 共用缓动(Boss 的 Back 会过冲)
  }
}

/** 定时静默移除:亡语诱饵尸壳到时离场(不计击杀、不掉落、不放死亡效果) */
export function despawnExpired(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of [...query(sim.world, ENEMY_SET as unknown as object[])]) {
    if (Dormant.v[eid]) continue
    if (Despawn.at[eid] !== 0 && now >= Despawn.at[eid]!) despawnEnemy(sim, eid)
  }
}

/** 受击白闪到时恢复 */
export function fadeEnemyFlash(sim: Sim): void {
  const now = sim.elapsedMs
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid]) continue
    if (Flash.until[eid] !== 0 && now >= Flash.until[eid]!) Flash.until[eid] = 0
  }
}

/** 一种 locomotion 的转向：返回本帧的行为速度（px/s，击退等冲量另算） */
type Steerer<K extends LocomotionDef['kind']> = (
  sim: Sim,
  eid: number,
  speed: number,
  slow: number,
  lm: Extract<LocomotionDef, { kind: K }>,
) => { vx: number; vy: number }

const STILL = { vx: 0, vy: 0 }

/** 奔向最近活着队员（方向经世界钩子——残垣图走流场绕墙） */
const steerChase: Steerer<'chase'> = (sim, eid, speed) => {
  const target = nearestAlive(sim, Transform.x[eid]!, Transform.y[eid]!)
  if (!target) return STILL
  const dir = sim.hooks.chaseDir(sim, eid, target.x, target.y)
  return { vx: dir.x * speed, vy: dir.y * speed }
}

/** 每种 locomotion 一个转向器。**全映射**：LocomotionDef 新增一种而不在此登记 =
 * 编译不过。从前是一条 else-if 链外加一个兜底 else——`flee` 在类型里声明了、
 * arcade 侧也实现了（它一直是 STEERERS 全映射表），ECS 这边却从来没写，
 * 被那个 else 静默当成 chase 蒙了过去 */
const STEERERS: { [K in LocomotionDef['kind']]: Steerer<K> } = {
  chase: steerChase,
  wander: (sim, eid, speed) => {
    const d = wanderDir(sim, eid)
    return { vx: d.x * speed, vy: d.y * speed }
  },
  static: () => STILL,
  flee: (sim, eid, _speed, slow, lm) => steerFlee(sim, eid, slow, lm),
  dash: (sim, eid, _speed, slow, lm) => steerDash(sim, eid, slow, lm),
  standoff: (sim, eid, _speed, slow, lm) => steerStandoff(sim, eid, slow, lm),
  detonate: (sim, eid, _speed, slow, lm) => steerDetonate(sim, eid, slow, lm),
  baseOrbit: (sim, eid, _speed, slow, lm) => steerBaseOrbit(sim, eid, slow, lm),
  coinThief: (sim, eid, _speed, slow) => steerCoinThief(sim, eid, slow),
}

/** 本帧减速区叠乘(寒气光环等):落在圈内即按 factor 变慢。转向与染色共读这一份 */
export function applySlowZones(sim: Sim): void {
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid]) continue
    let mul = 1
    for (const z of sim.frameSlowZones) {
      const d = sim.hooks.worldDelta(sim, Transform.x[eid]!, Transform.y[eid]!, z.x, z.y)
      if (d.x * d.x + d.y * d.y <= z.r2) mul *= z.factor
    }
    ZoneSlow.v[eid] = mul
  }
}

/** 非白闪期的常驻染色:蹦迪粉 > 中毒毒绿 > 蓄力橙 > 减速冷蓝 > 常态白。
 * 旧实现的橙/蓝只在状态翻转那一帧写一次,毒绿却逐帧重涂,故稳态下毒绿压过橙 */
export function tintEnemies(sim: Sim): void {
  const now = sim.elapsedMs
  const dancing = now < sim.danceEndsAt
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid] || Flash.until[eid] !== 0) continue
    Tint.effect[eid] = 0
    Tint.color[eid] = dancing
      ? 0xff9ff3
      : now < Poison.until[eid]!
        ? 0x7bff5a
        : EState.v[eid] === 2
          ? 0xffb74d
          : ZoneSlow.v[eid]! < 1
            ? 0xa5d8ff
            : 0xffffff
  }
}

/** 敌人转向:按 locomotion 求本帧「行为速度」(px/s)→ 过世界钩子(冰面打滑/河流漂移)
 * → 写进 Step。delta = 世界时长(吃时停) */
export function steerEnemies(sim: Sim, delta: number): void {
  const dt = delta / 1000
  const now = sim.elapsedMs
  const dancing = now < sim.danceEndsAt
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid]) continue // 休眠:冻结 AI 与位移,状态原样保留,回到活跃范围自然接管
    // 速度倍率:减速区 × 能力限时减速/冻结 × 体质(精英加速/护巢暴走) × 团队卡与战场拾取的敌速乘区。
    // 时停不在此处乘——世界侧统一按 wdelta 积分已等价于时间放缩
    const slow =
      ZoneSlow.v[eid]! *
      (now < Slow.until[eid]! ? Slow.mul[eid]! : 1) *
      SpMul.v[eid]! *
      sim.enemySlowMul *
      sim.battleFx.enemySlowMul
    const speed = Speed.v[eid]! * slow
    const kind = enemyDef[eid]?.locomotion.kind ?? 'chase'
    let bvx = 0
    let bvy = 0
    if (dancing) {
      // 蹦迪:定身摇摆(不位移),摇摆幅度大于常态行走
      Transform.rot[eid] = Math.sin(now / 80 + EnemyPhase.v[eid]!) * 0.3
    } else if (Morph.until[eid] !== 0 && now < Morph.until[eid]!) {
      // 魔尘变形期:失去本职行为,顶绵羊形象缓速游荡(半速)。缴械/无害/复形在能力层与战斗层
      const d = wanderDir(sim, eid)
      bvx = d.x * speed * 0.5
      bvy = d.y * speed * 0.5
    } else {
      const v = (STEERERS[kind] as Steerer<LocomotionDef['kind']>)(sim, eid, speed, slow, enemyDef[eid]!.locomotion)
      bvx = v.vx
      bvy = v.vy
    }
    // 世界钩子:冰面打滑等把行为速度过一道低通(击退分量不参与,见 worlds.ts)
    const post = sim.hooks.postSteerEnemy(sim, eid, bvx, bvy, delta)
    Step.x[eid] = post.vx * dt
    Step.y[eid] = post.vy * dt
    // 记录本帧移动朝向(击退前的移动分量;敌方 aim:'move' 弹的 ownerHeading 读)
    if (dt > 0) {
      EnemyVel.x[eid] = post.vx
      EnemyVel.y[eid] = post.vy
    }
  }
}

/** 击退:冲量叠进本帧位移后指数衰减(镜像 decayKnockback)。
 * realDelta = 真实帧长——旧实现把冲量写进 Arcade body 由物理按真实帧长积分,
 * 故时停期「打谁谁飞」照旧成立 */
export function applyKnockback(sim: Sim, delta: number, realDelta = delta): void {
  const kdt = realDelta / 1000
  const decay = Math.exp(-delta / (KNOCKBACK.tauMs * sim.hooks.knockbackTauMul(sim)))
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid]) continue
    const kvx = Kv.x[eid]!
    const kvy = Kv.y[eid]!
    if (kvx === 0 && kvy === 0) continue
    Step.x[eid] = Step.x[eid]! + kvx * kdt
    Step.y[eid] = Step.y[eid]! + kvy * kdt
    if ((kvx * kvx + kvy * kvy) * decay * decay < 100) {
      Kv.x[eid] = 0
      Kv.y[eid] = 0
    } else {
      Kv.x[eid] = kvx * decay
      Kv.y[eid] = kvy * decay
    }
  }
}

/** 提交位移:世界禁锢(深空引力井削向外分量)+ 世界约束(钳制/回绕)后落到 Transform */
export function commitEnemySteps(sim: Sim): void {
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid]) continue
    const ox = Transform.x[eid]!
    const oy = Transform.y[eid]!
    const conf = sim.hooks.confineEnemyStep(sim, eid, Step.x[eid]!, Step.y[eid]!)
    const fixed = sim.hooks.constrainEnemy(sim, eid, ox + conf.x, oy + conf.y)
    Transform.x[eid] = fixed.x
    Transform.y[eid] = fixed.y
  }
}

/** 行走动画:环境摇摆(轻微旋转)+ 按移动方向翻转(twemoji 默认朝左)。
 * 蓄力/冲刺(EState 2/3)、蹦迪与变形由各自状态机/形象自管,此处不覆盖。
 * 翻转读「含击退」的本帧位移(被击飞时会朝击退方向转身),且读的是禁锢之前的那一份 */
export function animateEnemies(sim: Sim, delta: number): void {
  const now = sim.elapsedMs
  const dancing = now < sim.danceEndsAt
  if (dancing) return
  const dt = delta / 1000
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (Dormant.v[eid]) continue
    if (EState.v[eid] === 2 || EState.v[eid] === 3 || Morph.until[eid] !== 0) continue
    Transform.rot[eid] = Math.sin(now / 95 + EnemyPhase.v[eid]!) * 0.1
    const flipVx = dt > 0 ? Step.x[eid]! / dt : 0
    if (Math.abs(flipVx) > 8) Sprite.flipX[eid] = flipVx > 0 ? 1 : 0
  }
}
