import { waveAt } from '../../data/waves'
import { UNIT } from '../../util/units'
import { applyEffects } from '../abilities/effects'
import { buildEnemyCtx } from './abilities'
import type { Enemy } from './enemies'
import type { EnemyDef, SplitEffect, DecoyEffect } from '../../types/enemies'
import type { ArcadeBattleScene } from '../ArcadeBattleScene'

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

/** split.into 已随父 def 深换算，不得二次换算；血量按当前波次曲线，与刷怪同口径 */
function spawnSplit(scene: ArcadeBattleScene, a: Enemy, fx: SplitEffect): void {
  if (scene.over) return
  scene.spawnBrood(fx.into, fx.count, a.image.x, a.image.y, 0.5 * UNIT)
}

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
