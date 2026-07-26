import { addComponent, hasComponent, query, removeComponent, removeEntity } from 'bitecs'
import type { ProjectileDef, TurretDef } from '../../../types/abilityDefs'
import { playSfx } from '../../../audio/sfx'
import { Ability, Aim, Amp, Built, Cooldown, Emplacement, Fired, Frozen, Minion, Retiring, Tint, Transform } from '../../components'
import { playClip } from '../../anim'
import { backEaseOut } from '../../ease'
import { spawnMinion } from '../../entities/minion'
import { cooldownMul, ownerX, ownerY } from '../amp'
import { castScan } from '../systems/cast'
import { KindTurret } from '../tags'
import type { Sim } from '../../sim'

/** 架设弩塔：本体无攻击，周期在脚下架一座。**塔自己开火**——它带着一条 projectile
 * 能力进 castScan，与角色手上的枪走同一条管线，只是施放锚点是它自己。
 * 同时在场有上限，超编拆最旧的。burst 三连弩 = 那条能力的 volley。
 * 一次开火 = 一遍拉弓动画，时长恰为下次开火间隔——攻速越快拉弓越快 */
export function castTurrets(sim: Sim): void {
  updateEmplacements(sim)
  castScan<TurretDef>(sim, KindTurret, (e, def) => {
    place(sim, e, def)
    Cooldown.left[e] = def.placeIntervalMs * cooldownMul(sim, e)
  })
}

/** 超编被拆的退场动画时长（ms，视觉钟） */
const RETIRE_MS = 240
/** 入场弹入时长（ms，视觉钟） */
const POP_MS = 220
/** 首发延迟：架好稍顿一下再开第一弓 */
const FIRST_SHOT_MS = 200

/** 弩塔的开火行为 = 一条 projectile 能力。同一条 TurretDef 只折算一次——
 * 每座塔现折一份会把 internAbilityDef 的表撑爆（它按对象身份去重） */
const boltCache = new WeakMap<TurretDef, ProjectileDef>()
function boltOf(def: TurretDef): ProjectileDef {
  let bolt = boltCache.get(def)
  if (!bolt) {
    bolt = {
      kind: 'projectile',
      damage: def.damage,
      cooldownMs: def.fireIntervalMs,
      knockback: def.knockback,
      range: def.range,
      projectile: def.projectile,
      // 三连弩：扇形连发就是齐射（<360°，沿瞄准方向对称散开）
      volley: def.burst,
    }
    boltCache.set(def, bolt)
  }
  return bolt
}

/** 在建造者脚下架一座；超编把最老的一座标记退场 */
function place(sim: Sim, e: number, def: TurretDef): void {
  // 在役数须先数：新座建出来就带 Emplacement，晚数会把自己也算进去
  const live = liveOnes(sim, e)
  spawnMinion(sim, e, {
    tag: Emplacement,
    emoji: def.turret.emoji,
    size: def.turret.size,
    bornScale: 0.2, // 入场弹入的起点
    x: ownerX(e),
    y: ownerY(e) + 6,
    z: 5,
    lifeMs: 0, // 不按时限：只在超编时被拆
    phase: 0,
    cd: 0,
    animOffsetMs: live.length * 311,
    // 塔自持开火能力：伤害/暴击/击退乘区随建造它的这件武器
    ability: {
      def: boltOf(def),
      amp: { dmg: Amp.dmg[e]!, cd: Amp.cd[e]!, crit: Amp.crit[e]!, kb: Amp.kb[e]!, battle: Amp.battle[e] === 1 },
      firstDelayMs: FIRST_SHOT_MS,
    },
  })
  playSfx('recruit')
  // 超编拆最旧（不含刚架的这座）
  let over = live.length + 1 - def.maxTurrets
  while (over-- > 0) {
    let oldest = -1
    for (const o of live) if (oldest < 0 || Minion.bornMs[o]! < Minion.bornMs[oldest]!) oldest = o
    if (oldest < 0) break
    addComponent(sim.world, oldest, Retiring)
    Retiring.until[oldest] = sim.fxMs + RETIRE_MS
    removeComponent(sim.world, oldest, Ability) // 退场中不再开火（Disarmed 会被闸门每帧重置，压不住）
    live.splice(live.indexOf(oldest), 1)
  }
}

/** 某件武器名下仍在役（未退场）的装置 */
function liveOnes(sim: Sim, e: number): number[] {
  const out: number[] = []
  for (const t of query(sim.world, [Emplacement, Built])) {
    if (Built.by[t] === e && !hasComponent(sim.world, t, Retiring)) out.push(t)
  }
  return out
}

/** 逐帧：入场弹入 / 退场淡出 / 建造者倒下时隐去 + 开火那一下的拉弓动画与朝向。
 * 索敌、冷却、出弹全归 castProjectiles——塔与角色手里的枪走的是同一条管线 */
function updateEmplacements(sim: Sim): void {
  for (const t of [...query(sim.world, [Emplacement, Minion, Transform])]) {
    if (hasComponent(sim.world, t, Retiring)) {
      const left = Retiring.until[t]! - sim.fxMs
      if (left <= 0) {
        removeEntity(sim.world, t)
        continue
      }
      const p = 1 - left / RETIRE_MS
      const k = Minion.size[t]! * (1 - 0.7 * p)
      Transform.w[t] = k
      Transform.h[t] = k
      Tint.alpha[t] = 1 - p
      continue
    }
    // 建造者倒下：塔停火（Frozen 由闸门按建造者状态置位，castScan 自会跳过）并隐去，
    // 复活自然接着打
    if (Frozen.v[t]) {
      Tint.alpha[t] = 0
      continue
    }
    // 入场弹入（Back.easeOut，0.2 → 1 倍尺寸）
    const age = sim.fxMs - Minion.bornMs[t]!
    if (age < POP_MS) {
      const k = Minion.size[t]! * (0.2 + 0.8 * backEaseOut(age / POP_MS))
      Transform.w[t] = k
      Transform.h[t] = k
    } else if (Transform.w[t] !== Minion.size[t]) {
      Transform.w[t] = Minion.size[t]!
      Transform.h[t] = Minion.size[t]!
    }
    Tint.alpha[t] = 1
    // 本帧刚开过火：拉弓动画铺满到下一发，朝向对准这一发
    if (Fired.at[t] === sim.fxMs) {
      Transform.rot[t] = Aim.rad[t]! - Math.PI / 4
      playClip(sim, sim.frames, t, 'attack', Cooldown.left[t]!)
    }
  }
}
