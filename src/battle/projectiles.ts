import { playSfx } from '../audio/sfx'
import { emojiImage } from '../emoji/textures'
import { circleHitIndices, sweepFirstHitIndex } from '../weapons/spec'
import type { ProjectileSpec } from '../weapons/spec'
import { circleBody } from './arcade'
import { attachBullet, bulletOf } from './bullets'
import type { ArcadeBody, BaseArenaScene, ImageObj } from './BaseArenaScene'

// 玩家侧弹道：生成、线段扫掠命中（低帧率防穿模）、溅射、回收。
// 能力字段（pierce/splash/hex）经 data 随弹携带，扫掠时消费。

export function spawnProjectile(
  scene: BaseArenaScene,
  x: number,
  y: number,
  angle: number,
  spec: ProjectileSpec,
  damage: number,
  srcSlot = -1,
): void {
  const p = emojiImage(scene, x, y, spec.projectile.emoji, spec.projectile.size, 'player')
    .setDepth(8)
    .setRotation(angle + spec.projectile.rotationOffsetRad)
  scene.physics.add.existing(p)
  circleBody(p, spec.projectile.radius)
  ;(p.body as ArcadeBody).setVelocity(
    Math.cos(angle) * spec.projectile.speed,
    Math.sin(angle) * spec.projectile.speed,
  )
  playSfx('shoot')
  attachBullet(p, 'team', {
    srcSlot,
    damage,
    radius: spec.projectile.radius,
    kb: spec.knockback,
    prevX: x,
    prevY: y,
    // 环面世界的子弹永不出屏：按寿命回收（其余图为 0，不按寿命回收）
    dieAt: scene.projectileTtlMs !== null ? scene.elapsedMs + scene.projectileTtlMs : 0,
    // 能力字段：贯穿余量 + 溅射/变形参数（sweepProjectiles 消费）
    pierce: spec.pierce ?? 0,
    splash: spec.splash,
    hex: spec.hex,
    // 对称投掷物（无指向修正角）飞行中自旋；有指向的（飞刀类）保持箭头朝向
    spin: spec.projectile.rotationOffsetRad === 0 ? 9 : 0,
  })
  scene.projectiles.add(p)
}

/** 逐帧对每颗子弹做上一帧位置 → 当前位置的线段扫掠命中。
 * 能力：pierce 命中后不销毁继续飞（跳过已命中敌人）；splash 命中点溅射 */
export function sweepProjectiles(scene: BaseArenaScene, delta: number): void {
  for (const p of scene.projectiles.getChildren() as ImageObj[]) {
    if (!p.active) continue
    const b = bulletOf(p)
    const prev = { x: b.prevX, y: b.prevY }
    // 贯穿弹跳过已命中的敌人（否则下一帧会再撞同一个）
    const hitRefs = b.hitRefs
    const targets = hitRefs ? scene.frameTargets.filter((t) => !hitRefs.has(t.ref as ImageObj)) : scene.frameTargets
    const hit = sweepFirstHitIndex(prev, { x: p.x, y: p.y }, b.radius, targets)
    if (hit >= 0) {
      const target = targets[hit]!
      const { damage, kb, srcSlot, splash, hex } = b
      // 爆浆溅射：命中点小圈内其余敌人吃折损伤害（同真身的镜像间距 ≥ 半场，
      // 远大于溅射半径，不会经镜像重复命中）
      if (splash) {
        const splashDamage = Math.max(1, Math.round(damage * splash.ratio))
        for (const i of circleHitIndices({ x: target.x, y: target.y }, splash.radius, scene.frameTargets)) {
          const other = scene.frameTargets[i]!
          if (other.ref === target.ref) continue
          scene.applyDamage(other.ref as ImageObj, splashDamage, 0, undefined, undefined, srcSlot)
        }
        splashEffect(scene, target.x, target.y, splash.radius)
      }
      if (b.pierce > 0) {
        b.pierce -= 1
        const set = hitRefs ?? new Set<ImageObj>()
        set.add(target.ref as ImageObj)
        b.hitRefs = set
      } else {
        p.destroy()
      }
      // 击退源取上一帧位置：方向即子弹飞行方向
      scene.applyDamage(target.ref as ImageObj, damage, kb, prev.x, prev.y, srcSlot)
      // 魔尘：命中即变形（无害绵羊；死者不变形，Boss 免疫由 applyHex 拒绝）
      if (hex && (target.ref as ImageObj).active) scene.applyHex(target.ref as ImageObj, hex)
      if (!p.active) continue
    }
    if (b.spin > 0) p.rotation += (b.spin * delta) / 1000
    b.prevX = p.x
    b.prevY = p.y
  }
}

/** 爆浆番茄的溅射视觉：小号红色冲击环 */
function splashEffect(scene: BaseArenaScene, x: number, y: number, radius: number): void {
  const ring = scene.add
    .circle(x, y, radius, 0xef5350, 0.25)
    .setStrokeStyle(3, 0xef5350, 0.8)
    .setDepth(7)
    .setScale(0.3)
  scene.tweens.add({
    targets: ring,
    scale: 1,
    alpha: 0,
    duration: 220,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  })
}
