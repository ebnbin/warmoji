import type Phaser from 'phaser'
import { playSfx } from '../../audio/sfx'
import type { AbilityContext, TargetInfo } from '../../abilities/types'
import type { CharacterEffects, TeamEffects } from '../../items/registry'
import { Alive, Hp, Iframe, MAtkSlow, MHp, Poison, Slow, Transform } from '../components'
import { applyDamage } from '../combat'
import { applyMorph } from '../morph'
import { enemyDef } from '../store'
import { spawnGroundEffectEcs } from '../groundEffects'
import { spawnProjectileEcs } from '../projectile'
import type { Sim } from '../sim'
import type { EcsAtlas } from '../render/atlas'

// 队伍侧能力上下文(ECS 版):把旧 memberCtx 的动作面实现到 ECS 上,让 createAbility 造出的
// 能力运行时(ProjectileAbility 等)原样复用。目标引用用 {__eid} 包装(对能力代码不透明,
// 只回传给 ctx 方法);held 视觉等由运行时经 ctx.scene 自建(经 emojiImage 包装,非直接 phaser)。
// P3c:实现开火/索敌/伤害/治疗核心;减速/毒/变羊/地面/召唤等效果面 P3d 起补。

interface Ref {
  __eid: number
}
const eidOf = (ref: TargetInfo['ref']): number => (ref as unknown as Ref).__eid

/** 治疗范围内我方(all=全体/否则最缺血一名);返回实际被治数(满血不计) */
function healMembers(sim: Sim, x: number, y: number, range: number, amount: number, all: boolean): number {
  const r2 = range * range
  if (all) {
    let n = 0
    for (const m of sim.members) {
      if (!Alive.v[m]) continue
      const dx = Transform.x[m]! - x
      const dy = Transform.y[m]! - y
      if (dx * dx + dy * dy > r2) continue
      if (MHp.hp[m]! >= MHp.max[m]!) continue
      MHp.hp[m] = Math.min(MHp.max[m]!, MHp.hp[m]! + amount)
      n++
    }
    return n
  }
  let best = -1
  let bestHp = Infinity
  for (const m of sim.members) {
    if (!Alive.v[m]) continue
    const dx = Transform.x[m]! - x
    const dy = Transform.y[m]! - y
    if (dx * dx + dy * dy > r2) continue
    if (MHp.hp[m]! >= MHp.max[m]!) continue
    if (MHp.hp[m]! < bestHp) {
      bestHp = MHp.hp[m]!
      best = m
    }
  }
  if (best < 0) return 0
  MHp.hp[best] = Math.min(MHp.max[best]!, MHp.hp[best]! + amount)
  return 1
}

/** 造一个队伍侧能力上下文(按槽位) */
export function makeTeamCtx(
  sim: Sim,
  scene: Phaser.Scene,
  atlas: EcsAtlas,
  slot: number,
  fx: CharacterEffects,
  teamFx: TeamEffects,
): AbilityContext {
  return {
    scene,
    ownerOutline: 'player',
    targets: () => sim.enemyTargets,
    damageTarget: (ref, dmg, kb, sx, sy) => applyDamage(sim, eidOf(ref), dmg, kb ?? 0, sx, sy),
    slowTarget: (ref, factor, durationMs) => {
      const eid = eidOf(ref)
      Slow.until[eid] = sim.elapsedMs + durationMs
      Slow.mul[eid] = factor
    },
    poisonTarget: (ref, damage, tickMs, durationMs) => {
      const eid = eidOf(ref)
      Poison.until[eid] = sim.elapsedMs + durationMs
      Poison.nextTick[eid] = sim.elapsedMs + tickMs
      Poison.dmg[eid] = damage
      Poison.tickMs[eid] = tickMs
      Poison.slot[eid] = slot
    },
    morphTarget: (ref, spec) => {
      const eid = eidOf(ref)
      if (enemyDef[eid] !== undefined) applyMorph(sim, atlas, eid, spec) // 死者不变形
    },
    spawnGroundEffect: (x, y, def) => spawnGroundEffectEcs(sim, scene, x, y, def, 'team'),
    heal: (x, y, range, amount, all) => healMembers(sim, x, y, range, amount, all),
    targetHp: (ref) => Hp.v[eidOf(ref)] ?? 0,
    targetMaxHp: (ref) => Hp.max[eidOf(ref)] ?? 0,
    spawnProjectile: (x, y, angle, def, damage) => spawnProjectileEcs(sim, atlas, x, y, angle, def, damage, slot),
    anchor: () => sim.center,
    applySlow: () => {}, // P3d
    damageMul: () => fx.damageMul * teamFx.teamDamageMul,
    // 黏黏怪攻速惩罚:被蹭到的队员攻速变慢(叠乘进冷却,到时自动失效)
    cooldownMul: () => {
      const m = sim.members[slot]
      const atk = m !== undefined && MAtkSlow.until[m]! > sim.elapsedMs ? MAtkSlow.mul[m]! : 1
      return fx.cooldownMul * teamFx.teamCooldownMul * atk
    },
    sfx: (id) => playSfx(id),
    playOwnerClip: () => {}, // P6 动画
    ownerHeading: () => sim.teamDir,
    random: () => Math.random(),
    grantOwnerInvuln: (ms) => {
      const m = sim.members[slot]
      if (m !== undefined) Iframe.last[m] = sim.elapsedMs + ms - Iframe.ms[m]!
    },
  }
}
