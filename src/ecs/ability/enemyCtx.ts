import type Phaser from 'phaser'
import { playSfx } from '../../audio/sfx'
import type { AbilityContext, TargetInfo } from '../../war/abilities/types'
import { Alive, Boss, DmgMul, Elite, Iframe, MHp, Transform } from '../components'
import { hurtMember } from '../combat'
import { spawnGroundEffectEcs } from '../groundEffects'
import { spawnEnemyProjectileEcs } from '../projectile'
import { playClip } from '../anim'
import { enemyDef, enemyVelX, enemyVelY, memberRef } from '../store'
import { healEnemies } from './heal'
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
      srcName: enemyDef[eid]?.name,
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
      hurtMember(sim, m, damage, enemyDef[eid]?.name)
    },
    slowTarget: () => {},
    spawnGroundEffect: (x, y, def) => spawnGroundEffectEcs(sim, scene, x, y, def, 'enemy', -1, enemyDef[eid]?.name ?? ''),
    heal: (x, y, range, amount, all, exclude) =>
      healEnemies(sim, x, y, range, amount, all, exclude ? eidOf(exclude) : undefined),
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
    // 本体动画:durMs = 本次出手的真实间隔
    playOwnerClip: (clipId, durMs) => playClip(sim, atlas, eid, clipId, durMs),
    // aim:'move' 弹朝向 = 本帧移动速度方向(速度为零时朝右,与旧攻击积木一致)
    ownerHeading: () => ({ x: enemyVelX[eid]!, y: enemyVelY[eid]! }),
    random: () => sim.rng.next(),
  }
}
