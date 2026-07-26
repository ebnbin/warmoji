import { hasComponent, query, removeEntity } from 'bitecs'
import { norm } from '../../util/vec'
import { AI } from '../../data/enemies'

import { PICKUPS } from '../../data/pickups'

import { UNIT } from '../../util/units'
import { playSfx } from '../../audio/sfx'
import { despawnEnemy, hurtMember } from '../ops/combat'
import { Alive, Charge, DmgMul, EDir, Enemy, EState, ETurn, Iframe, Nest, Pickup, PICKUP_SET, Speed, Sprite, Thief, Tint, Transform } from '../components'
import { enemyDef } from '../store'
import { COIN } from '../ops/pickups'

import type { Sim } from '../sim'
import type { BaseOrbitLocomotion, DashLength, DashLocomotion, DetonateLocomotion, LocomotionDef, StandoffLocomotion, DashTrigger } from '../../types/enemies'
import type { Point } from '../../util/vec'

// locomotion 转向器注册表：每种走位一个转向器，返回本帧的「行为速度」(px/s)。
// 这不是 system——它是 steerEnemies 那个 system 查的表（与 PICKUP_KINDS / KINDS 同类）。
// **全映射**：LocomotionDef 新增一种而不在此登记 = 编译不过。

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

/** 游荡方向(镜像 wanderDir):换向计时 + 世界钩子的方向修正(有界撞边折返/无界直走) */
export function wanderDir(sim: Sim, eid: number): Point {
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
  if (nest < 0 || !hasComponent(sim.world, nest, Enemy)) return chasePlayer()
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

/** 一种 locomotion 的转向：返回本帧的行为速度（px/s，击退等冲量另算） */
export type Steerer<K extends LocomotionDef['kind']> = (
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
export const STEERERS: { [K in LocomotionDef['kind']]: Steerer<K> } = {
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

