import { UNIT } from '../../util/units'
import { waveAt } from '../../data/waves'
import type { DeathEffect, DecoyEffect, SplitEffect } from '../../types/enemies'
import type { Effect } from '../../types/abilityDefs'
import { Despawn } from '../components'
import { spawnBrood, spawnEnemy } from '../entities/enemy'
import { applyAbilityEffects } from './effects'
import { enemySource } from '../utils/source'
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
/** 一条亡语怎么落地 */
type DeathHandler = (sim: Sim, d: PendingDeath, fx: DeathEffect, hpMul: number) => void

/** 绝大多数亡语就是一条普通命中效果，交给效果层 */
const toEffectLayer: DeathHandler = (sim, d, fx) => {
  applyAbilityEffects(sim, enemySource(d.def.name, d.dmgMul), [fx as Effect], {
    x: d.x,
    y: d.y,
    baseDamage: 0,
  })
}

/** 每种亡语一个处理器。**全映射**：DeathEffect 新增一种（含 Effect 新增一种）而不在此
 * 登记 = 编译不过，逼你当场决定「它走效果层，还是要像 split/decoy 那样特殊处理」。
 * 从前是 `split → decoy → else 全丢给效果层`，新增一种只会静默滑进 else */
const DEATH_KINDS: Record<DeathEffect['kind'], DeathHandler> = {
  split: (sim, d, fx) => spawnSplit(sim, d, fx as SplitEffect),
  decoy: (sim, d, fx, hpMul) => spawnDecoy(sim, d, fx as DecoyEffect, hpMul),
  blast: toEffectLayer,
  damage: toEffectLayer,
  slow: toEffectLayer,
  poison: toEffectLayer,
  morph: toEffectLayer,
  attackSlow: toEffectLayer,
  ground: toEffectLayer,
  heal: toEffectLayer,
  spawnProjectile: toEffectLayer,
}

export function replayDeath(sim: Sim, d: PendingDeath): void {
  const effects = d.def.onDeath
  if (!effects) return
  const hpMul = waveAt((sim.combatMs + sim.elapsedMs) / 1000).hpMultiplier
  for (const fx of effects) DEATH_KINDS[fx.kind]!(sim, d, fx, hpMul)
}

