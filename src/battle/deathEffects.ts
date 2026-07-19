import { waveAt } from '../run/waves'
import { UNIT } from '../lib/units'
import { spawnGroundEffect } from './groundEffects'
import type { Enemy } from './enemies'
import type { BaseArenaScene } from './BaseArenaScene'

// 敌人死亡效果模块：按 spec.onDeath 逐条执行。
// poison 原地留毒液池；split 分裂出迷你体（血量吃当前波次成长曲线）。

export function runDeathEffects(scene: BaseArenaScene, a: Enemy): void {
  const effects = a.spec.onDeath
  if (!effects) return
  const e = a.image
  for (const fx of effects) {
    switch (fx.kind) {
      case 'poison':
        spawnGroundEffect(scene, e.x, e.y, fx, { faction: 'enemy', srcName: a.spec.name })
        break
      case 'split': {
        if (scene.over) break
        const hpMul = waveAt((scene.run.combatMs + scene.elapsedMs) / 1000).hpMultiplier
        // 父 spec 进场时已深度 px 化，split.into 随之——直接用，勿二次换算
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
    }
  }
}
