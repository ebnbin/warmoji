import { playSfx } from '../audio/sfx'
import { clipFramesLive } from '../emoji/animTextures'
import { createWeapon } from '../weapons/create'
import type { WeaponContext, WeaponOwner } from '../weapons/types'
import { spawnEnemyShot, spawnPoisonPool } from './hazards'
import { enemyOf } from './enemies'
import { memberOf } from './members'
import type { Enemy } from './enemies'
import type { BaseArenaScene, ImageObj } from './BaseArenaScene'

// 敌人持械：spec.weapons 有行即装配武器实例（武器类阵营中立，
// weapons/types.ts）。此处提供敌方视角的 ctx 实现：targets = 队员快照、
// 伤害走队员受击结算（吃无敌帧）、发弹入敌弹组、治疗作用于敌群。
// 注意：spec 随父级 toPx 深换算进场，此处直接实例化，勿二次换算。
// 敌弹机制暂不带贯穿/溅射载荷；队员个体减速机制未建——两者都等
// 首个需要它们的敌械行落地时再扩展。

/** 敌方武器弹药的寿命（武器 spec 无 lifeMs 概念，敌弹必须按寿命回收） */
const BULLET_LIFE_MS = 3000

export function armEnemy(scene: BaseArenaScene, a: Enemy): void {
  const rows = a.spec.weapons
  if (!rows || rows.length === 0) return
  const e = a.image
  const outline = a.elite || a.boss ? 'elite' : 'enemy'
  const owner: WeaponOwner = {
    get x() {
      return e.x
    },
    get y() {
      return e.y
    },
    // 敌人位置主权在物理/移动策略，不做弹性偏移：
    // 自体动作类武器在敌人身上只有判定，身体动画走 held 视觉或 clip
    setVisualOffset() {},
  }
  const ctx: WeaponContext = {
    scene,
    ownerOutline: outline,
    targets: () => scene.frameMemberTargets,
    targetHp: (ref) => memberOf(ref as ImageObj).hp,
    targetMaxHp: (ref) => memberOf(ref as ImageObj).maxHp,
    // 击退参数忽略：队员无击退机制（阵型弹簧持有位置主权）
    damageTarget: (ref, damage) => {
      const m = memberOf(ref as ImageObj)
      if (scene.over || !m.alive) return
      if (scene.elapsedMs - m.lastHitMs < m.iframesMs) return
      m.lastHitMs = scene.elapsedMs
      scene.hurtMember(m, damage, 0xff7777, a.spec.name)
    },
    spawnBullet: (x, y, angle, pSpec, damage) => {
      const p = pSpec.projectile
      spawnEnemyShot(
        scene,
        x,
        y,
        angle,
        { emoji: p.emoji, size: p.size, radius: p.radius, speed: p.speed, damage, lifeMs: BULLET_LIFE_MS },
        a.spec.name,
      )
    },
    anchor: () => ({ x: e.x, y: e.y }),
    applySlow: () => {},
    slowTarget: () => {},
    // 灼烧敌对方的地面区 = 敌方视角的毒液池（同一机制，dps 按 tick 换算）
    spawnBurnZone: (x, y, radius, dps, durationMs) =>
      spawnPoisonPool(
        scene,
        x,
        y,
        { radius, durationMs, tickMs: 400, damage: Math.max(1, Math.round(dps * 0.4)) },
        a.spec.name,
      ),
    heal: (x, y, range, amount, all) => healEnemies(scene, x, y, range, amount, all),
    damageMul: () => a.dmgMul,
    cooldownMul: () => 1,
    sfx: (id) => playSfx(id),
    playOwnerClip: (clipId, durMs) => {
      if (!a.anim) return
      a.anim.register(clipId, clipFramesLive(scene, a.spec.emoji, clipId, outline))
      a.anim.play(clipId, { durMs })
    },
    // 可选能力（吸金币/无敌帧/复活缩时）是队员专属概念：缺席
  }
  a.weaponOwner = owner
  a.weapons = rows.map((w, i) => createWeapon(w, ctx, 600 + i * 230))
}

/** 治疗敌群：all=false 只治血量比例最低的一只；满血者不计，返回被治数量 */
function healEnemies(
  scene: BaseArenaScene,
  x: number,
  y: number,
  range: number,
  amount: number,
  all: boolean,
): number {
  const r2 = range * range
  const hurt: Enemy[] = []
  for (const img of scene.enemies.getChildren() as ImageObj[]) {
    if (!img.active) continue
    const a = enemyOf(img)
    if (a.hp >= a.maxHp) continue
    const dx = img.x - x
    const dy = img.y - y
    if (dx * dx + dy * dy <= r2) hurt.push(a)
  }
  if (hurt.length === 0) return 0
  const targets = all ? hurt : [hurt.reduce((p, q) => (p.hp / p.maxHp <= q.hp / q.maxHp ? p : q))]
  for (const t of targets) t.hp = Math.min(t.maxHp, t.hp + amount)
  return targets.length
}
