import { waveAt } from '../run/waves'
import { UNIT } from '../core/units'
import { spawnGroundEffect } from '../groundEffects/groundEffects'
import { spawnEnemyProjectile } from '../projectiles/projectiles'
import { healEnemies } from './enemyAbilities'
import type { Enemy } from './enemies'
import type { EnemyDef } from './registry'
import type { BaseArenaScene } from '../battle/BaseArenaScene'

// 敌人死亡效果模块：按 def.onDeath 逐条执行。
// poison 原地留毒液池；split 分裂出迷你体；deathBullet 朝最近队员放冷枪；
// deathHeal 治疗周围敌群；decoy 留下半透明尸壳吸引火力。
// 血量成长曲线（分裂/替身的 hp）按当前波次取，与刷怪同口径。

export function runDeathEffects(scene: BaseArenaScene, a: Enemy): void {
  const effects = a.def.onDeath
  if (!effects) return
  const e = a.image
  for (const fx of effects) {
    switch (fx.kind) {
      case 'poison':
        spawnGroundEffect(scene, e.x, e.y, fx, { faction: 'enemy', srcName: a.def.name })
        break
      case 'split': {
        if (scene.over) break
        const hpMul = waveAt((scene.run.combatMs + scene.elapsedMs) / 1000).hpMultiplier
        // 父 def 进场时已深度 px 化，split.into 随之——直接用，勿二次换算
        const into = fx.into
        for (let i = 0; i < fx.count; i++) {
          const ang = scene.rng.next() * Math.PI * 2
          scene.materializeEnemy(
            into,
            e.x + Math.cos(ang) * 0.5 * UNIT,
            e.y + Math.sin(ang) * 0.5 * UNIT,
            Math.round(into.hp * hpMul),
          )
        }
        break
      }
      case 'deathBullet': {
        if (scene.over) break
        // 朝死亡那一刻最近存活队员的方向发一枚（弹参已随父 def 深度 px 化）
        const targets = scene.frameMemberTargets
        if (targets.length === 0) break
        let best = targets[0]!
        let bestD = Infinity
        for (const t of targets) {
          const d = scene.worldDelta(e, t.ref)
          const dist = d.x * d.x + d.y * d.y
          if (dist < bestD) {
            bestD = dist
            best = t
          }
        }
        const d = scene.worldDelta(e, best.ref)
        spawnEnemyProjectile(scene, e.x, e.y, Math.atan2(d.y, d.x), fx.projectile, a.def.name, a.dmgMul)
        break
      }
      case 'deathHeal':
        // 治疗周围受伤敌群，排除正在死亡的自己（否则会把治疗浪费在自己身上）
        healEnemies(scene, e.x, e.y, fx.range, fx.amount, fx.all ?? true, a)
        break
      case 'decoy': {
        if (scene.over) break
        const hpMul = waveAt((scene.run.combatMs + scene.elapsedMs) / 1000).hpMultiplier
        // 半透明尸壳 = 死者自身形象退化：无伤害、无移动、无攻击、不再触发亡语，
        // 击退免疫定在原地；到时静默移除
        const husk: EnemyDef = {
          ...a.def,
          damage: 0,
          speed: 0,
          xp: 0,
          coins: 0,
          locomotion: { kind: 'wander' },
          abilities: undefined,
          onDeath: undefined,
          kbImmune: true,
        }
        const h = scene.materializeEnemy(husk, e.x, e.y, Math.round(fx.hp * hpMul), false, false, fx.alpha)
        h.decoy = true
        h.despawnAt = scene.elapsedMs + fx.durationMs
        break
      }
    }
  }
}
