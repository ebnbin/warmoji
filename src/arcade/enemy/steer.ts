import { playSfx } from '../../audio/sfx'
import { PICKUPS } from '../../data/pickups'
import { AI } from '../../data/enemies'
import { UNIT } from '../../util/units'
import { norm } from '../../util/vec'
import { releasePooled } from '../pool'
import { enemyOf } from './enemies'
import type { Member } from '../member'
import type { Enemy } from './enemies'
import type { ArcadeBody, ArcadeBattleScene, ImageObj } from '../ArcadeBattleScene'

/** 站位滞回带 */
const STANDOFF_BAND = AI.standoffBandU * UNIT

const COINTHIEF_EAT_CD = AI.coinThiefEatCdMs

// 策略只做逐帧速度决策与状态机推进；世界差异经场景钩子（chaseDir/wanderDir/fleeDir）

interface SteerCtx {
  scene: ArcadeBattleScene
  a: Enemy
  body: ArcadeBody
  slow: number
  now: number
  target: Member
}

type Steerer = (ctx: SteerCtx) => void

const chase: Steerer = ({ scene, a, body, slow, target }) => {
  const dir = scene.chaseDir(a, target.image)
  body.setVelocity(dir.x * a.def.speed * slow, dir.y * a.def.speed * slow)
}

const wander: Steerer = ({ scene, a, body, slow }) => {
  const dir = scene.wanderDir(a)
  body.setVelocity(dir.x * a.def.speed * slow, dir.y * a.def.speed * slow)
}

const staticSteer: Steerer = ({ body }) => {
  body.setVelocity(0, 0)
}

const dash: Steerer = (ctx) => {
  const { scene, a, body, slow, now, target } = ctx
  const lm = a.def.locomotion
  if (lm.kind !== 'dash') return
  const e = a.image
  const c = (a.charge ??= { windupUntil: 0, dashUntil: 0, coolUntil: 0, nextDashAt: 0 })
  if (a.state === 'windup') {
    a.posed = true
    body.setVelocity(0, 0)
    e.setRotation(Math.sin(now / 28) * 0.14)
    if (now >= c.windupUntil) {
      if (lm.lockAt === 'launch') lockDashDir(ctx, lm.aim)
      a.state = 'dash'
      c.dashUntil = now + (lm.length.kind === 'time' ? lm.length.durationMs : (lm.length.dist / lm.dashSpeed) * 1000)
      e.setRotation(0)
      e.clearTint()
      if (lm.sfx) playSfx(lm.sfx)
    }
    return
  }
  if (a.state === 'dash') {
    a.posed = true
    body.setVelocity(a.dirX * lm.dashSpeed * slow, a.dirY * lm.dashSpeed * slow)
    e.setRotation(a.dirX * 0.3)
    e.setFlipX(a.dirX > 0)
    if (a.def.breaksWalls) scene.smashWallAt(e.x, e.y)
    if (now >= c.dashUntil) {
      if (lm.trigger.kind === 'timer') {
        a.state = 'chase'
        c.nextDashAt = now + lm.trigger.intervalMs
      } else {
        a.state = 'cool'
        c.coolUntil = now + lm.trigger.cooldownMs
      }
    }
    return
  }
  if (lm.trigger.kind === 'timer') {
    if (now >= c.nextDashAt) {
      a.posed = true
      a.state = 'windup'
      c.windupUntil = now + lm.windupMs
      e.setTint(0xffb74d)
      return
    }
  } else {
    const d = scene.worldDelta(e, target.image)
    const dist2 = d.x * d.x + d.y * d.y
    if (a.state !== 'cool' && dist2 <= lm.trigger.range * lm.trigger.range) {
      if (lm.lockAt === 'windup') lockDashDir(ctx, lm.aim)
      a.posed = true
      a.state = 'windup'
      c.windupUntil = now + lm.windupMs
      e.setTint(0xffb74d)
      return
    }
    if (a.state === 'cool' && now >= c.coolUntil) a.state = 'wander'
  }
  a.posed = false
  if (lm.idle === 'chase') {
    const to = lm.aim === 'teamCenter' ? scene.center : target.image
    const dir = scene.chaseDir(a, to)
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
    const away = norm(-d.x, -d.y)
    const dir = scene.fleeDir(a, away)
    body.setVelocity(dir.x * a.def.speed * slow, dir.y * a.def.speed * slow)
  } else {
    const dir = scene.wanderDir(a)
    body.setVelocity(dir.x * a.def.speed * AI.fleeIdleSpeedMul * slow, dir.y * a.def.speed * AI.fleeIdleSpeedMul * slow)
  }
}

const coinThief: Steerer = ({ scene, a, body, slow, now }) => {
  const def = a.def
  const e = a.image
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
    const onCoin = bestD <= eatR * eatR
    const thief = (a.thief ??= { eaten: 0, nextEatAt: 0 })
    if (onCoin && now >= thief.nextEatAt) {
      releasePooled(coin)
      thief.eaten += 1
      thief.nextEatAt = now + COINTHIEF_EAT_CD
    } else if (onCoin) {
      body.setVelocity(0, 0)
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

const standoff: Steerer = ({ scene, a, body, slow, target }) => {
  const lm = a.def.locomotion
  if (lm.kind !== 'standoff') return
  const sp = a.def.speed * slow
  const d = scene.worldDelta(a.image, target.image)
  const dist = Math.hypot(d.x, d.y)
  if (dist > lm.detectRange) {
    const dir = scene.wanderDir(a)
    body.setVelocity(dir.x * sp * 0.5, dir.y * sp * 0.5)
  } else if (dist > lm.standoffDist + STANDOFF_BAND) {
    const dir = norm(d.x, d.y)
    body.setVelocity(dir.x * sp, dir.y * sp)
  } else if (dist < lm.standoffDist - STANDOFF_BAND) {
    const dir = scene.fleeDir(a, norm(-d.x, -d.y))
    body.setVelocity(dir.x * sp, dir.y * sp)
  } else {
    body.setVelocity(0, 0)
  }
}

const detonate: Steerer = ({ scene, a, body, slow, now, target }) => {
  const lm = a.def.locomotion
  if (lm.kind !== 'detonate') return
  const e = a.image
  const c = (a.charge ??= { windupUntil: 0, dashUntil: 0, coolUntil: 0, nextDashAt: 0 })
  if (a.state === 'windup') {
    a.posed = true
    body.setVelocity(0, 0)
    e.setTint(now % 240 < 120 ? 0xffffff : 0xff5252)
    if (now >= c.windupUntil) scene.detonate(a)
    return
  }
  const d = scene.worldDelta(e, target.image)
  if (d.x * d.x + d.y * d.y <= lm.triggerRange * lm.triggerRange) {
    a.state = 'windup'
    c.windupUntil = now + lm.windupMs
    a.posed = true
    return
  }
  const dir = scene.chaseDir(a, target.image)
  body.setVelocity(dir.x * a.def.speed * slow, dir.y * a.def.speed * slow)
}

const baseOrbit: Steerer = ({ scene, a, body, slow, target }) => {
  const lm = a.def.locomotion
  if (lm.kind !== 'baseOrbit') return
  const e = a.image
  const owner = a.owner
  const sp = a.def.speed * slow
  const chasePlayer = (): void => {
    const dir = scene.chaseDir(a, target.image)
    body.setVelocity(dir.x * sp, dir.y * sp)
  }
  // owner 的精灵可能已被对象池复用给别的敌人
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
