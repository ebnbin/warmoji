import type Phaser from 'phaser'
import { query } from 'bitecs'
import { playSfx } from '../../audio/sfx'
import type { AbilityContext, TargetInfo } from '../../abilities/types'
import { Alive, Boss, DmgMul, Elite, ENEMY_SET, Hp, Iframe, MHp, Transform } from '../components'
import { hurtMember } from '../combat'
import { spawnGroundEffectEcs } from '../groundEffects'
import { spawnEnemyProjectileEcs } from '../projectile'
import { enemyVelX, enemyVelY, memberRef } from '../store'
import type { Sim } from '../sim'
import type { EcsAtlas } from '../render/atlas'

// 敌方能力上下文(ECS 版):把旧 buildEnemyCtx 的动作面实现到 ECS 上——targets=队员快照、
// 伤害走队员受击结算(吃无敌帧)、发弹入敌弹机器、治疗作用于敌群。持械(armEnemyEcs)与
// 死亡效果(deathEffects)共用同一份实现,只是触发时机不同。目标引用用 {__eid}+active 探针。

/** 敌方能力弹药缺省寿命(def.lifeMs 可覆写;镜像 enemyAbilities.BULLET_LIFE_MS) */
const BULLET_LIFE_MS = 3000

interface Ref {
  __eid: number
}
const eidOf = (ref: TargetInfo['ref']): number => (ref as unknown as Ref).__eid

/** 队员稳定引用({__eid} + active 存活探针);敌方能力索敌/追踪用 */
export function memberRefOf(eid: number): TargetInfo['ref'] {
  let r = memberRef[eid]
  if (!r) {
    r = {
      __eid: eid,
      get active() {
        return Alive.v[eid] === 1
      },
    }
    memberRef[eid] = r
  }
  return r as unknown as TargetInfo['ref']
}

/** 治疗敌群(镜像 healEnemies):all=false 只治血量比例最低一只;满血不计;返回被治数。
 * excludeEid 排除一只(幽灵亡语治疗时排除正在死亡的自己) */
export function healEnemiesEcs(
  sim: Sim,
  x: number,
  y: number,
  range: number,
  amount: number,
  all: boolean,
  excludeEid?: number,
): number {
  const r2 = range * range
  const hurt: number[] = []
  for (const eid of query(sim.world, ENEMY_SET as unknown as object[])) {
    if (eid === excludeEid) continue
    if (Hp.v[eid]! >= Hp.max[eid]!) continue
    const dx = Transform.x[eid]! - x
    const dy = Transform.y[eid]! - y
    if (dx * dx + dy * dy <= r2) hurt.push(eid)
  }
  if (hurt.length === 0) return 0
  let targets: number[]
  if (all) {
    targets = hurt
  } else {
    let best = hurt[0]!
    for (const eid of hurt) if (Hp.v[eid]! / Hp.max[eid]! < Hp.v[best]! / Hp.max[best]!) best = eid
    targets = [best]
  }
  for (const eid of targets) Hp.v[eid] = Math.min(Hp.max[eid]!, Hp.v[eid]! + amount)
  return targets.length
}

/** 敌方视角的阵营中立 ctx(按 eid) */
export function makeEnemyCtx(sim: Sim, scene: Phaser.Scene, atlas: EcsAtlas, eid: number): AbilityContext {
  const outline = Elite.v[eid] || Boss.v[eid] ? 'elite' : 'enemy'
  const shoot = (x: number, y: number, angle: number, spec: { emoji: string; size: number; radius: number; speed: number }, damage: number, lifeMs: number): void =>
    spawnEnemyProjectileEcs(sim, atlas, x, y, angle, {
      emoji: spec.emoji,
      size: spec.size,
      radius: spec.radius,
      speed: spec.speed,
      damage,
      lifeMs,
    })
  return {
    scene,
    ownerOutline: outline,
    targets: () => sim.memberTargets,
    targetHp: (ref) => MHp.hp[eidOf(ref)] ?? 0,
    targetMaxHp: (ref) => MHp.max[eidOf(ref)] ?? 0,
    // 击退参数忽略:队员无击退机制(阵型弹簧持有位置主权)。无敌帧节流本 ctx 掌管
    damageTarget: (ref, damage) => {
      const m = eidOf(ref)
      if (sim.over || !Alive.v[m]) return
      if (sim.elapsedMs - Iframe.last[m]! < Iframe.ms[m]!) return
      Iframe.last[m] = sim.elapsedMs
      hurtMember(sim, m, damage)
    },
    slowTarget: () => {},
    spawnGroundEffect: (x, y, def) => spawnGroundEffectEcs(sim, scene, x, y, def, 'enemy'),
    heal: (x, y, range, amount, all, exclude) =>
      healEnemiesEcs(sim, x, y, range, amount, all, exclude ? eidOf(exclude) : undefined),
    spawnProjectile: (x, y, angle, pDef, damage) => {
      const p = pDef.projectile
      shoot(x, y, angle, p, damage, pDef.lifeMs ?? BULLET_LIFE_MS)
    },
    spawnBullet: (x, y, angle, spec, damage, lifeMs) => shoot(x, y, angle, spec, damage, lifeMs),
    anchor: () => ({ x: Transform.x[eid]!, y: Transform.y[eid]! }),
    applySlow: () => {},
    damageMul: () => DmgMul.v[eid]!,
    cooldownMul: () => 1,
    sfx: (id) => playSfx(id),
    playOwnerClip: () => {}, // 敌人动画 P6
    // aim:'move' 弹朝向 = 本帧移动速度方向(速度为零时朝右,与旧攻击积木一致)
    ownerHeading: () => ({ x: enemyVelX[eid]!, y: enemyVelY[eid]! }),
    random: () => sim.rng.next(),
  }
}
