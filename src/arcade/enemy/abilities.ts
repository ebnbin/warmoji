import { playSfx } from '../../audio/sfx'
import { clipFramesLive } from '../anim/animTextures'
import { createAbility } from '../abilities/create'
import type { AbilityContext, AbilityOwner } from '../abilities/types'
import { spawnEnemyProjectile } from '../projectiles'
import { spawnGroundEffect } from '../groundEffects'
import { enemyOf } from './enemies'
import { memberOf } from '../member'
import type { Enemy } from './enemies'
import type { ArcadeBattleScene, ImageObj } from '../ArcadeBattleScene'

// def 已随父级 toPx 深换算，此处不得二次换算

/** 敌弹必须按寿命回收；def.lifeMs 可覆写 */
const BULLET_LIFE_MS = 3000

/** 持械与亡语共用同一份 ctx */
export function buildEnemyCtx(scene: ArcadeBattleScene, a: Enemy): AbilityContext {
  const e = a.image
  const outline = a.elite || a.boss ? 'elite' : 'enemy'
  return {
    scene,
    ownerOutline: outline,
    targets: () => scene.frameMemberTargets,
    targetHp: (ref) => memberOf(ref as ImageObj).hp,
    targetMaxHp: (ref) => memberOf(ref as ImageObj).maxHp,
    // 击退忽略：队员位置由阵型弹簧持有
    damageTarget: (ref, damage) => {
      const m = memberOf(ref as ImageObj)
      if (scene.over || !m.alive) return
      if (scene.elapsedMs - m.lastHitMs < m.iframesMs) return
      m.lastHitMs = scene.elapsedMs
      scene.hurtMember(m, damage, 0xff7777, a.def.name)
    },
    spawnProjectile: (x, y, angle, pDef, damage) => {
      const p = pDef.projectile
      spawnEnemyProjectile(
        scene,
        x,
        y,
        angle,
        { emoji: p.emoji, size: p.size, radius: p.radius, speed: p.speed, damage, lifeMs: pDef.lifeMs ?? BULLET_LIFE_MS },
        a.def.name,
      )
    },
    // 速度为零时朝右
    ownerHeading: () => {
      const body = e.body as { velocity?: { x: number; y: number } } | null
      return { x: body?.velocity?.x ?? 0, y: body?.velocity?.y ?? 0 }
    },
    random: () => scene.rng.next(),
    anchor: () => ({ x: e.x, y: e.y }),
    applySlow: () => {},
    slowTarget: () => {},
    spawnGroundEffect: (x, y, def) =>
      spawnGroundEffect(scene, x, y, def, { faction: 'enemy', srcName: a.def.name }),
    heal: (x, y, range, amount, all, exclude) =>
      healEnemies(scene, x, y, range, amount, all, exclude ? enemyOf(exclude as ImageObj) : undefined),
    spawnBullet: (x, y, angle, spec, damage, lifeMs) =>
      spawnEnemyProjectile(
        scene,
        x,
        y,
        angle,
        { emoji: spec.emoji, size: spec.size, radius: spec.radius, speed: spec.speed, damage, lifeMs },
        a.def.name,
        a.dmgMul,
      ),
    damageMul: () => a.dmgMul,
    cooldownMul: () => 1,
    sfx: (id) => playSfx(id),
    playOwnerClip: (clipId, durMs) => {
      if (!a.anim) return
      a.anim.register(clipId, clipFramesLive(scene, a.def.emoji, clipId, outline))
      a.anim.play(clipId, { durMs })
    },
    // 吸金币/无敌帧/复活缩时为队员专属：缺席
  }
}

export function armEnemy(scene: ArcadeBattleScene, a: Enemy, fireDelayMs?: number): void {
  const rows = a.def.abilities
  if (!rows || rows.length === 0) return
  const e = a.image
  const owner: AbilityOwner = {
    get x() {
      return e.x
    },
    get y() {
      return e.y
    },
    // 敌人位置由移动策略持有，不做视觉偏移
    setVisualOffset() {},
  }
  const ctx = buildEnemyCtx(scene, a)
  a.abilityOwner = owner
  a.abilities = rows.map((w, i) =>
    createAbility(
      w,
      ctx,
      (w.kind === 'projectile' ? w.firstDelayMs : undefined) ?? fireDelayMs ?? 600 + i * 230,
    ),
  )
}

/** all=false 只治血量比例最低的一只；满血者不计；返回被治数量 */
export function healEnemies(
  scene: ArcadeBattleScene,
  x: number,
  y: number,
  range: number,
  amount: number,
  all: boolean,
  exclude?: Enemy,
): number {
  const r2 = range * range
  const hurt: Enemy[] = []
  for (const img of scene.enemies.getChildren() as ImageObj[]) {
    if (!img.active) continue
    const a = enemyOf(img)
    if (a === exclude || a.hp >= a.maxHp) continue
    const dx = img.x - x
    const dy = img.y - y
    if (dx * dx + dy * dy <= r2) hurt.push(a)
  }
  if (hurt.length === 0) return 0
  const targets = all ? hurt : [hurt.reduce((p, q) => (p.hp / p.maxHp <= q.hp / q.maxHp ? p : q))]
  for (const t of targets) t.hp = Math.min(t.maxHp, t.hp + amount)
  return targets.length
}
