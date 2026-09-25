import { addComponent, addComponents, removeComponent } from 'bitecs'
import { newEntity } from './entity'
import { armIdle } from '../systems/shared/anim'
import { attachDrawable } from './drawable'
import { holderOutline } from './weapon'
import {
  Ability,
  Aim,
  Amp,
  Anchor,
  Anim,
  Bolt,
  Built,
  Burst,
  Emplacement,
  Faction,
  Fired,
  Minion,
  Owner,
  Retiring,
  Shoot,
  Shots,
  Sprite,
  Summon,
  Swarmer,
  Turret,
  Volley,
} from '../components'
import type { Sim } from '../sim'
import { ANIM_DEF } from '../../emoji/anim'
import { abilityArtEmoji } from '../store'
import { ownerX, ownerY } from '../utils/amp'
import { playSfx } from '../../audio/sfx'
import { attachAbilityCore } from '../entities/ability'
import { liveOnes } from '../utils/turret'


interface MinionSpec {
  tag: object
  emoji: string
  /** 世界像素 */
  size: number
  /** 出生尺寸倍率：<1 即带入场弹入，1 = 直接到位 */
  bornScale: number
  x: number
  y: number
  z: number
  /** ms，世界钟；0 = 不按时限 */
  lifeMs: number
  /** 弧度 */
  phase: number
  /** ms */
  cd: number
  /** 部件动画的相位错峰（ms）；省略即保持静态帧 */
  animOffsetMs?: number
  /** 由建造方在回调里挂自持能力 */
  arm?: (minion: number) => void
}

/** 阵营与描边随武器走 */
function spawnMinion(sim: Sim, weaponEid: number, spec: MinionSpec): number {
  const outline = holderOutline(Faction.v[weaponEid]!, Owner.eid[weaponEid]!)
  const m = newEntity(sim.world)
  attachDrawable(sim.world, m, sim.frames, {
    id: spec.emoji,
    outline,
    x: spec.x,
    y: spec.y,
    size: spec.size * spec.bornScale,
    z: spec.z,
  })
  addComponents(sim.world, m, Minion, Owner, Built, spec.tag)
  Owner.eid[m] = Owner.eid[weaponEid]!
  Built.by[m] = weaponEid
  Minion.bornMs[m] = sim.fxMs
  Minion.dieAt[m] = spec.lifeMs > 0 ? sim.elapsedMs + spec.lifeMs : 0
  Minion.phase[m] = spec.phase
  Minion.size[m] = spec.size
  Minion.cd[m] = spec.cd
  if (spec.animOffsetMs !== undefined) {
    addComponent(sim.world, m, Anim)
    armIdle(m, spec.emoji, outline, Sprite.frame[m]!, spec.animOffsetMs)
  }
  if (spec.arm) {
    spec.arm(m)
    addComponent(sim.world, m, Fired)
  }
  return m
}

// ── 小蜂 ──────────────────────────────────────────────────

export function spawnBee(sim: Sim, e: number, index: number): void {
  const count = Summon.count[e]!
  spawnMinion(sim, e, {
    tag: Swarmer,
    emoji: abilityArtEmoji[e]!,
    size: Summon.size[e]!,
    bornScale: 1,
    x: ownerX(e),
    y: ownerY(e),
    z: 12,
    lifeMs: Summon.lifeMs[e]!,
    phase: (index * Math.PI * 2) / count,
    cd: 0,
    animOffsetMs: (index * ANIM_DEF.durMs) / count,
  })
}

// ── 弩塔 ──

/** 超编被拆的退场动画时长（ms，视觉钟） */
export const RETIRE_MS = 240
/** 入场弹入时长（ms，视觉钟） */
export const POP_MS = 220
/** 首发延迟 */
const FIRST_SHOT_MS = 200

/** 参数从建造它的武器的组件里抄；Burst 即塔的 Volley */
function armTurret(sim: Sim, weapon: number, m: number): void {
  attachAbilityCore(sim, m, Shoot, [
    { comp: Aim, reset: (x) => { Aim.rad[x] = 0 } },
    { comp: Shots, reset: (x) => { Shots.n[x] = 0 } },
  ], {
    owner: Owner.eid[m]!,
    anchor: m,
    faction: Faction.v[weapon]!,
    cooldownMs: FIRST_SHOT_MS,
    baseMs: Turret.fireIntervalMs[weapon]!,
    amp: { dmg: Amp.dmg[weapon]!, cd: Amp.cd[weapon]!, crit: Amp.crit[weapon]!, kb: Amp.kb[weapon]!, battle: Amp.battle[weapon] === 1 },
  })
  Shoot.damage[m] = Turret.damage[weapon]!
  Shoot.knockback[m] = Turret.knockback[weapon]!
  Shoot.range[m] = Turret.range[weapon]!
  Shoot.lifeMs[m] = Turret.lifeMs[weapon]!
  addComponent(sim.world, m, Bolt)
  Bolt.frame[m] = Bolt.frame[weapon]!
  Bolt.size[m] = Bolt.size[weapon]!
  Bolt.radius[m] = Bolt.radius[weapon]!
  Bolt.speed[m] = Bolt.speed[weapon]!
  Bolt.rotOffset[m] = Bolt.rotOffset[weapon]!
  if (Burst.count[weapon]! > 0) {
    addComponent(sim.world, m, Volley)
    Volley.count[m] = Burst.count[weapon]!
    Volley.spreadDeg[m] = Burst.spreadDeg[weapon]!
    Volley.randomRotate[m] = 0
  }
  Anchor.eid[m] = m
}

export function place(sim: Sim, e: number): void {
  // 须先数在役数，否则会把新座算进去
  const live = liveOnes(sim, e)
  spawnMinion(sim, e, {
    tag: Emplacement,
    emoji: abilityArtEmoji[e]!,
    size: Turret.size[e]!,
    bornScale: 0.2,
    x: ownerX(e),
    y: ownerY(e) + 6,
    z: 5,
    lifeMs: 0,
    phase: 0,
    cd: 0,
    animOffsetMs: live.length * 311,
    arm: (m) => armTurret(sim, e, m),
  })
  playSfx('recruit')
  // 不含刚架的这座
  let over = live.length + 1 - Turret.maxTurrets[e]!
  while (over-- > 0) {
    let oldest = -1
    for (const o of live) if (oldest < 0 || Minion.bornMs[o]! < Minion.bornMs[oldest]!) oldest = o
    if (oldest < 0) break
    addComponent(sim.world, oldest, Retiring)
    Retiring.until[oldest] = sim.fxMs + RETIRE_MS
    removeComponent(sim.world, oldest, Ability) // Disarmed 会被闸门每帧重置，须摘 Ability
    live.splice(live.indexOf(oldest), 1)
  }
}
