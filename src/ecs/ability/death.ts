import type Phaser from 'phaser'
import { UNIT } from '../../core/units'
import { waveAt } from '../../data/waves'
import { applyEffects } from '../../war/abilities/effects'
import type { EffectCtx, TargetInfo } from '../../war/abilities/types'
import type { DecoyEffect, SplitEffect } from '../../data/enemies'
import { Alive, Despawn, Iframe } from '../components'
import { hurtMember } from '../combat'
import { spawnBrood, spawnEnemy } from '../enemy'
import { spawnGroundEffectEcs } from '../groundEffects'
import { spawnEnemyProjectileEcs } from '../projectile'
import { healEnemiesEcs } from './enemyCtx'
import type { PendingDeath, Sim } from '../sim'
import type { EcsAtlas } from '../render/atlas'

// 亡语(onDeath):死亡触发的一串效果。与命中触发 onHit 复用同一套组合式 Effect 与执行器
// (applyEffects),经死亡点的临时 ctx 求值——留毒走 ground(暂 stub)、治疗走 heal、
// 冷枪走 spawnBullet。需引擎侧生成敌人实体的两类(分裂/诱饵)本地处理。

interface Ref {
  __eid: number
}
const eidOf = (ref: TargetInfo['ref']): number => (ref as unknown as Ref).__eid

/** 死亡点的临时效果 ctx(阵营=敌方):体质倍率取死者快照,索敌=队员快照 */
function makeDeathCtx(sim: Sim, scene: Phaser.Scene, atlas: EcsAtlas, d: PendingDeath): EffectCtx {
  return {
    scene,
    targets: () => sim.memberTargets,
    damageTarget: (ref, damage) => {
      const m = eidOf(ref)
      if (sim.over || !Alive.v[m]) return
      if (sim.elapsedMs - Iframe.last[m]! < Iframe.ms[m]!) return
      Iframe.last[m] = sim.elapsedMs
      hurtMember(sim, m, damage, d.def.name)
    },
    slowTarget: () => {},
    spawnGroundEffect: (x, y, def) => spawnGroundEffectEcs(sim, scene, x, y, def, 'enemy', -1, d.def.name),
    heal: (x, y, range, amount, all, exclude) =>
      healEnemiesEcs(sim, x, y, range, amount, all, exclude ? eidOf(exclude) : undefined),
    spawnBullet: (x, y, angle, spec, damage, lifeMs) =>
      spawnEnemyProjectileEcs(sim, atlas, x, y, angle, {
        emoji: spec.emoji,
        size: spec.size,
        radius: spec.radius,
        speed: spec.speed,
        damage: Math.round(damage * d.dmgMul),
        lifeMs,
        srcName: d.def.name,
      }),
  }
}

/** 分裂:随机散开半格生成 count 个迷你体(无巢;血量吃波次曲线;into 已随父深 px 化) */
function spawnSplit(sim: Sim, atlas: EcsAtlas, d: PendingDeath, fx: SplitEffect): void {
  if (sim.over) return
  spawnBrood(sim, atlas, fx.into, fx.count, d.x, d.y, 0.5 * UNIT, -1)
}

/** 诱饵尸壳:原地留一具由自身退化的半透明替身——无伤害/移动/攻击/亡语,到时静默移除 */
function spawnDecoy(sim: Sim, atlas: EcsAtlas, d: PendingDeath, fx: DecoyEffect, hpMul: number): void {
  if (sim.over) return
  const husk = {
    ...d.def,
    damage: 0,
    speed: 0,
    xp: 0,
    coins: 0,
    locomotion: { kind: 'wander' as const },
    abilities: undefined,
    onDeath: undefined,
    kbImmune: true,
  }
  const eid = spawnEnemy(sim, atlas, husk, d.x, d.y, Math.round(fx.hp * hpMul), false, false, fx.alpha)
  Despawn.at[eid] = sim.elapsedMs + fx.durationMs
}

/** 在死亡点重放一名死者的亡语(镜像 runDeathEffects 的循环体)。
 * killEnemy 经 sim.onDeathFx 同步调用——同帧先死者的治疗要能救到同伴,
 * 攒到帧末重放会让幽灵群「互相续命」失效 */
export function replayDeath(sim: Sim, scene: Phaser.Scene, atlas: EcsAtlas, d: PendingDeath): void {
  const effects = d.def.onDeath
  if (!effects) return
  const hpMul = waveAt((sim.combatMs + sim.elapsedMs) / 1000).hpMultiplier
  let ctx: EffectCtx | undefined
  for (const fx of effects) {
    if (fx.kind === 'split') spawnSplit(sim, atlas, d, fx)
    else if (fx.kind === 'decoy') spawnDecoy(sim, atlas, d, fx, hpMul)
    else {
      ctx ??= makeDeathCtx(sim, scene, atlas, d)
      applyEffects(ctx, [fx], { center: { x: d.x, y: d.y }, baseDamage: 0 })
    }
  }
}

/** 排空死亡队列:仅作兜底(onDeathFx 未挂时,如 headless 仿真) */
export function runDeathEffects(sim: Sim, scene: Phaser.Scene, atlas: EcsAtlas): void {
  if (sim.pendingDeaths.length === 0) return
  for (const d of sim.pendingDeaths) replayDeath(sim, scene, atlas, d)
  sim.pendingDeaths.length = 0
}
