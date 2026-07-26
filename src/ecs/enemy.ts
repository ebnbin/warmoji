import { addComponent, addEntity, query, removeEntity } from 'bitecs'
import { norm } from '../util/vec'
import { AI, ELITE, SPAWN } from '../data/enemies'
import type { EnemyDef } from '../types/enemies'
import { KNOCKBACK } from '../data/abilities'
import { PICKUPS } from '../data/pickups'
import { waveAt } from '../data/waves'
import { UNIT } from '../util/units'
import { playSfx } from '../audio/sfx'
import { despawnEnemy, hurtMember } from './combat'
import { Alive, Anim, Boss, COIN_SET, Charge, Depth, Despawn, DmgMul, Dormant, EDir, ENEMY_SET, EState, ETurn, Elite, Enemy, EnemyArm, EnemyPhase, EnemyVel, Flash, Hp, Iframe, Kv, Morph, Nest, Poison, Pop, Quad, Radius, Slide, Slow, SpMul, Speed, Sprite, Step, Thief, Tint, Transform, ZoneSlow } from './components'
import { enemyCarries, enemyDef } from './store'
import { armIdle } from './anim'
import { ANIM_DEF } from '../emoji/anim'
import { backEaseOut } from './ease'
import type { Sim } from './sim'
import type { FrameIndex } from './frames'
import type { Point } from '../util/vec'

// 敌人:装配 + 转向(locomotion 状态机 + 击退 + 世界钩子后处理)。

