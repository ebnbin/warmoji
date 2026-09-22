import { DEG2RAD } from '../util/units'
import { playSfx } from '../audio/sfx'
import { emojiKey } from '../emoji/textures'
import { sweepFirstHitIndex } from '../arcade/hit'
import type { Effect, ProjectileDef } from '../types/abilityDefs'
import type { EnemyProjectileDef } from '../types/enemies'
import { acquirePooled, releasePooled } from './pool'
import type { ArcadeBody, ArcadeBattleScene, ImageObj } from './ArcadeBattleScene'

// 玩家弹走线段扫掠命中；敌弹走物理 overlap

export interface Projectile {
  readonly image: ImageObj
  readonly faction: 'team' | 'enemy'
  damage: number
  radius: number
  /** 扫掠起点；视口重映射时须同步改写 */
  prevX: number
  prevY: number
  /** 满速基准；每帧 velocity = 基准 × 世界时标 */
  bvx: number
  bvy: number
  /** 0 = 不按寿命回收 */
  dieAt: number
  // 玩家弹
  srcSlot: number
  kb: number
  spin: number
  pierce: number
  /** 命中点求值 */
  onHit?: readonly Effect[]
  hitRefs?: Set<ImageObj>
  /** 敌弹：战报归属 */
  srcName?: string
}

export function attachProjectile(image: ImageObj, faction: Projectile['faction'], init: Partial<Projectile>): Projectile {
  const b: Projectile = {
    image,
    faction,
    damage: 0,
    radius: 0,
    prevX: image.x,
    prevY: image.y,
    bvx: 0,
    bvy: 0,
    dieAt: 0,
    srcSlot: -1,
    kb: 0,
    spin: 0,
    pierce: 0,
    ...init,
  }
  image.setData('projectile', b)
  return b
}

export function projectileOf(image: ImageObj): Projectile {
  return image.getData('projectile') as Projectile
}

// ── 玩家弹 ──

export function spawnProjectile(
  scene: ArcadeBattleScene,
  x: number,
  y: number,
  angle: number,
  def: ProjectileDef,
  damage: number,
  srcSlot = -1,
): void {
  const p = acquirePooled(scene, scene.projectiles, x, y, emojiKey(def.projectile.emoji, 'player'), def.projectile.size, def.projectile.radius)
  p.setDepth(8).setRotation(angle + def.projectile.rotationOffsetDeg * DEG2RAD)
  // 出膛即按世界时标缩放（时停期出膛也凝住）
  const bvx = Math.cos(angle) * def.projectile.speed
  const bvy = Math.sin(angle) * def.projectile.speed
  const scale = scene.worldTimeScale()
  ;(p.body as ArcadeBody).setVelocity(bvx * scale, bvy * scale)
  playSfx('shoot')
  attachProjectile(p, 'team', {
    srcSlot,
    damage,
    radius: def.projectile.radius,
    kb: def.knockback,
    prevX: x,
    prevY: y,
    bvx,
    bvy,
    dieAt: scene.projectileTtlMs !== null ? scene.elapsedMs + scene.projectileTtlMs : 0,
    pierce: def.pierce ?? 0,
    onHit: def.onHit,
    // 无指向修正角的对称投掷物才自旋
    spin: def.projectile.rotationOffsetDeg === 0 ? 9 : 0,
  })
}

export function sweepProjectiles(scene: ArcadeBattleScene, delta: number): void {
  for (const p of scene.projectiles.getChildren() as ImageObj[]) {
    if (!p.active) continue
    const b = projectileOf(p)
    const prev = { x: b.prevX, y: b.prevY }
    const hitRefs = b.hitRefs
    const targets = hitRefs ? scene.frameTargets.filter((t) => !hitRefs.has(t.ref as ImageObj)) : scene.frameTargets
    const hit = sweepFirstHitIndex(prev, { x: p.x, y: p.y }, b.radius, targets)
    // 墙比命中点更近时命中作废
    const wall = scene.wallHit(prev, { x: p.x, y: p.y })
    if (wall !== null) {
      const dw = (wall.x - prev.x) ** 2 + (wall.y - prev.y) ** 2
      const t = hit >= 0 ? targets[hit]! : undefined
      if (!t || dw <= (t.x - prev.x) ** 2 + (t.y - prev.y) ** 2) {
        releasePooled(p)
        continue
      }
    }
    if (hit >= 0) {
      const target = targets[hit]!
      const { damage, kb, srcSlot } = b
      if (b.pierce > 0) {
        b.pierce -= 1
        const set = hitRefs ?? new Set<ImageObj>()
        set.add(target.ref as ImageObj)
        b.hitRefs = set
      } else {
        releasePooled(p)
      }
      // 击退源取上一帧位置
      scene.applyDamage(target.ref as ImageObj, damage, kb, prev.x, prev.y, srcSlot)
      // 须在 applyDamage 之后
      scene.runProjectileHit(b.onHit, target, damage, srcSlot)
      if (!p.active) continue
    }
    if (b.spin > 0) p.rotation += (b.spin * delta) / 1000
    b.prevX = p.x
    b.prevY = p.y
  }
}

// ── 敌弹 ──

export function spawnEnemyProjectile(
  scene: ArcadeBattleScene,
  x: number,
  y: number,
  angle: number,
  projectile: EnemyProjectileDef,
  srcName: string,
  dmgMul = 1,
): void {
  const shot = acquirePooled(scene, scene.enemyProjectiles, x, y, emojiKey(projectile.emoji, 'enemyProjectile'), projectile.size, projectile.radius)
  shot.setDepth(6)
  // 出膛即按世界时标缩放
  const bvx = Math.cos(angle) * projectile.speed
  const bvy = Math.sin(angle) * projectile.speed
  const scale = scene.worldTimeScale()
  ;(shot.body as ArcadeBody).setVelocity(bvx * scale, bvy * scale)
  attachProjectile(shot, 'enemy', {
    damage: Math.round(projectile.damage * dmgMul),
    srcName,
    radius: projectile.radius,
    dieAt: scene.elapsedMs + projectile.lifeMs,
    bvx,
    bvy,
  })
}

export function updateEnemyProjectiles(scene: ArcadeBattleScene): void {
  for (const s of scene.enemyProjectiles.getChildren() as ImageObj[]) {
    if (!s.active) continue
    if (scene.elapsedMs >= projectileOf(s).dieAt || scene.cullEnemyProjectile(s)) {
      releasePooled(s)
    }
  }
}
