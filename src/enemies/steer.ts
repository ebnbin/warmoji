import { playSfx } from '../audio/sfx'
import { PICKUPS } from '../pickups/registry'
import { UNIT } from '../core/units'
import { norm } from '../core/vec'
import { releasePooled } from '../core/pool'
import { enemyOf } from './enemies'
import type { Member } from '../characters/members'
import type { Enemy } from './enemies'
import type { ArcadeBody, BaseArenaScene, ImageObj } from '../battle/BaseArenaScene'

/** 定距风筝的站位滞回带（避免恰好卡在 standoffDist 上抖动） */
const STANDOFF_BAND = 0.5 * UNIT

// 敌人移动策略注册表：按 def.locomotion.kind 分发，镜像 abilities/create.ts。
// 每个策略只负责逐帧速度决策与状态机推进；攻击在 enemyAbilities.ts、
// 死亡效果在 battle/deathEffects.ts、公共帧留守 BaseArenaScene.steerEnemies。
// 世界差异经场景钩子（wanderDir/fleeDir）。

interface SteerCtx {
  scene: BaseArenaScene
  a: Enemy
  body: ArcadeBody
  slow: number
  now: number
  target: Member
}

type Steerer = (ctx: SteerCtx) => void

const chase: Steerer = ({ scene, a, body, slow, target }) => {
  const d = scene.worldDelta(a.image, target.image)
  const dir = norm(d.x, d.y)
  body.setVelocity(dir.x * a.def.speed * slow, dir.y * a.def.speed * slow)
}

const wander: Steerer = ({ scene, a, body, slow }) => {
  const dir = scene.wanderDir(a)
  body.setVelocity(dir.x * a.def.speed * slow, dir.y * a.def.speed * slow)
}

/** 原地不动（巢穴/固定装置）：速度恒零，行为全在其他机制（spawner 等） */
const staticSteer: Steerer = ({ body }) => {
  body.setVelocity(0, 0)
}

/** 统一冲刺：探测触发（野猪）与定时触发（Boss）同一状态机——
 * 蓄力（定身颤动）→ 冲刺（锁定方向直线冲）→ 冷却/回到 idle 移动 */
const dash: Steerer = (ctx) => {
  const { scene, a, body, slow, now, target } = ctx
  const lm = a.def.locomotion
  if (lm.kind !== 'dash') return
  const e = a.image
  if (a.state === 'windup') {
    // 脚本化姿态：本体自管旋转（蓄力颤动），主循环跳过环境摇摆
    a.posed = true
    body.setVelocity(0, 0)
    e.setRotation(Math.sin(now / 28) * 0.14)
    if (now >= a.windupUntil) {
      if (lm.lockAt === 'launch') lockDashDir(ctx, lm.aim)
      a.state = 'dash'
      a.dashUntil = now + (lm.length.kind === 'time' ? lm.length.durationMs : (lm.length.dist / lm.dashSpeed) * 1000)
      e.setRotation(0)
      e.clearTint()
      if (lm.sfx) playSfx(lm.sfx)
    }
    return
  }
  if (a.state === 'dash') {
    // 脚本化姿态：本体前倾并按冲刺方向翻转（原在主循环渲染分支，收回本策略自管）
    a.posed = true
    body.setVelocity(a.dirX * lm.dashSpeed * slow, a.dirY * lm.dashSpeed * slow)
    e.setRotation(a.dirX * 0.3)
    e.setFlipX(a.dirX > 0)
    if (now >= a.dashUntil) {
      if (lm.trigger.kind === 'timer') {
        a.state = 'chase'
        a.nextDashAt = now + lm.trigger.intervalMs
      } else {
        a.state = 'cool'
        a.coolUntil = now + lm.trigger.cooldownMs
      }
    }
    return
  }
  // 触发判定
  if (lm.trigger.kind === 'timer') {
    if (now >= a.nextDashAt) {
      a.posed = true
      a.state = 'windup'
      a.windupUntil = now + lm.windupMs
      e.setTint(0xffb74d)
      return
    }
  } else {
    const d = scene.worldDelta(e, target.image)
    const dist2 = d.x * d.x + d.y * d.y
    if (a.state !== 'cool' && dist2 <= lm.trigger.range * lm.trigger.range) {
      // 进入探测圈：锁定当前方向蓄力（横向位移可躲）
      if (lm.lockAt === 'windup') lockDashDir(ctx, lm.aim)
      a.posed = true
      a.state = 'windup'
      a.windupUntil = now + lm.windupMs
      e.setTint(0xffb74d)
      return
    }
    if (a.state === 'cool' && now >= a.coolUntil) a.state = 'wander'
  }
  // idle 移动（非脚本姿态，交还主循环做环境摇摆）：追击目标跟随 aim（Boss 逼近队伍中心，而非最近队员）
  a.posed = false
  if (lm.idle === 'chase') {
    const to = lm.aim === 'teamCenter' ? scene.center : target.image
    const d = scene.worldDelta(e, to)
    const dir = norm(d.x, d.y)
    body.setVelocity(dir.x * a.def.speed * slow, dir.y * a.def.speed * slow)
  } else {
    const dir = scene.wanderDir(a)
    body.setVelocity(dir.x * a.def.speed * slow, dir.y * a.def.speed * slow)
  }
}

