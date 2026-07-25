import { DEG2RAD } from '../core/units'
import { playSfx } from '../audio/sfx'
import { emojiKey } from '../emoji/textures'
import { sweepFirstHitIndex } from '../abilities/defs'
import type { Effect, ProjectileDef } from '../abilities/defs'
import type { EnemyProjectileDef } from '../enemies/registry'
import { acquirePooled, releasePooled } from './pool'
import type { ArcadeBody, ArcadeBattleScene, ImageObj } from './ArcadeBattleScene'

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
  /** 满速基准速度（秒针图逐帧按世界时标重设 velocity = base×scale；常速图恒等于出膛速度） */
  bvx: number
  bvy: number
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

// 玩家侧弹道机器：生成、线段扫掠命中（低帧率防穿模）、溅射、回收；
// 敌方弹道机器在文件尾（物理 overlap + 寿命回收）。

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
  // 满速基准 + 出膛即按世界时标缩放（时停期玩家弹一出膛也凝住；常态 scale=1 无变化）
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
    // 环面世界的子弹永不出屏：按寿命回收（其余图为 0，不按寿命回收）
    dieAt: scene.projectileTtlMs !== null ? scene.elapsedMs + scene.projectileTtlMs : 0,
    // 能力字段：贯穿余量 + 命中效果链（sweepProjectiles 命中点求值）
    pierce: def.pierce ?? 0,
    onHit: def.onHit,
    // 对称投掷物（无指向修正角）飞行中自旋；有指向的（飞刀类）保持箭头朝向
    spin: def.projectile.rotationOffsetDeg === 0 ? 9 : 0,
  })
}

/** 逐帧对每颗子弹做上一帧位置 → 当前位置的线段扫掠命中。
 * 能力：pierce 命中后不销毁继续飞（跳过已命中敌人）；onHit 命中点效果 */
export function sweepProjectiles(scene: ArcadeBattleScene, delta: number): void {
  for (const p of scene.projectiles.getChildren() as ImageObj[]) {
    if (!p.active) continue
    const b = projectileOf(p)
    const prev = { x: b.prevX, y: b.prevY }
    // 贯穿弹跳过已命中的敌人（否则下一帧会再撞同一个）
    const hitRefs = b.hitRefs
    const targets = hitRefs ? scene.frameTargets.filter((t) => !hitRefs.has(t.ref as ImageObj)) : scene.frameTargets
    const hit = sweepFirstHitIndex(prev, { x: p.x, y: p.y }, b.radius, targets)
    // 残垣图：子弹撞墙即销毁（墙比命中点更近时，命中作废）——其余图 wallHit 恒 null
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
      // 击退源取上一帧位置：方向即子弹飞行方向
      scene.applyDamage(target.ref as ImageObj, damage, kb, prev.x, prev.y, srcSlot)
      // 命中效果（溅射 blast / 魔尘 morph 等）：命中点求值，紧随主伤后施加（统一执行器）
      scene.runProjectileHit(b.onHit, target, damage, srcSlot)
      if (!p.active) continue
    }
    if (b.spin > 0) p.rotation += (b.spin * delta) / 1000
    b.prevX = p.x
    b.prevY = p.y
  }
}

// ── 敌方弹道机器：物理 overlap + 按寿命与世界钩子回收 ──────────

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
  // 满速基准 + 出膛即按世界时标缩放（时停期敌弹一出膛就凝住）
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
