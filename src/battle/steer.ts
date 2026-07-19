import { COIN } from '../items/registry'
import { UNIT } from '../lib/units'
import { norm } from '../lib/vec'
import type { Member } from './BaseArenaScene'
import { spawnEnemyShot } from './hazards'
import type { Enemy } from './actors'
import type { ArcadeBody, BaseArenaScene, ImageObj } from './BaseArenaScene'

// 敌人移动策略注册表：按 spec.behavior 分发，镜像 weapons/create.ts 的模式。
// 每个策略负责一种行为的逐帧速度决策与附带动作（开火/吃币/状态机推进）；
// 公共帧（动画/白闪/舞蹈/变形/减速/击退衰减/世界后处理/行走摇摆）留在
// BaseArenaScene.steerEnemies。世界差异经场景钩子（wanderDir/fleeDir）。

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
  body.setVelocity(dir.x * a.spec.speed * slow, dir.y * a.spec.speed * slow)
}

const wanderFire: Steerer = ({ scene, a, body, slow, now }) => {
  const spec = a.spec
  if (spec.behavior !== 'wanderFire') return
  const dir = scene.wanderDir(a)
  body.setVelocity(dir.x * spec.speed * slow, dir.y * spec.speed * slow)
  if (now >= a.fireAt) {
    a.fireAt = now + spec.fireIntervalMs
    spawnEnemyShot(scene, a.image.x, a.image.y, Math.atan2(dir.y, dir.x), spec.bullet, spec.name, a.dmgMul)
  }
}

const dash: Steerer = ({ scene, a, body, slow, now, target }) => {
  const spec = a.spec
  if (spec.behavior !== 'dash') return
  const e = a.image
  const d = scene.worldDelta(e, target.image)
  const dist2 = d.x * d.x + d.y * d.y
  if (a.state === 'windup') {
    body.setVelocity(0, 0)
    // 蓄力颤动提示
    e.setRotation(Math.sin(now / 28) * 0.14)
    if (now >= a.windupUntil) {
      a.state = 'dash'
      a.dashUntil = now + (spec.dashDist / spec.dashSpeed) * 1000
      e.setRotation(0)
      e.clearTint()
    }
  } else if (a.state === 'dash') {
    body.setVelocity(a.dirX * spec.dashSpeed * slow, a.dirY * spec.dashSpeed * slow)
    if (now >= a.dashUntil) {
      a.state = 'cool'
      a.coolUntil = now + spec.cooldownMs
    }
  } else if (a.state !== 'cool' && dist2 <= spec.detectRange * spec.detectRange) {
    // 进入探测圈：锁定当前方向蓄力（横向位移可躲）
    const dir = norm(d.x, d.y)
    a.state = 'windup'
    a.windupUntil = now + spec.windupMs
    a.dirX = dir.x
    a.dirY = dir.y
    e.setTint(0xffb74d)
  } else {
    if (a.state === 'cool' && now >= a.coolUntil) {
      a.state = 'wander'
    }
    const dir = scene.wanderDir(a)
    body.setVelocity(dir.x * spec.speed * slow, dir.y * spec.speed * slow)
  }
}

const fleeFire: Steerer = ({ scene, a, body, slow, now, target }) => {
  const spec = a.spec
  if (spec.behavior !== 'fleeFire') return
  const e = a.image
  const d = scene.worldDelta(e, target.image)
  const dist2 = d.x * d.x + d.y * d.y
  if (dist2 <= spec.fleeRange * spec.fleeRange) {
    // 逃离方向经世界钩子修正（有界图贴边沿墙滑行）
    const away = norm(-d.x, -d.y)
    const dir = scene.fleeDir(a, away)
    body.setVelocity(dir.x * spec.speed * slow, dir.y * spec.speed * slow)
  } else {
    const dir = scene.wanderDir(a)
    body.setVelocity(dir.x * spec.speed * 0.4 * slow, dir.y * spec.speed * 0.4 * slow)
  }
  if (now >= a.fireAt) {
    a.fireAt = now + spec.fireIntervalMs
    spawnEnemyShot(scene, e.x, e.y, Math.atan2(d.y, d.x), spec.bullet, spec.name, a.dmgMul)
  }
}

const coinThief: Steerer = ({ scene, a, body, slow }) => {
  const spec = a.spec
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
    const eatR = spec.radius + COIN.radius * UNIT
    if (bestD <= eatR * eatR) {
      coin.destroy()
      a.eaten += 1
    } else {
      const d = scene.worldDelta(e, coin)
      const dir = norm(d.x, d.y)
      body.setVelocity(dir.x * spec.speed * slow, dir.y * spec.speed * slow)
    }
  } else {
    const dir = scene.wanderDir(a)
    body.setVelocity(dir.x * spec.speed * 0.3 * slow, dir.y * spec.speed * 0.3 * slow)
  }
}

export const STEERERS: Record<Enemy['spec']['behavior'], Steerer> = {
  chase,
  wanderFire,
  dash,
  fleeFire,
  coinThief,
}