function lockDashDir({ scene, a, target }: SteerCtx, aim: 'nearest' | 'teamCenter'): void {
  const to = aim === 'teamCenter' ? scene.center : target.image
  const d = scene.worldDelta(a.image, to)
  const dir = norm(d.x, d.y)
  a.dirX = dir.x
  a.dirY = dir.y
}

const flee: Steerer = ({ scene, a, body, slow, target }) => {
  const lm = a.def.locomotion
  if (lm.kind !== 'flee') return
  const e = a.image
  const d = scene.worldDelta(e, target.image)
  const dist2 = d.x * d.x + d.y * d.y
  if (dist2 <= lm.range * lm.range) {
    // 逃离方向经世界钩子修正（有界图贴边沿墙滑行）
    const away = norm(-d.x, -d.y)
    const dir = scene.fleeDir(a, away)
    body.setVelocity(dir.x * a.def.speed * slow, dir.y * a.def.speed * slow)
  } else {
    const dir = scene.wanderDir(a)
    body.setVelocity(dir.x * a.def.speed * 0.4 * slow, dir.y * a.def.speed * 0.4 * slow)
  }
}

const coinThief: Steerer = ({ scene, a, body, slow }) => {
  const def = a.def
  const e = a.image
  // 直奔最近的金币；没金币就慢速游荡
  let coin: ImageObj | undefined
  let bestD = Infinity
  for (const c of scene.coins.getChildren() as ImageObj[]) {
    if (!c.active) continue
    const d = scene.worldDelta(e, c)
    const dist = d.x * d.x + d.y * d.y
    if (dist < bestD) {
      bestD = dist
      coin = c
    }
  }
  if (coin) {
    const eatR = def.radius + PICKUPS.coin.radius * UNIT
    if (bestD <= eatR * eatR) {
      releasePooled(coin)
      a.eaten += 1
    } else {
      const d = scene.worldDelta(e, coin)
      const dir = norm(d.x, d.y)
      body.setVelocity(dir.x * def.speed * slow, dir.y * def.speed * slow)
    }
  } else {
    const dir = scene.wanderDir(a)
    body.setVelocity(dir.x * def.speed * 0.3 * slow, dir.y * def.speed * 0.3 * slow)
  }
}

