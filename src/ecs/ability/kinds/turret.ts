import { addComponent, hasComponent, query, removeComponent } from 'bitecs'
import type { ProjectileDef, TurretDef } from '../../../types/abilityDefs'
import { playSfx } from '../../../audio/sfx'
import { Ability, Amp, Built, Emplacement, Minion, Retiring } from '../../components'
import { spawnMinion } from '../../entities/minion'
import { ownerX, ownerY } from '../amp'
import type { Sim } from '../../sim'

/** 超编被拆的退场动画时长（ms，视觉钟） */
export const RETIRE_MS = 240
/** 入场弹入时长（ms，视觉钟） */
export const POP_MS = 220
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
export function place(sim: Sim, e: number, def: TurretDef): void {
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

