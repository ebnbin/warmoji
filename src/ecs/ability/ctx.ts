import type Phaser from 'phaser'
import { query } from 'bitecs'
import { playSfx } from '../../audio/sfx'
import { waveAt } from '../../run/waves'
import { CRIT_MUL } from '../../items/registry'
import { labFireRate } from '../../run/lab'
import type { AbilityContext, EffectCtx, TargetInfo } from '../../abilities/types'
import type { CharacterEffects, TeamEffects } from '../../items/registry'
import { Alive, Boss, ENEMY_SET, EState, Hp, Iframe, MAtkSlow, MFlash, MHp, Poison, Revive, Slow, Tint, Transform } from '../components'
import { applyDamage, reviveMember } from '../combat'
import { applyMorph } from '../morph'
import { playClip } from '../anim'
import { enemyDef } from '../store'
import { spawnGroundEffectEcs } from '../groundEffects'
import { spawnProjectileEcs } from '../projectile'
import type { Sim } from '../sim'
import type { EcsAtlas } from '../render/atlas'

// 队伍侧能力上下文(ECS 版):把旧 memberCtx 的动作面实现到 ECS 上,让 createAbility 造出的
// 能力运行时(ProjectileAbility 等)原样复用。目标引用用 {__eid} 包装(对能力代码不透明,
// 只回传给 ctx 方法);held 视觉等由运行时经 ctx.scene 自建(经 emojiImage 包装,非直接 phaser)。
// 暴击/击退倍率/伤害与冷却乘区在此收口:所有能力路径统一生效,无需逐能力改造。

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
  let bestRatio = Infinity // 镜像 healAllies:挑「血量比例」最低者,不是绝对血量最低者
  for (const m of sim.members) {
    if (!Alive.v[m]) continue
    const dx = Transform.x[m]! - x
    const dy = Transform.y[m]! - y
    if (dx * dx + dy * dy > r2) continue
    if (MHp.hp[m]! >= MHp.max[m]!) continue
    const ratio = MHp.hp[m]! / MHp.max[m]!
    if (ratio < bestRatio) {
      bestRatio = ratio
      best = m
    }
  }
  if (best < 0) return 0
  MHp.hp[best] = Math.min(MHp.max[best]!, MHp.hp[best]! + amount)
  return 1
}

/** 抛射物 onHit 命中链的效果执行面(镜像旧 teamEffectCtx):归属槽位由 sim.effectSlot 逐次命中
 * 改写——子弹可能比发射者活得久,故挂在 sim 上而非闭包里。与 makeTeamCtx 的关键差别:
 * 不掷暴击、不乘击退倍率(溅射只是主伤的附带,不再单独走一遍暴击/加成) */
export function makeEffectCtx(sim: Sim, scene: Phaser.Scene, atlas: EcsAtlas): EffectCtx {
  return {
    scene,
    targets: () => sim.enemyTargets,
    damageTarget: (ref, dmg, kb, sx, sy) => applyDamage(sim, eidOf(ref), dmg, kb ?? 0, sx, sy, sim.effectSlot),
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
      Poison.slot[eid] = sim.effectSlot
    },
    spawnGroundEffect: (x, y, def) => spawnGroundEffectEcs(sim, scene, x, y, def, 'team', sim.effectSlot),
    heal: (x, y, range, amount, all) => healMembers(sim, x, y, range, amount, all),
    // 死者不变形(子弹主伤可能已致死)
    morphTarget: (ref, spec) => {
      const eid = eidOf(ref)
      if (enemyDef[eid] !== undefined) applyMorph(sim, atlas, eid, spec)
    },
  }
}

/** 造一个队伍侧能力上下文(按槽位)。bare=队长技能载荷用的「基座」:
 * 不掷暴击、不乘击退倍率,伤害乘区只含技能限时增伤(镜像旧 abilityCtx 与 memberCtx 的分野) */
