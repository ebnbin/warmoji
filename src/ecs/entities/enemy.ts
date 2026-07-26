import { addComponent, addEntity } from 'bitecs'

import { AI, ELITE } from '../../data/enemies'
import type { DashTrigger, EnemyDef, LocomotionDef } from '../../types/enemies'

import { waveAt } from '../../data/waves'

import { Alive, Anim, Boss, Charge, Depth, Despawn, DmgMul, Dormant, EDir, EState, ETurn, Elite, Enemy, EnemyArm, EnemyPhase, Flash, Hp, Kv, Morph, Nest, Poison, Pop, Quad, Radius, Slide, Slow, SpMul, Speed, Sprite, Thief, Tint, Transform , Orphan } from '../components'
import { enemyCarries, enemyDef } from '../store'
import { armIdle } from '../anim'
import { ANIM_DEF } from '../../emoji/anim'

import type { Sim } from '../sim'
import type { FrameIndex } from '../frames'

// 敌人实体的生成:单只 spawnEnemy + 一窝 spawnBrood。
// 行为/转向/回收等系统在 ../enemy.ts。
// 敌人:装配 + 转向(locomotion 状态机 + 击退 + 世界钩子后处理)。

/** 某种 locomotion 出生时要额外置的状态。**全映射**：LocomotionDef 新增一种而不在此
 * 登记 = 编译不过；null 表示「这种不用初始化」——是一个被明确写下来的决定，
 * 不是漏掉。从前是两行 `lm.kind === 'dash' && …` 的三元，加一种要初始化的
 * locomotion 只能靠人记得回来改 */
type LocoInit<K extends LocomotionDef['kind']> = (
  sim: Sim,
  eid: number,
  lm: Extract<LocomotionDef, { kind: K }>,
) => void
const LOCO_INIT: { [K in LocomotionDef['kind']]: LocoInit<K> | null } = {
  chase: null,
  wander: null,
  static: null,
  flee: null,
  coinThief: null,
  standoff: null,
  detonate: null,
  baseOrbit: (sim, eid, lm) => {
    // 暴走倍率随子敌走：拆巢时直接叠，不必回头查它的 locomotion 是什么
    addComponent(sim.world, eid, Orphan)
    Orphan.speedMul[eid] = lm.orphanSpeedMul
    Orphan.damageMul[eid] = lm.orphanDamageMul
  },
  dash: (sim, eid, lm) => {
    // idle 走 chase 的从「追」态起步
    EState.v[eid] = lm.idle === 'chase' ? 1 : 0
    Charge.nextDashAt[eid] = (DASH_FIRST_AT[lm.trigger.kind] as (s: Sim, t: DashTrigger) => number)(sim, lm.trigger)
  },
}

/** 定时冲刺出生即预约第一次起冲；探测式没有预约（0）。**全映射** */
const DASH_FIRST_AT: { [K in DashTrigger['kind']]: (sim: Sim, t: Extract<DashTrigger, { kind: K }>) => number } = {
  timer: (sim, t) => sim.elapsedMs + (t.firstDelayMs ?? t.intervalMs),
  detect: () => 0,
}

