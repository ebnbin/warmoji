import { waveAt } from '../../run/waves'
import { UNIT } from '../../core/units'
import { applyEffects } from '../../war/abilities/effects'
import { buildEnemyCtx } from './abilities'
import type { Enemy } from './enemies'
import type { EnemyDef, SplitEffect, DecoyEffect } from '../../enemies/registry'
import type { ArcadeBattleScene } from '../ArcadeBattleScene'

// 亡语（onDeath）：死亡触发的一串效果。与命中触发 onHit 复用同一套组合式 Effect
// 和同一个执行器（applyEffects），经敌方 ctx（buildEnemyCtx）求值——留毒走 ground、
// 治疗走 heal、冷枪走 spawnProjectile。只有需要引擎侧生成敌人实体的两类
//（分裂/诱饵）留在本模块本地处理。血量成长曲线按当前波次取，与刷怪同口径。

export function runDeathEffects(scene: ArcadeBattleScene, a: Enemy): void {
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

/** 分裂：随机散开半格生成 count 个迷你体（血量吃波次曲线）。
 * 父 def 进场时已深度 px 化，split.into 随之——直接用，勿二次换算 */
function spawnSplit(scene: ArcadeBattleScene, a: Enemy, fx: SplitEffect): void {
  if (scene.over) return
  scene.spawnBrood(fx.into, fx.count, a.image.x, a.image.y, 0.5 * UNIT)
}

/** 诱饵尸壳：原地留一具由自身退化的半透明替身——无伤害、无移动、无攻击、
 * 不再触发亡语，击退免疫定在原地；到时静默移除（steerEnemies 的 despawnAt 分支） */
function spawnDecoy(scene: ArcadeBattleScene, a: Enemy, fx: DecoyEffect): void {
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