export function makeTeamCtx(
  sim: Sim,
  scene: Phaser.Scene,
  atlas: EcsAtlas,
  slot: number,
  fx: CharacterEffects,
  teamFx: TeamEffects,
  testMode = false,
  bare = false,
): AbilityContext {
  // 测试模式攻速旋钮:冷却按 labFireRate 现算(每帧读,改档即生效不重开)
  const fireFactor = (): number => (testMode ? 1 / labFireRate() : 1)
  return {
    scene,
    ownerOutline: 'player',
    targets: () => sim.enemyTargets,
    // 暴击/击退倍率在此收口:所有能力伤害路径统一生效,无需逐能力改造(镜像 memberCtx.damageTarget)
    damageTarget: (ref, dmg, kb, sx, sy) => {
      if (bare) {
        applyDamage(sim, eidOf(ref), dmg, kb ?? 0, sx, sy, slot)
        return
      }
      const critChance = Math.min(0.5, fx.critChance + teamFx.critAdd + sim.battleFx.critAdd)
      const crit = critChance > 0 && sim.rng.next() < critChance
      const d = crit ? Math.round(dmg * CRIT_MUL) : dmg
      applyDamage(sim, eidOf(ref), d, (kb ?? 0) * fx.knockbackMul, sx, sy, slot, crit)
    },
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
    spawnGroundEffect: (x, y, def) => spawnGroundEffectEcs(sim, scene, x, y, def, 'team', slot),
    heal: (x, y, range, amount, all) => healMembers(sim, x, y, range, amount, all),
    // 已中毒判定(召唤类索敌优先挑没中毒的目标,避免毒效重复覆盖)
    isPoisoned: (ref) => Poison.until[eidOf(ref)]! > sim.elapsedMs,
    targetHp: (ref) => Hp.v[eidOf(ref)] ?? 0,
    targetMaxHp: (ref) => Hp.max[eidOf(ref)] ?? 0,
    spawnProjectile: (x, y, angle, def, damage) => spawnProjectileEcs(sim, atlas, x, y, angle, def, damage, slot),
    anchor: () => sim.center,
    // 核弹类按波次成长(与敌人血量曲线同源);Boss 另按 bossRatio 减伤
    waveScale: () => (testMode ? 1 : waveAt((sim.combatMs + sim.elapsedMs) / 1000).hpMultiplier),
    isBossTarget: (ref) => Boss.v[eidOf(ref)] === 1,
    // 光环类:仅本帧生效,每帧由能力重新登记(寒气光环 / 磁力回旋镖)
    applySlow: (x, y, radius, factor) => sim.frameSlowZones.push({ x, y, r2: radius * radius, factor }),
    attractCoins: (x, y, radius) => sim.frameAttractors.push({ x, y, r2: radius * radius }),
    // 队长技能的限时增伤(弱点讲义)叠进队伍伤害乘区,到期由 stepSim 复原
    damageMul: () =>
      bare ? sim.skillDamageMul : fx.damageMul * teamFx.teamDamageMul * sim.battleFx.teamDamageMul * sim.skillDamageMul,
    // 黏黏怪攻速惩罚:被蹭到的队员攻速变慢(叠乘进冷却,到时自动失效)
    cooldownMul: () => {
      const m = sim.members[slot]
      const atk = m !== undefined && MAtkSlow.until[m]! > sim.elapsedMs ? MAtkSlow.mul[m]! : 1
      return fx.cooldownMul * teamFx.teamCooldownMul * sim.battleFx.teamCooldownMul * atk * fireFactor()
    },
    sfx: (id) => playSfx(id),
    // 本体动画:durMs = 本次行为的真实间隔(攻速直接驱动动画速度,不预测)
    playOwnerClip: (clipId, durMs) => {
      const m = sim.members[slot]
      if (m !== undefined) playClip(sim, atlas, m, clipId, durMs)
    },
    ownerHeading: () => sim.teamDir,
    random: () => Math.random(),
    grantOwnerInvuln: (ms) => {
      const m = sim.members[slot]
      if (m !== undefined) Iframe.last[m] = sim.elapsedMs + ms - Iframe.ms[m]!
    },
    // ── 队伍级操作(队长主动技能载荷用)──────────────────────
    /** 全队集结(镜像 rallyTeam):阵亡者满血复活、存活者按上限比例回复、全队短暂无敌。
     * 无敌走受击无敌帧通道(把「上次受击」推到未来),挡接触与敌弹 */
    rallyTeam: (healRatio, invulnMs) => {
      for (const m of sim.members) {
        if (!Alive.v[m]) reviveMember(sim, m)
        else MHp.hp[m] = Math.min(MHp.max[m]!, MHp.hp[m]! + MHp.max[m]! * healRatio)
        Iframe.last[m] = sim.elapsedMs + invulnMs - Iframe.ms[m]!
        // 到手反馈:全队闪一下圣光金(走受击闪光同一通道,到期由 memberVisual 复原)
        MFlash.until[m] = sim.elapsedMs + 320
        Tint.color[m] = 0xffe082
        Tint.effect[m] = 0
      }
    },
    /** 全场蹦迪(镜像 danceTargets):窗口内全体敌人定身摇摆(含窗口内新登场者),
     * 并打断蓄力/冲刺中间态。窗口用 sim 级时刻表达,故新怪天然跟着跳 */
    danceTargets: (durationMs) => {
      sim.danceEndsAt = sim.elapsedMs + durationMs
      for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
        if (EState.v[eid] === 2 || EState.v[eid] === 3) {
          EState.v[eid] = Boss.v[eid] ? 1 : 0
          Tint.effect[eid] = 0
          Tint.color[eid] = 0xffffff
        }
      }
    },
    /** 时停(镜像 startTimeStop):窗口内世界时标随队伍移动量放缩,窗口按世界时长排空 */
    timeStop: (durationMs) => {
      sim.timeStopMsLeft = durationMs
    },
    /** 限时全队增伤(镜像 buffTeamDamage):不叠加,直接覆写,到期 stepSim 复原 */
    buffTeamDamage: (mul, durationMs) => {
      sim.skillDamageMul = mul
      sim.skillBuffUntil = sim.elapsedMs + durationMs
      for (const m of sim.members) {
        if (!Alive.v[m]) continue
        MFlash.until[m] = sim.elapsedMs + 350
        Tint.color[m] = 0x80d8ff
        Tint.effect[m] = 0
      }
    },
    /** 战场掉币(镜像 spawnRewardCoins):落地待拾,音效与爆点随拾取管线 */
    spawnCoins: (x, y, count) => {
      if (sim.over) return
      sim.pendingBursts.push({ x, y, count: 6, kind: 'coin' })
      playSfx('coin')
      sim.pendingCoins.push({ x, y, count })
    },
    /** 电击起搏(镜像 cutReviveTimer):给范围内复活倒计时最长的阵亡队友减 ms */
    cutReviveTimer: (x, y, range, ms) => {
      const r2 = range * range
      let best = -1
      for (const m of sim.members) {
        if (Alive.v[m]) continue
        const dx = Transform.x[m]! - x
        const dy = Transform.y[m]! - y
        if (dx * dx + dy * dy > r2) continue
        if (best < 0 || Revive.at[m]! > Revive.at[best]!) best = m
      }
      if (best < 0) return false
      Revive.at[best] = Revive.at[best]! - ms
      return true
    },
  }
}
