import { addComponent, addEntity, hasComponent, query, removeEntity } from 'bitecs'
import { DEG2RAD } from '../../../util/units'
import type { ProjectileDef, TurretDef } from '../../../types/abilityDefs'
import { playSfx } from '../../../audio/sfx'
import { Anim, Sprite, Tint, Transform } from '../../components'
import { armIdle, playClip } from '../../anim'
import { backEaseOut } from '../../ease'
import { attachDrawable } from '../../drawable'
import { spawnProjectileEcs } from '../../entities/projectile'
import { attributionSlot, cooldownMul, damageMul, ownerX, ownerY } from '../amp'
import { AbilityRef, Cooldown, Emplacement, FACTION, Faction, Frozen, Minion, Owner, Retiring } from '../../components'
import { abilityDefAt } from '../defs'
import { sourceOf } from '../source'
import { castScan } from '../systems/cast'
import { KindTurret } from '../tags'
import { nearestAngle, targetsOf } from '../targets'
import type { Sim } from '../../sim'

/** 架设弩塔：本体无攻击，周期在脚下架一座；弩塔自主索敌开火（伤害归属建造者）。
 * 同时在场有上限，超编拆最旧的。burst 三连弩扇形连射。
 * 一次开火 = 一遍拉弓动画，时长恰为下次开火间隔——攻速越快拉弓越快 */
export function castTurrets(sim: Sim, dt: number): void {
  updateEmplacements(sim, dt)
  castScan<TurretDef>(sim, KindTurret, (e, def) => {
    place(sim, e, def)
    Cooldown.left[e] = def.placeIntervalMs * cooldownMul(sim, e)
  })
}

/** 在建造者脚下架一座；超编把最老的一座标记退场 */
function place(sim: Sim, e: number, def: TurretDef): void {
  const outline = Faction.v[e] === FACTION.enemy ? 'enemy' : 'player'
  // 在役数须先数：新座建出来就带 Emplacement，晚数会把自己也算进去
  const live = liveOnes(sim, e)
  const t = addEntity(sim.world)
  attachDrawable(sim.world, t, sim.frames, {
    id: def.turret.emoji,
    outline,
    x: ownerX(e),
    y: ownerY(e) + 6,
    size: def.turret.size * 0.2, // 入场弹入的起点
    z: 5,
  })
  addComponent(sim.world, t, Emplacement)
  addComponent(sim.world, t, Minion)
  addComponent(sim.world, t, Owner)
  addComponent(sim.world, t, Anim)
  Owner.eid[t] = e
  Minion.bornMs[t] = sim.fxMs
  Minion.dieAt[t] = 0
  Minion.cd[t] = 200
  Minion.size[t] = def.turret.size
  armIdle(t, def.turret.emoji, outline, Sprite.frame[t]!, live.length * 311)
  playSfx('recruit')
  // 超编拆最旧（不含刚架的这座）
  let over = live.length + 1 - def.maxTurrets
  while (over-- > 0) {
    let oldest = -1
    for (const o of live) if (oldest < 0 || Minion.bornMs[o]! < Minion.bornMs[oldest]!) oldest = o
    if (oldest < 0) break
    addComponent(sim.world, oldest, Retiring)
    Minion.bornMs[oldest] = sim.fxMs
    Minion.dieAt[oldest] = sim.fxMs + 240
    live.splice(live.indexOf(oldest), 1)
  }
}

/** 某能力名下仍在役（未退场）的装置 */
function liveOnes(sim: Sim, e: number): number[] {
  const out: number[] = []
  for (const t of query(sim.world, [Emplacement, Owner])) {
    if (Owner.eid[t] === e && !hasComponent(sim.world, t, Retiring)) out.push(t)
  }
  return out
}

/** 逐帧：入场弹入 / 退场淡出 + 索敌开火 */
function updateEmplacements(sim: Sim, dt: number): void {
  for (const t of [...query(sim.world, [Emplacement, Minion, Owner, Transform])]) {
    if (!hasComponent(sim.world, t, Minion)) continue // 建造者离场时连带回收了它
    const e = Owner.eid[t]!
    const def = abilityDefAt(AbilityRef.def[e]!) as TurretDef
    // 建造者倒下：弩塔停火并隐去，复活自然接着打（镜像旧实现停更 + 收视觉）
    if (Frozen.v[e] && !hasComponent(sim.world, t, Retiring)) {
      Tint.alpha[t] = 0
      continue
    }
    if (hasComponent(sim.world, t, Retiring)) {
      const left = Minion.dieAt[t]! - sim.fxMs
      if (left <= 0) {
        removeEntity(sim.world, t)
        continue
      }
      const p = 1 - left / 240
      const k = Minion.size[t]! * (1 - 0.7 * p)
      Transform.w[t] = k
      Transform.h[t] = k
      Tint.alpha[t] = 1 - p
      continue
    }
    // 入场弹入（Back.easeOut，0.2 → 1 倍尺寸）
    const age = sim.fxMs - Minion.bornMs[t]!
    if (age < 220) {
      const k = Minion.size[t]! * (0.2 + 0.8 * backEaseOut(age / 220))
      Transform.w[t] = k
      Transform.h[t] = k
    } else if (Transform.w[t] !== Minion.size[t]) {
      Transform.w[t] = Minion.size[t]!
      Transform.h[t] = Minion.size[t]!
    }
    Tint.alpha[t] = 1
    Minion.cd[t] = Minion.cd[t]! - dt
    if (Minion.cd[t]! > 0) continue
    const aim = nearestAngle(Transform.x[t]!, Transform.y[t]!, targetsOf(sim, sourceOf(sim, e)), def.range)
    if (aim === null) continue
    const interval = def.fireIntervalMs * cooldownMul(sim, e)
    Minion.cd[t] = interval
    Transform.rot[t] = aim - Math.PI / 4
    playClip(sim, sim.frames, t, 'attack', interval)
    fire(sim, e, t, def, aim, interval)
  }
}

/** 一次开火：单发或扇形连发，弹丸走通用投射物管线 */
function fire(sim: Sim, e: number, t: number, def: TurretDef, aim: number, interval: number): void {
  const bolt: ProjectileDef = {
    kind: 'projectile',
    damage: def.damage,
    cooldownMs: interval,
    knockback: def.knockback,
    projectile: def.projectile,
  }
  const damage = Math.round(def.damage * damageMul(sim, e))
  const slot = attributionSlot(e)
  const x = Transform.x[t]!
  const y = Transform.y[t]!
  const burst = def.burst
  if (burst && burst.count > 1) {
    for (let i = 0; i < burst.count; i++) {
      const a = aim + burst.spreadDeg * DEG2RAD * (i / (burst.count - 1) - 0.5)
      spawnProjectileEcs(sim, sim.frames, x, y, a, bolt, damage, slot)
    }
  } else {
    spawnProjectileEcs(sim, sim.frames, x, y, aim, bolt, damage, slot)
  }
  playSfx('shoot')
}
