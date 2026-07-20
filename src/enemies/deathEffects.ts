import { waveAt } from '../run/waves'
import { UNIT } from '../core/units'
import { applyEffects } from '../abilities/effects'
import { buildEnemyCtx } from './enemyAbilities'
import type { Enemy } from './enemies'
import type { EnemyDef, SplitEffect, DecoyEffect } from './registry'
import type { BaseArenaScene } from '../battle/BaseArenaScene'

// 亡语（onDeath）：死亡触发的一串效果。与命中触发 onHit 复用同一套组合式 Effect
// 和同一个执行器（applyEffects），经敌方 ctx（buildEnemyCtx）求值——留毒走 ground、
// 治疗走 heal、冷枪走 spawnProjectile。只有需要引擎侧生成敌人实体的两类
//（分裂/诱饵）留在本模块本地处理。血量成长曲线按当前波次取，与刷怪同口径。

export function runDeathEffects(scene: BaseArenaScene, a: Enemy): void {
  const effects = a.def.onDeath
  if (!effects) return
  const e = a.image
  const ctx = buildEnemyCtx(scene, a)
  const hit = { center: { x: e.x, y: e.y }, baseDamage: 0, source: e }
  for (const fx of effects) {
    if (fx.kind === 'split') spawnSplit(scene, a, fx)
    else if (fx.kind === 'decoy') spawnDecoy(scene, a, fx)
    else applyEffects(ctx, [fx], hit)
  }
}

/** 分裂：生成 count 个迷你体，血量吃当前波次成长曲线，随机散开半格 */
function spawnSplit(scene: BaseArenaScene, a: Enemy, fx: SplitEffect): void {
  if (scene.over) return
  const e = a.image
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
}

/** 诱饵尸壳：原地留一具由自身退化的半透明替身——无伤害、无移动、无攻击、
 * 不再触发亡语，击退免疫定在原地；到时静默移除（steerEnemies 的 despawnAt 分支） */
function spawnDecoy(scene: BaseArenaScene, a: Enemy, fx: DecoyEffect): void {
  if (scene.over) return
  const e = a.image
  const hpMul = waveAt((scene.run.combatMs + scene.elapsedMs) / 1000).hpMultiplier
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
}
