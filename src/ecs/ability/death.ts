import { UNIT } from '../../util/units'
import { waveAt } from '../../data/waves'
import type { DecoyEffect, SplitEffect } from '../../types/enemies'
import { Despawn } from '../components'
import { spawnBrood, spawnEnemy } from '../enemy'
import { applyAbilityEffects } from './effects'
import { deathSource } from './source'
import type { PendingDeath, Sim } from '../sim'

// 亡语(onDeath):死亡触发的一串效果。与命中触发 onHit 复用同一套组合式 Effect 与执行器,
// 来源是一份按死者快照捏出来的值——实体已离场,不能再指望它还在。
// 需引擎侧生成敌人实体的两类(分裂/诱饵)本地处理。

/** 分裂:随机散开半格生成 count 个迷你体(无巢;血量吃波次曲线;into 已随父深 px 化) */
function spawnSplit(sim: Sim, d: PendingDeath, fx: SplitEffect): void {
  if (sim.over) return
  spawnBrood(sim, sim.frames, fx.into, fx.count, d.x, d.y, 0.5 * UNIT, -1)
}

/** 诱饵尸壳:原地留一具由自身退化的半透明替身——无伤害/移动/攻击/亡语,到时静默移除 */
function spawnDecoy(sim: Sim, d: PendingDeath, fx: DecoyEffect, hpMul: number): void {
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
  const eid = spawnEnemy(sim, sim.frames, husk, d.x, d.y, Math.round(fx.hp * hpMul), false, false, fx.alpha)
  Despawn.at[eid] = sim.elapsedMs + fx.durationMs
}

/** 在死亡点重放一名死者的亡语。killEnemy 经 sim.onDeathFx 同步调用——
 * 同帧先死者的治疗要能救到同伴,攒到帧末重放会让幽灵群「互相续命」失效 */
export function replayDeath(sim: Sim, d: PendingDeath): void {
  const effects = d.def.onDeath
  if (!effects) return
  const hpMul = waveAt((sim.combatMs + sim.elapsedMs) / 1000).hpMultiplier
  const src = deathSource(d.def.name, d.dmgMul)
  for (const fx of effects) {
    if (fx.kind === 'split') spawnSplit(sim, d, fx)
    else if (fx.kind === 'decoy') spawnDecoy(sim, d, fx, hpMul)
    else applyAbilityEffects(sim, src, [fx], { x: d.x, y: d.y, baseDamage: 0 })
  }
}

/** 排空死亡队列:仅作兜底(onDeathFx 未挂时,如 headless 仿真) */
export function runDeathEffects(sim: Sim): void {
  if (sim.pendingDeaths.length === 0) return
  for (const d of sim.pendingDeaths) replayDeath(sim, d)
  sim.pendingDeaths.length = 0
}