/** 装配一个敌人实体(px 化 def),返回 eid */
export function spawnEnemy(
  sim: Sim,
  atlas: FrameIndex,
  def: EnemyDef,
  x: number,
  y: number,
  hp: number,
  elite: boolean,
  boss: boolean,
  /** 目标透明度(亡语诱饵尸壳半透明;入场弹入收敛到它而非恒 1) */
  alpha = 1,
): number {
  const world = sim.world
  const outline = elite || boss ? 'elite' : 'enemy'
  const size = def.size * (elite ? ELITE.sizeMul : 1)
  const eid = addEntity(world)
  addComponent(world, eid, Enemy)
  addComponent(world, eid, Alive)
  addComponent(world, eid, Transform)
  addComponent(world, eid, Speed)
  addComponent(world, eid, Hp)
  addComponent(world, eid, EState)
  addComponent(world, eid, Elite)
  addComponent(world, eid, Boss)
  addComponent(world, eid, Radius)
  addComponent(world, eid, DmgMul)
  addComponent(world, eid, SpMul)
  addComponent(world, eid, Kv)
  addComponent(world, eid, Slide)
  addComponent(world, eid, Dormant)
  addComponent(world, eid, Flash)
  addComponent(world, eid, Slow)
  addComponent(world, eid, Poison)
  addComponent(world, eid, Charge)
  addComponent(world, eid, Despawn)
  addComponent(world, eid, Morph)
  addComponent(world, eid, EDir)
  addComponent(world, eid, ETurn)
  addComponent(world, eid, Anim)
  addComponent(world, eid, Sprite)
  addComponent(world, eid, Tint)
  addComponent(world, eid, Depth)
  // 出生落点过世界钩子(镜像 materializeEnemy 的 constrainEnemyPos):
  // 分裂/子敌贴岸溅出等边缘情况在出生帧就位,不必等下一帧才被拉回
  const born = sim.hooks.constrainSpawn(sim, x, y, def.radius)
  Transform.x[eid] = born.x
  Transform.y[eid] = born.y
  Transform.rot[eid] = 0
  // 入场弹入(镜像 materializeEnemy 的 scale/alpha tween):Boss 更慢更弹,普通怪快而线性
  Transform.w[eid] = size * (boss ? 0.2 : 0.3)
  Transform.h[eid] = Transform.w[eid]!
  Speed.v[eid] = def.speed
  Hp.v[eid] = hp
  Hp.max[eid] = hp
  EState.v[eid] = 0
  Charge.windupUntil[eid] = 0
  Charge.dashUntil[eid] = 0
  Charge.coolUntil[eid] = 0
  Charge.nextDashAt[eid] = 0
  ;(LOCO_INIT[def.locomotion.kind] as LocoInit<LocomotionDef['kind']> | null)?.(sim, eid, def.locomotion)
  Despawn.at[eid] = 0
  Morph.until[eid] = 0
  Morph.vuln[eid] = 1
  Morph.cdUntil[eid] = 0
  Thief.eaten[eid] = 0
  Thief.nextEatAt[eid] = 0
  enemyCarries[eid] = undefined // 携带者由 spawnCarrier 落地后覆写
  Elite.v[eid] = elite ? 1 : 0
  Boss.v[eid] = boss ? 1 : 0
  Radius.v[eid] = def.radius
  DmgMul.v[eid] = elite ? ELITE.damageMul : 1
  SpMul.v[eid] = elite ? ELITE.speedMul : 1
  Nest.of[eid] = -1 // 非护巢子敌(spawnBrood 会覆盖为巢 eid)
  Nest.nextSpawnAt[eid] = def.spawner ? sim.elapsedMs + (def.spawner.firstDelayMs ?? def.spawner.intervalMs) : 0
  Kv.x[eid] = 0
  Kv.y[eid] = 0
  Slide.x[eid] = 0
  Slide.y[eid] = 0
  Dormant.v[eid] = 0
  EnemyArm.armed[eid] = 0 // eid 复用:新实体须重新装配能力
  // 敌人一并带 Alive:「持有者还在不在场上」对能力系统就此与阵营无关(队员阵亡与敌人离场同构)
  Alive.v[eid] = 1
  Flash.until[eid] = 0
  Slow.until[eid] = 0
  Slow.mul[eid] = 1
  Poison.until[eid] = 0
  // 游荡初始方向 + 首次换向(镜像 materializeEnemy 的随机相/换向计时)
  EDir.x[eid] = Math.cos(sim.rng.next() * Math.PI * 2)
  EDir.y[eid] = Math.sin(sim.rng.next() * Math.PI * 2)
  ETurn.at[eid] = sim.elapsedMs + AI.wander.spawnTurnMinMs + sim.rng.next() * AI.wander.spawnTurnJitterMs
  // 首发延迟(镜像 materializeEnemy 的 fireAt;lazy-arm 时喂入能力初始冷却)
  EnemyArm.fireDelayMs[eid] = 900 + sim.rng.next() * 1500
  // 行走摇摆随机相位(镜像 materializeEnemy 的 ph)
  EnemyPhase.v[eid] = sim.rng.next() * Math.PI * 2
  Sprite.frame[eid] = atlas.index(def.emoji, outline)
  Sprite.flipX[eid] = 0
  // 部件动画:idle 常驻翻帧,相位按出生随机相错开(镜像 materializeEnemy 的 anim.setIdle)
  armIdle(eid, def.emoji, outline, Sprite.frame[eid]!, (EnemyPhase.v[eid]! / (Math.PI * 2)) * ANIM_DEF.durMs)
  Tint.color[eid] = 0xffffff
  Tint.effect[eid] = 0
  Tint.alpha[eid] = boss ? 0.2 : 0.3 // 起点是绝对值,不乘目标 alpha(镜像 materializeEnemy 的 setAlpha)
  Pop.until[eid] = sim.elapsedMs + (boss ? 320 : 130)
  Pop.ms[eid] = boss ? 320 : 130
  Pop.size[eid] = size
  Pop.back[eid] = boss ? 1 : 0
  Pop.alpha[eid] = alpha
  Depth.z[eid] = boss ? 7 : 5
  Quad.v[eid] = 0
  enemyDef[eid] = def
  return eid
}

/** 最近活着的队员位置(镜像 nearestAlive)。距离走世界钩子的差向量——环面上取最短差,
 * 故返回的是「相对 (x,y) 的最近镜像」坐标:下游一律 norm(to - from),数学无需改动 */

/** 生成一窝子敌(镜像 spawnBrood):随机散开 scatter 生成 count 只,血量吃波次曲线。
 * ownerEid≥0 时记为护巢子敌(计入本巢上限 + baseOrbit 绕巢);分裂用 -1(无巢) */
export function spawnBrood(
  sim: Sim,
  atlas: FrameIndex,
  into: EnemyDef,
  count: number,
  cx: number,
  cy: number,
  scatter: number,
  ownerEid: number,
): void {
  const hpMul = waveAt((sim.combatMs + sim.elapsedMs) / 1000).hpMultiplier
  for (let i = 0; i < count; i++) {
    const ang = sim.rng.next() * Math.PI * 2
    const child = spawnEnemy(
      sim,
      atlas,
      into,
      cx + Math.cos(ang) * scatter,
      cy + Math.sin(ang) * scatter,
      Math.round(into.hp * hpMul),
      false,
      false,
    )
    if (ownerEid >= 0) Nest.of[child] = ownerEid
  }
}

/** 虫巢周期生成(镜像 spawnFromNest):全局在场上限让路 + 本巢上限只补到 maxAlive。
 * 场景侧驱动(需 atlas);敌人已死清腾出名额自然续生,巢被拆彻底停 */