/** 装配一个敌人实体(px 化 def),返回 eid */
export function spawnEnemy(
  sim: Sim,
  atlas: FrameIndex,
  def: EnemyDef,
  x: number,
  y: number,
  hp: number,
  elite: boolean,
  boss: boolean,
  /** 目标透明度(亡语诱饵尸壳半透明;入场弹入收敛到它而非恒 1) */
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
  addComponent(world, eid, Anim)
  addComponent(world, eid, Sprite)
  addComponent(world, eid, Tint)
  addComponent(world, eid, Depth)
  // 出生落点过世界钩子(镜像 materializeEnemy 的 constrainEnemyPos):
  // 分裂/子敌贴岸溅出等边缘情况在出生帧就位,不必等下一帧才被拉回
  const born = sim.hooks.constrainSpawn(sim, x, y, def.radius)
  Transform.x[eid] = born.x
  Transform.y[eid] = born.y
  Transform.rot[eid] = 0
  // 入场弹入(镜像 materializeEnemy 的 scale/alpha tween):Boss 更慢更弹,普通怪快而线性
  Transform.w[eid] = size * (boss ? 0.2 : 0.3)
  Transform.h[eid] = Transform.w[eid]!
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
  Nest.of[eid] = -1 // 非护巢子敌(spawnBrood 会覆盖为巢 eid)
  Nest.nextSpawnAt[eid] = def.spawner ? sim.elapsedMs + (def.spawner.firstDelayMs ?? def.spawner.intervalMs) : 0
  Kv.x[eid] = 0
  Kv.y[eid] = 0
  Slide.x[eid] = 0
  Slide.y[eid] = 0
  Dormant.v[eid] = 0
  EnemyArm.armed[eid] = 0 // eid 复用:新实体须重新装配能力
  // 敌人一并带 Alive:「持有者还在不在场上」对能力系统就此与阵营无关(队员阵亡与敌人离场同构)
  Alive.v[eid] = 1
  Flash.until[eid] = 0
  Slow.until[eid] = 0
  Slow.mul[eid] = 1
  Poison.until[eid] = 0
  // 游荡初始方向 + 首次换向(镜像 materializeEnemy 的随机相/换向计时)
  EDir.x[eid] = Math.cos(sim.rng.next() * Math.PI * 2)
  EDir.y[eid] = Math.sin(sim.rng.next() * Math.PI * 2)
  ETurn.at[eid] = sim.elapsedMs + AI.wander.spawnTurnMinMs + sim.rng.next() * AI.wander.spawnTurnJitterMs
  // 首发延迟(镜像 materializeEnemy 的 fireAt;lazy-arm 时喂入能力初始冷却)
  EnemyArm.fireDelayMs[eid] = 900 + sim.rng.next() * 1500
  // 行走摇摆随机相位(镜像 materializeEnemy 的 ph)
  EnemyPhase.v[eid] = sim.rng.next() * Math.PI * 2
  Sprite.frame[eid] = atlas.index(def.emoji, outline)
  Sprite.flipX[eid] = 0
  // 部件动画:idle 常驻翻帧,相位按出生随机相错开(镜像 materializeEnemy 的 anim.setIdle)
  armIdle(eid, def.emoji, outline, Sprite.frame[eid]!, (EnemyPhase.v[eid]! / (Math.PI * 2)) * ANIM_DEF.durMs)
  Tint.color[eid] = 0xffffff
  Tint.effect[eid] = 0
  Tint.alpha[eid] = boss ? 0.2 : 0.3 // 起点是绝对值,不乘目标 alpha(镜像 materializeEnemy 的 setAlpha)
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

/** 最近活着的队员位置(镜像 nearestAlive)。距离走世界钩子的差向量——环面上取最短差,
 * 故返回的是「相对 (x,y) 的最近镜像」坐标:下游一律 norm(to - from),数学无需改动 */
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

/** 统一冲刺状态机(镜像 dash steerer):蓄力→冲刺(锁向直冲)→冷却/回到 idle 移动。
 * 返回本帧速度(px/s);脚本化姿态(蓄力颤动/冲刺前倾/橙染)在各分支自管 */
function steerDash(sim: Sim, eid: number, slow: number): { vx: number; vy: number } {
  const lm = enemyDef[eid]!.locomotion
  if (lm.kind !== 'dash') return { vx: 0, vy: 0 }
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
        now + (lm.length.kind === 'time' ? lm.length.durationMs : (lm.length.dist / lm.dashSpeed) * 1000)
      Transform.rot[eid] = 0
      if (lm.sfx) playSfx(lm.sfx)
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
    // 脚本化姿态:本体前倾并按冲刺方向翻转
    Transform.rot[eid] = EDir.x[eid]! * 0.3
    Sprite.flipX[eid] = EDir.x[eid]! > 0 ? 1 : 0
    // 冲刺碾墙(残垣图拆迁 Boss):沿途碾碎断壁,只在冲刺态生效
    if (enemyDef[eid]?.breaksWalls) sim.hooks.smashWall(sim, ex, ey)
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
    // 后退:方向经世界钩子(有界图贴边沿墙滑行,不顶死在边上)
    const away = norm(-dx, -dy)
    const d = sim.hooks.fleeDir(sim, eid, away.x, away.y)
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
function steerBaseOrbit(sim: Sim, eid: number, slow: number): { vx: number; vy: number } {
  const lm = enemyDef[eid]!.locomotion
  if (lm.kind !== 'baseOrbit') return { vx: 0, vy: 0 }
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
  for (const c of query(sim.world, COIN_SET as unknown as object[])) {
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

/** 生成一窝子敌(镜像 spawnBrood):随机散开 scatter 生成 count 只,血量吃波次曲线。
 * ownerEid≥0 时记为护巢子敌(计入本巢上限 + baseOrbit 绕巢);分裂用 -1(无巢) */
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
    if (ownerEid >= 0) Nest.of[child] = ownerEid
  }
}

/** 虫巢周期生成(镜像 spawnFromNest):全局在场上限让路 + 本巢上限只补到 maxAlive。
 * 场景侧驱动(需 atlas);敌人已死清腾出名额自然续生,巢被拆彻底停 */
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
    } else if (kind === 'static') {
      // 原地不动
    } else if (kind === 'wander') {
      const d = wanderDir(sim, eid)
      bvx = d.x * speed
      bvy = d.y * speed
    } else if (kind === 'dash') {
      const v = steerDash(sim, eid, slow)
      bvx = v.vx
      bvy = v.vy
    } else if (kind === 'standoff') {
      const v = steerStandoff(sim, eid, slow)
      bvx = v.vx
      bvy = v.vy
    } else if (kind === 'detonate') {
      const v = steerDetonate(sim, eid, slow)
      bvx = v.vx
      bvy = v.vy
    } else if (kind === 'baseOrbit') {
      const v = steerBaseOrbit(sim, eid, slow)
      bvx = v.vx
      bvy = v.vy
    } else if (kind === 'coinThief') {
      const v = steerCoinThief(sim, eid, slow)
      bvx = v.vx
      bvy = v.vy
    } else {
      // chase + 回落:奔向最近活着队员(方向经世界钩子——残垣图走流场绕墙)
      const target = nearestAlive(sim, Transform.x[eid]!, Transform.y[eid]!)
      if (target) {
        const dir = sim.hooks.chaseDir(sim, eid, target.x, target.y)
        bvx = dir.x * speed
        bvy = dir.y * speed
      }
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
