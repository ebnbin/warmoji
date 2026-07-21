import { DEG2RAD } from '../core/units'
import { playSfx } from '../audio/sfx'
import { emojiImage } from '../emoji/textures'
import { circleHitIndices, sweepFirstHitIndex } from '../abilities/defs'
import type { Effect, ProjectileDef } from '../abilities/defs'
import type { TargetInfo } from '../abilities/types'
import { blastRing } from '../abilities/effects'
import type { EnemyProjectileDef } from '../enemies/registry'
import { circleBody } from '../core/arcade'
import type { ArcadeBody, BaseArenaScene, ImageObj } from '../battle/BaseArenaScene'

// 玩家弹走线段扫掠命中（pierce 与 onHit 命中效果链随弹携带）；
// 敌弹走物理 overlap + 寿命与世界钩子（cullEnemyProjectile）回收。

export interface Projectile {
  readonly image: ImageObj
  readonly faction: 'team' | 'enemy'
  damage: number
  radius: number
  /** 上一帧位置（玩家弹扫掠起点；视口重映射时同步改写） */
  prevX: number
  prevY: number
  /** 寿命回收时刻（0 = 不按寿命回收） */
  dieAt: number
  /** 玩家弹：伤害归属槽位 / 击退 / 自旋 / 能力字段 */
  srcSlot: number
  kb: number
  spin: number
  pierce: number
  /** 命中效果链（溅射 blast / 魔尘 morph 等）；弹道机器在命中点求值 */
  onHit?: readonly Effect[]
  hitRefs?: Set<ImageObj>
  /** 敌弹：伤害来源名（战报归属） */
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

// 玩家侧弹道机器：生成、线段扫掠命中（低帧率防穿模）、溅射、回收；
// 敌方弹道机器在文件尾（物理 overlap + 寿命回收）。

export function spawnProjectile(
  scene: BaseArenaScene,
  x: number,
  y: number,
  angle: number,
  def: ProjectileDef,
  damage: number,
  srcSlot = -1,
): void {
  const p = emojiImage(scene, x, y, def.projectile.emoji, def.projectile.size, 'player')
    .setDepth(8)
    .setRotation(angle + def.projectile.rotationOffsetDeg * DEG2RAD)
  scene.physics.add.existing(p)
  circleBody(p, def.projectile.radius)
  ;(p.body as ArcadeBody).setVelocity(
    Math.cos(angle) * def.projectile.speed,
    Math.sin(angle) * def.projectile.speed,
  )
  playSfx('shoot')
  attachProjectile(p, 'team', {
    srcSlot,
    damage,
    radius: def.projectile.radius,
    kb: def.knockback,
    prevX: x,
    prevY: y,
    // 环面世界的子弹永不出屏：按寿命回收（其余图为 0，不按寿命回收）
    dieAt: scene.projectileTtlMs !== null ? scene.elapsedMs + scene.projectileTtlMs : 0,
    // 能力字段：贯穿余量 + 命中效果链（sweepProjectiles 命中点求值）
    pierce: def.pierce ?? 0,
    onHit: def.onHit,
    // 对称投掷物（无指向修正角）飞行中自旋；有指向的（飞刀类）保持箭头朝向
    spin: def.projectile.rotationOffsetDeg === 0 ? 9 : 0,
  })
  scene.projectiles.add(p)
}

/** 逐帧对每颗子弹做上一帧位置 → 当前位置的线段扫掠命中。
 * 能力：pierce 命中后不销毁继续飞（跳过已命中敌人）；onHit 命中点效果 */
export function sweepProjectiles(scene: BaseArenaScene, delta: number): void {
  for (const p of scene.projectiles.getChildren() as ImageObj[]) {
    if (!p.active) continue
    const b = projectileOf(p)
    const prev = { x: b.prevX, y: b.prevY }
    // 贯穿弹跳过已命中的敌人（否则下一帧会再撞同一个）
    const hitRefs = b.hitRefs
    const targets = hitRefs ? scene.frameTargets.filter((t) => !hitRefs.has(t.ref as ImageObj)) : scene.frameTargets
    const hit = sweepFirstHitIndex(prev, { x: p.x, y: p.y }, b.radius, targets)
    if (hit >= 0) {
      const target = targets[hit]!
      const { damage, kb, srcSlot } = b
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
      // 命中效果（溅射 blast / 魔尘 morph 等）：命中点求值，紧随主伤后施加
      applyProjectileHit(scene, b.onHit, target, damage, srcSlot)
      if (!p.active) continue
    }
    if (b.spin > 0) p.rotation += (b.spin * delta) / 1000
    b.prevX = p.x
    b.prevY = p.y
  }
}

/** 弹丸命中效果：命中点求值 onHit（溅射 blast / 魔尘 morph）。弹道机器无 ctx——
 * blast 走 scene.applyDamage（不吃暴击，与弹丸主伤一致），morph 走 scene.applyHex。
 * blast 只打命中点小圈内的「其余」敌人（排除主目标；镜像间距 ≥ 半场 ≫ 效果半径，
 * 不会经镜像重复命中）。 */
function applyProjectileHit(
  scene: BaseArenaScene,
  effects: readonly Effect[] | undefined,
  target: TargetInfo,
  baseDamage: number,
  srcSlot: number,
): void {
  if (!effects) return
  for (const e of effects) {
    if (e.kind === 'blast') {
      const dmg = Math.max(1, Math.round(baseDamage * e.ratio))
      for (const i of circleHitIndices({ x: target.x, y: target.y }, e.radius, scene.frameTargets)) {
        const other = scene.frameTargets[i]!
        if (other.ref === target.ref) continue
        scene.applyDamage(other.ref as ImageObj, dmg, e.knockback, undefined, undefined, srcSlot)
      }
      if (e.ring) blastRing(scene, target.x, target.y, e.radius, e.ring)
    } else if (e.kind === 'morph') {
      // 死者不变形；Boss 免疫由 applyHex 拒绝
      if ((target.ref as ImageObj).active) scene.applyHex(target.ref as ImageObj, e)
    }
  }
}

// ── 敌方弹道机器：物理 overlap + 按寿命与世界钩子回收 ──────────

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
