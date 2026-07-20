import { playSfx } from '../audio/sfx'
import { PICKUPS } from '../pickups/registry'
import { UNIT } from '../core/units'
import { norm } from '../core/vec'
import type { Member } from '../characters/members'
import type { Enemy } from './enemies'
import type { ArcadeBody, BaseArenaScene, ImageObj } from '../battle/BaseArenaScene'

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
    body.setVelocity(0, 0)
    // 蓄力颤动提示
    e.setRotation(Math.sin(now / 28) * 0.14)
    if (now >= a.windupUntil) {
      if (lm.lockAt === 'launch') lockDashDir(ctx, lm.aim)
      a.state = 'dash'
      a.dashUntil = now + (lm.durationMs ?? (lm.dashDist! / lm.dashSpeed) * 1000)
      e.setRotation(0)
      e.clearTint()
      if (lm.sfx) playSfx(lm.sfx)
    }
    return
  }
  if (a.state === 'dash') {
    body.setVelocity(a.dirX * lm.dashSpeed * slow, a.dirY * lm.dashSpeed * slow)
    if (now >= a.dashUntil) {
      if (lm.intervalMs !== undefined) {
        a.state = 'chase'
        a.nextDashAt = now + lm.intervalMs
      } else {
        a.state = 'cool'
        a.coolUntil = now + (lm.cooldownMs ?? 0)
      }
    }
    return
  }
  // 触发判定
  if (lm.intervalMs !== undefined) {
    if (now >= a.nextDashAt) {
      a.state = 'windup'
      a.windupUntil = now + lm.windupMs
      e.setTint(0xffb74d)
      return
    }
  } else {
    const d = scene.worldDelta(e, target.image)
    const dist2 = d.x * d.x + d.y * d.y
    if (a.state !== 'cool' && dist2 <= lm.detectRange! * lm.detectRange!) {
      // 进入探测圈：锁定当前方向蓄力（横向位移可躲）
      if (lm.lockAt === 'windup') lockDashDir(ctx, lm.aim)
      a.state = 'windup'
      a.windupUntil = now + lm.windupMs
      e.setTint(0xffb74d)
      return
    }
    if (a.state === 'cool' && now >= a.coolUntil) a.state = 'wander'
  }
  // idle 移动：追击目标跟随 aim（Boss 逼近队伍中心，而非最近队员）
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
  // 直奔最近的金币（宝箱吃不动，不偷）；没金币就慢速游荡
  let coin: ImageObj | undefined
  let bestD = Infinity
  for (const c of scene.coins.getChildren() as ImageObj[]) {
    if (!c.active || c.getData('chest')) continue
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
      coin.destroy()
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

export const STEERERS: Record<Enemy['def']['locomotion']['kind'], Steerer> = {
  chase,
  wander,
  static: staticSteer,
  dash,
  flee,
  coinThief,
}
