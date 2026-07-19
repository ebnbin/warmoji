import { emojiImage } from '../emoji/textures'
import type { EnemyProjectileDef } from '../enemies/registry'
import { circleBody } from './arcade'
import { attachProjectile, projectileOf } from './projectiles'
import type { ArcadeBody, BaseArenaScene, ImageObj } from './BaseArenaScene'

// 敌方弹道机器：物理 overlap + 按寿命与世界钩子（cullEnemyProjectile）
// 回收。地面效果（毒液/灼烧）已统一至 battle/groundEffects.ts。

export function spawnEnemyProjectile(
  scene: BaseArenaScene,
  x: number,
  y: number,
  angle: number,
  projectile: EnemyProjectileDef,
  srcName: string,
  dmgMul = 1,
): void {
  const shot = emojiImage(scene, x, y, projectile.emoji, projectile.size, 'enemyProjectile').setDepth(6)
  scene.physics.add.existing(shot)
  circleBody(shot, projectile.radius)
  ;(shot.body as ArcadeBody).setVelocity(Math.cos(angle) * projectile.speed, Math.sin(angle) * projectile.speed)
  attachProjectile(shot, 'enemy', {
    damage: Math.round(projectile.damage * dmgMul),
    srcName,
    radius: projectile.radius,
    dieAt: scene.elapsedMs + projectile.lifeMs,
  })
  scene.enemyProjectiles.add(shot)
}

export function updateEnemyProjectiles(scene: BaseArenaScene): void {
  for (const s of scene.enemyProjectiles.getChildren() as ImageObj[]) {
    if (!s.active) continue
    if (scene.elapsedMs >= projectileOf(s).dieAt || scene.cullEnemyProjectile(s)) {
      s.destroy()
    }
  }
}