/** 定距风筝：detectRange 内咬人——太远贴近、太近后退、站位带内停手，形成绕玩家的固定距离环 */
const standoff: Steerer = ({ scene, a, body, slow, target }) => {
  const lm = a.def.locomotion
  if (lm.kind !== 'standoff') return
  const sp = a.def.speed * slow
  const d = scene.worldDelta(a.image, target.image)
  const dist = Math.hypot(d.x, d.y)
  if (dist > lm.detectRange) {
    // 未咬住玩家：慢速游荡
    const dir = scene.wanderDir(a)
    body.setVelocity(dir.x * sp * 0.5, dir.y * sp * 0.5)
  } else if (dist > lm.standoffDist + STANDOFF_BAND) {
    // 太远：贴近
    const dir = norm(d.x, d.y)
    body.setVelocity(dir.x * sp, dir.y * sp)
  } else if (dist < lm.standoffDist - STANDOFF_BAND) {
    // 太近：边逃边打（逃离方向经世界钩子修正贴边）
    const dir = scene.fleeDir(a, norm(-d.x, -d.y))
    body.setVelocity(dir.x * sp, dir.y * sp)
  } else {
    // 站位带内：停住吐弹（射击由能力驱动）
    body.setVelocity(0, 0)
  }
}

/** 自爆冲锋：追玩家 → 进 triggerRange 定身蓄力 → 蓄力完必引爆（scene.detonate 群伤玩家后自毁）*/
const detonate: Steerer = ({ scene, a, body, slow, now, target }) => {
  const lm = a.def.locomotion
  if (lm.kind !== 'detonate') return
  const e = a.image
  if (a.state === 'windup') {
    // 脚本化姿态：定身拆弹，红白脉冲示警
    a.posed = true
    body.setVelocity(0, 0)
    e.setTint(now % 240 < 120 ? 0xffffff : 0xff5252)
    if (now >= a.windupUntil) scene.detonate(a)
    return
  }
  const d = scene.worldDelta(e, target.image)
  if (d.x * d.x + d.y * d.y <= lm.triggerRange * lm.triggerRange) {
    a.state = 'windup'
    a.windupUntil = now + lm.windupMs
    a.posed = true
    return
  }
  const dir = norm(d.x, d.y)
  body.setVelocity(dir.x * a.def.speed * slow, dir.y * a.def.speed * slow)
}

/** 护巢环绕：绕巢（owner）盘旋，玩家逼近巢即扑向玩家；巢被拆（owner 清空/失效）后直扑玩家（暴走档）*/
const baseOrbit: Steerer = ({ scene, a, body, slow, target }) => {
  const lm = a.def.locomotion
  if (lm.kind !== 'baseOrbit') return
  const e = a.image
  const owner = a.owner
  const sp = a.def.speed * slow
  const chasePlayer = (): void => {
    const d = scene.worldDelta(e, target.image)
    const dir = norm(d.x, d.y)
    body.setVelocity(dir.x * sp, dir.y * sp)
  }
  // 巢失效（被拆 / 被对象池回收顶替）→ 暴走直扑（暴走倍率已由 orphanBrood 在拆巢时施加）
  if (!owner || !owner.image.active || enemyOf(owner.image) !== owner) {
    chasePlayer()
    return
  }
  const nest = owner.image
  const toPlayer = scene.worldDelta(nest, target.image)
  // 护巢判定基准是巢的位置，不是本体
  if (toPlayer.x * toPlayer.x + toPlayer.y * toPlayer.y <= lm.aggroRange * lm.aggroRange) {
    chasePlayer()
    return
  }
  // 绕巢：切向环绕 + 半径回正（r<orbitRadius 外扩、r>orbitRadius 内收）
  const rx = e.x - nest.x
  const ry = e.y - nest.y
  const r = Math.hypot(rx, ry) || 1
  const radial = (lm.orbitRadius - r) / lm.orbitRadius
  const dir = norm(-ry / r + (rx / r) * radial * 1.5, rx / r + (ry / r) * radial * 1.5)
  body.setVelocity(dir.x * sp, dir.y * sp)
}

export const STEERERS: Record<Enemy['def']['locomotion']['kind'], Steerer> = {
  chase,
  wander,
  static: staticSteer,
  dash,
  flee,
  coinThief,
  standoff,
  detonate,
  baseOrbit,
}
