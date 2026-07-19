import { emojiImage } from '../emoji/textures'
import type { DeathPoisonSpec, EnemyBulletSpec } from '../enemies/registry'
import { circleBody } from './arcade'
import { attachBullet, bulletOf } from './bullets'
import type { ArcadeBody, BaseArenaScene, ImageObj } from './BaseArenaScene'

// 敌方危害物：敌弹、毒液池、灼烧地面——三对 spawn/update 自治循环。
// 敌弹按寿命与世界钩子（cullEnemyShot）回收；毒液池按 tick 烧队员；
// 灼烧地面（余烬秘火）按 tick 烧敌人，伤害归属出招角色（srcSlot）。

export function spawnEnemyShot(
  scene: BaseArenaScene,
  x: number,
  y: number,
  angle: number,
  bullet: EnemyBulletSpec,
  srcName: string,
  dmgMul = 1,
): void {
  const shot = emojiImage(scene, x, y, bullet.emoji, bullet.size, 'enemyShot').setDepth(6)
  scene.physics.add.existing(shot)
  circleBody(shot, bullet.radius)
  ;(shot.body as ArcadeBody).setVelocity(Math.cos(angle) * bullet.speed, Math.sin(angle) * bullet.speed)
  attachBullet(shot, 'enemy', {
    damage: Math.round(bullet.damage * dmgMul),
    srcName,
    radius: bullet.radius,
    dieAt: scene.elapsedMs + bullet.lifeMs,
  })
  scene.enemyShots.add(shot)
}

export function updateEnemyShots(scene: BaseArenaScene): void {
  for (const s of scene.enemyShots.getChildren() as ImageObj[]) {
    if (!s.active) continue
    if (scene.elapsedMs >= bulletOf(s).dieAt || scene.cullEnemyShot(s)) {
      s.destroy()
    }
  }
}

export function spawnPoisonPool(
  scene: BaseArenaScene,
  x: number,
  y: number,
  poison: Pick<DeathPoisonSpec, 'radius' | 'durationMs' | 'tickMs' | 'damage'>,
  srcName: string,
): void {
  const gfx = scene.add.graphics().setDepth(2)
  gfx.fillStyle(0x7cb342, 0.22)
  gfx.fillCircle(0, 0, poison.radius)
  gfx.lineStyle(2, 0x7cb342, 0.5)
  gfx.strokeCircle(0, 0, poison.radius)
  gfx.setPosition(x, y)
  gfx.setScale(0.3)
  scene.tweens.add({ targets: gfx, scale: 1, duration: 220, ease: 'Back.easeOut' })
  scene.poisonPools.push({
    x,
    y,
    r2: poison.radius * poison.radius,
    until: scene.elapsedMs + poison.durationMs,
    tickMs: poison.tickMs,
    damage: poison.damage,
    srcName,
    gfx,
  })
}

export function updatePoisonPools(scene: BaseArenaScene): void {
  if (scene.poisonPools.length === 0) return
  const now = scene.elapsedMs
  scene.poisonPools = scene.poisonPools.filter((p) => {
    if (now >= p.until) {
      scene.tweens.add({ targets: p.gfx, alpha: 0, duration: 250, onComplete: () => p.gfx.destroy() })
      return false
    }
    return true
  })
  for (const m of scene.members) {
    if (!m.alive) continue
    for (const p of scene.poisonPools) {
      const d = scene.worldDelta(p, m.image)
      if (d.x * d.x + d.y * d.y > p.r2) continue
      if (now - m.lastPoisonMs >= p.tickMs) {
        m.lastPoisonMs = now
        scene.hurtMember(m, p.damage, 0xa5d86a, p.srcName)
      }
      break
    }
  }
}

/** 灼烧地面（余烬秘火）：橙红圈，期间周期烧伤区域内敌人，伤害归属出招角色 */
export function spawnBurnZone(
  scene: BaseArenaScene,
  x: number,
  y: number,
  radius: number,
  dps: number,
  durationMs: number,
  srcSlot = -1,
): void {
  const gfx = scene.add.graphics().setDepth(2)
  gfx.fillStyle(0xff7043, 0.18)
  gfx.fillCircle(0, 0, radius)
  gfx.lineStyle(2, 0xff7043, 0.55)
  gfx.strokeCircle(0, 0, radius)
  gfx.setPosition(x, y)
  gfx.setScale(0.3)
  scene.tweens.add({ targets: gfx, scale: 1, duration: 200, ease: 'Back.easeOut' })
  const tickMs = 400
  scene.burnZones.push({
    x,
    y,
    r2: radius * radius,
    until: scene.elapsedMs + durationMs,
    tickDamage: Math.max(1, Math.round((dps * tickMs) / 1000)),
    nextTickAt: scene.elapsedMs + tickMs,
    srcSlot,
    gfx,
  })
}

export function updateBurnZones(scene: BaseArenaScene): void {
  if (scene.burnZones.length === 0) return
  const now = scene.elapsedMs
  scene.burnZones = scene.burnZones.filter((z) => {
    if (now >= z.until) {
      scene.tweens.add({ targets: z.gfx, alpha: 0, duration: 250, onComplete: () => z.gfx.destroy() })
      return false
    }
    return true
  })
  for (const z of scene.burnZones) {
    if (now < z.nextTickAt) continue
    z.nextTickAt = now + 400
    // frameTargets 直查（虚空含镜像：镜像间距 ≥ 半场 ≫ 燃烧半径，不会重复命中）
    for (const t of scene.frameTargets) {
      const dx = t.x - z.x
      const dy = t.y - z.y
      if (dx * dx + dy * dy <= z.r2) {
        scene.applyDamage(t.ref as ImageObj, z.tickDamage, 0, undefined, undefined, z.srcSlot)
      }
    }
  }
}
