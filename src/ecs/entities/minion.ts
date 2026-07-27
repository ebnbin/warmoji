import { addComponent, addComponents, addEntity, removeComponent } from 'bitecs'
import { armIdle } from '../ops/anim'
import { attachDrawable } from './drawable'
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
  FACTION,
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
import type { OutlineKind } from '../../emoji/svg'
import type { Sim } from '../sim'
import { ANIM_DEF } from '../../emoji/anim'
import { abilityArtEmoji } from '../store'
import { ownerX, ownerY } from '../utils/amp'
import { playSfx } from '../../audio/sfx'
import { attachAbilityCore } from '../entities/ability'
import { liveOnes } from '../utils/turret'

// 召唤物（minion）：被某件武器造出来、有自己的寿命、在场上**自主行动**的东西。
//
// 为什么它既不是弹丸也不是敌人——两条判据：
// · 弹丸出膛即按初速走完一条线，不重新选目标，也没有「没事干」的状态。
//   召唤物会自主索敌，没目标时还有待机行为（小蜂绕主人打转候敌）。
// · 敌人是战场的一方：有血、会被索敌、会掉落、算进刷怪上限。
//   召唤物没有血、不被索敌、不掉落，到寿命自己消散——它属于召唤它的那一方。
//
// 现有两种（各自的行为在 ability/kinds/ 下，这里只管出生）：
// · Swarmer 小蜂（毒蜂群）——寻路扑敌、撞上即施伤自毁、没撞到则到寿命消散。
//   撞上自毁是它的**死法**不是类别：神风机也是飞机，不是炮弹。
// · Emplacement 弩塔（林木弩塔）——架在地上自主索敌开火，同时在场有上限，
//   超编拆最旧的一座。
//
// 两条归属分开：
// · Owner.eid = 施放者本人（角色 / 敌人）——伤害算谁的账、吃谁的乘区、随谁的死活
//   开关闸门，与武器同口径，于是所有共用机器（amp / gates / source）直接就对。
// · Built.by  = 造它的那件武器——查 def、限座数、都顺着它。
//
// 召唤物可以**自持能力**（spec.ability）：挂上就进 castScan 的视野，自己索敌自己开火，
// 不必让母武器代管。弩塔就是这么开火的——它的施放锚点是它自己，不是建造者。

export interface MinionSpec {
  /** 该种召唤物的标记组件（Swarmer / Emplacement），各自的行为系统靠它取自己那一批 */
  tag: object
  emoji: string
  /** 本体尺寸（世界像素）——也是入场弹入的终值 */
  size: number
  /** 出生尺寸倍率：<1 即带入场弹入，1 = 直接到位 */
  bornScale: number
  x: number
  y: number
  z: number
  /** 寿命（ms，世界钟）；0 = 不按时限退场（弩塔靠超编被拆） */
  lifeMs: number
  /** 候敌打转的初相（弧度）；不用则给 0 */
  phase: number
  /** 自身行为冷却初值（ms）；不用则给 0 */
  cd: number
  /** 部件动画的相位错峰（ms）；省略即保持静态帧 */
  animOffsetMs?: number
  /** 自持能力：给出即让它自己进施放管线（弩塔自主开火）。
   * 由建造方在回调里挂——它的参数不来自 def，而是从母武器的组件里抄 */
  arm?: (minion: number) => void
}

/** 造一只召唤物，挂到造它的那件武器名下。阵营与描边随武器走 */
export function spawnMinion(sim: Sim, weaponEid: number, spec: MinionSpec): number {
  const outline: OutlineKind = Faction.v[weaponEid] === FACTION.enemy ? 'enemy' : 'player'
  const m = addEntity(sim.world)
  attachDrawable(sim.world, m, sim.frames, {
    id: spec.emoji,
    outline,
    x: spec.x,
    y: spec.y,
    size: spec.size * spec.bornScale,
    z: spec.z,
  })
  addComponents(sim.world, m, Minion, Owner, Built, spec.tag)
  Owner.eid[m] = Owner.eid[weaponEid]! // 施放者本人（武器的持有者）
  Built.by[m] = weaponEid
  // bornMs 走视觉钟：它只服务入场弹入与「拆最旧」的比岁数，不该被时停拖慢
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
    addComponent(sim.world, m, Fired) // 出手事件：拉弓动画靠它触发
  }
  return m
}

// ── 小蜂 ──────────────────────────────────────────────────

/** 一只小蜂：出生在主人身上，相位错开好让一波蜂散得开 */
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

// ── 弩塔：架设 + 给塔挂开火能力 ──────────────────────────────────────────────────

/** 超编被拆的退场动画时长（ms，视觉钟） */
export const RETIRE_MS = 240
/** 入场弹入时长（ms，视觉钟） */
export const POP_MS = 220
/** 首发延迟：架好稍顿一下再开第一弓 */
const FIRST_SHOT_MS = 200

/** 给塔挂上开火能力：**参数不来自任何 def**，逐个从建造它的那件武器的组件里抄。
 * 三连弩（Burst）就是那条能力的齐射（Volley）；锚点是塔自己 */
function armTurret(sim: Sim, weapon: number, m: number): void {
  // Aim 与 Shots 是这条能力自己的状态（塔要记住枪口朝向、已发几弹），故随它一起挂
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
  Shoot.lifeMs[m] = 0
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

/** 在建造者脚下架一座；超编把最老的一座标记退场 */
export function place(sim: Sim, e: number): void {
  // 在役数须先数：新座建出来就带 Emplacement，晚数会把自己也算进去
  const live = liveOnes(sim, e)
  spawnMinion(sim, e, {
    tag: Emplacement,
    emoji: abilityArtEmoji[e]!,
    size: Turret.size[e]!,
    bornScale: 0.2, // 入场弹入的起点
    x: ownerX(e),
    y: ownerY(e) + 6,
    z: 5,
    lifeMs: 0, // 不按时限：只在超编时被拆
    phase: 0,
    cd: 0,
    animOffsetMs: live.length * 311,
    // 塔自持开火能力：参数与乘区都随建造它的这件武器
    arm: (m) => armTurret(sim, e, m),
  })
  playSfx('recruit')
  // 超编拆最旧（不含刚架的这座）
  let over = live.length + 1 - Turret.maxTurrets[e]!
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
