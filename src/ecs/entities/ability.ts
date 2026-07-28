import { addComponent, addComponents, hasComponent, query, removeEntity } from 'bitecs'
import {
  Ability,
  Aim,
  AimMove,
  Amp,
  Anchor,
  AreaBlast,
  Assassinate,
  Aura,
  AuraDps,
  AuraFreeze,
  BlastEcho,
  Blink,
  Bolt,
  Boomerang,
  BoomerangTwin,
  Buff,
  Burst,
  ChainArc,
  CoinMagnet,
  Dance,
  Disarmed,
  Drop,
  EveryN,
  Execute,
  FACTION,
  Faction,
  Flyer,
  Followup,
  Frozen,
  Heal,
  HealAoe,
  HealDefib,
  Laser,
  LaserBackBeam,
  LaserRadial,
  Manual,
  Minion,
  Nuke,
  Owner,
  Pierce,
  Pulse,
  Radial,
  Rally,
  Shoot,
  Shots,
  SlowAura,
  Strike,
  Summon,
  Sweep,
  Swing,
  Thrown,
  Thrust,
  ThrustCombo,
  TimeStop,
  Turret,
  Volley,
  WallBlocked,
  Weapon,
  ZoneFollow,
} from '../components'
import { abilityArtEmoji, abilityFireSfx, abilityOnHit } from '../store'
import type { FrameIndex } from '../frames'
import type { EcsWorld } from '../world'
import type { CdComp } from '../components'
import type { AbilityDef } from '../../types/abilityDefs'
import { abilityPiercesWalls } from '../../data/abilities'
import { spawnWeaponBody } from '../entities/weapon'
import type { Sim } from '../sim'

// 每种能力的登记表——**它只干一件事：把 def 翻译成组件**。
//
// def 来自 defs/ → gen → JSON，JSON 里 kind 只能是字符串；组件不是字符串。所以从
// 「数据文件说这是激光」到「给这个实体挂上 Laser 组件」必须有一次映射，而这次映射
// **只在装备那一刻发生一次**——此后没有任何 system 读 def.kind。
//
// **comp**：这一种能力的组件。它既是「归哪个 system 管」的标记，**也装着执行它需要的
// 全部参数**（见 components.ts 的「每种能力的参数组件」）。系统只问「有没有挂我这个
// 组件」，参数就在组件上，不必再顺着下标去翻定义对象。
//
// **attach**：把 def 的参数写进组件。def 类型按 kind 收窄，写错字段编译不过。
// def 里的可选子对象一律拆成可选组件——`if (def.aoe)` 就此变成 `hasComponent(HealAoe)`。
//
// **state**：只有真的用得到的 kind 才挂。挥击进度只有横扫/突刺有、瞬闪落点只有刺客有、
// 扫射序列只有激光有——从前是**每颗武器都背着全套**，弩塔身上永远躺着一个用不到的
// Blink。现在「有这个组件 = 有这个性质」，各系统的 query 自己就把无关实体挡在外面。
//
// 这张表是**全映射**：新增一种能力而不在此登记 = 编译不过。从前是 Partial，漏登记只会让
// attachAbility 静默返回 false——武器造得出来、画得出来、永远不出手，编译/lint/e2e 全绿。

/** 一个状态组件与它的清零方式（组件按 eid 索引，eid 复用会读到上一位住户的残值） */
interface StateSpec {
  readonly comp: object
  reset(eid: number): void
}

const SwingState: StateSpec = {
  comp: Swing,
  reset: (e) => {
    Swing.startMs[e] = 0
    Swing.durMs[e] = 0
  },
}
const FollowupState: StateSpec = {
  comp: Followup,
  reset: (e) => {
    Followup.left[e] = 0
    Followup.damage[e] = 0
  },
}
const RadialState: StateSpec = { comp: Radial, reset: (e) => { Radial.left[e] = 0 } }
const BlinkState: StateSpec = {
  comp: Blink,
  reset: (e) => {
    Blink.x[e] = 0
    Blink.y[e] = 0
  },
}
const PulseState: StateSpec = {
  comp: Pulse,
  reset: (e) => {
    Pulse.dps[e] = 0
    Pulse.freeze[e] = 0
  },
}
const ShotsState: StateSpec = { comp: Shots, reset: (e) => { Shots.n[e] = 0 } }
const AuraState: StateSpec = { comp: Aura, reset: (e) => { Aura.zone[e] = 0 } }
/** 只有真的要瞄准的 kind 才挂——治疗/天罚/时停这些没有方向可言 */
const AimState: StateSpec = { comp: Aim, reset: (e) => { Aim.rad[e] = 0 } }
const ThrownState: StateSpec = { comp: Thrown, reset: (e) => { Thrown.n[e] = 0 } }

/** attach 能用到的东西：世界（挂可选组件）+ 帧索引（把 emoji 解析成 frame） */
export interface AttachCtx {
  readonly world: EcsWorld
  readonly frames: FrameIndex
}

/** 一种能力的登记项 */
interface KindSpec<K extends AbilityDef['kind']> {
  /** 这一种能力的组件：既是归属标记，也装参数，**并带着这条能力自己的冷却** */
  readonly comp: object & CdComp
  /** 这种能力自己需要的状态组件；不列即不挂 */
  readonly state?: readonly StateSpec[]
  /** 装备那一刻把 def 的参数写进组件；未参数化的 kind 省略 */
  attach?(ctx: AttachCtx, e: number, def: Extract<AbilityDef, { kind: K }>): void
}

export const KINDS: { [K in AbilityDef['kind']]: KindSpec<K> } = {

  rally: {
    comp: Rally,
    attach: (_c, e, d) => {
      Rally.healRatio[e] = d.healRatio
      Rally.invulnMs[e] = d.invulnMs
      Rally.ringRadius[e] = d.ringRadius
      Rally.color[e] = d.color
    },
  },
  dance: {
    comp: Dance,
    attach: (_c, e, d) => {
      Dance.durationMs[e] = d.durationMs
    },
  },
  buff: {
    comp: Buff,
    attach: (_c, e, d) => {
      Buff.damageMul[e] = d.damageMul
      Buff.durationMs[e] = d.durationMs
    },
  },
  chainArc: {
    comp: ChainArc,
    attach: (_c, e, d) => {
      ChainArc.damage[e] = d.damage
      ChainArc.knockback[e] = d.knockback
      ChainArc.range[e] = d.range
      ChainArc.arcRange[e] = d.arcRange
      ChainArc.bounces[e] = d.bounces
      ChainArc.decay[e] = d.decay
      ChainArc.color[e] = d.color
      abilityOnHit[e] = d.onHit
    },
  },
  sweep: {
    comp: Sweep,
    state: [AimState, SwingState],
    attach: (_c, e, d) => {
      Sweep.damage[e] = d.damage
      Sweep.knockback[e] = d.knockback
      Sweep.radius[e] = d.radius
      Sweep.arcDeg[e] = d.arcDeg
      Sweep.sweepMs[e] = d.sweepMs
      abilityOnHit[e] = d.onHit
    },
  },
  areaBlast: {
    comp: AreaBlast,
    state: [FollowupState],
    attach: (c, e, d) => {
      AreaBlast.damage[e] = d.damage
      AreaBlast.knockback[e] = d.knockback
      AreaBlast.detectRange[e] = d.detectRange
      AreaBlast.blastRadius[e] = d.blastRadius
      AreaBlast.color[e] = d.color
      abilityOnHit[e] = d.onHit
      if (d.echo) {
        addComponent(c.world, e, BlastEcho)
        BlastEcho.delayMs[e] = d.echo.delayMs
        BlastEcho.ratio[e] = d.echo.ratio
      }
    },
  },
  thrust: {
    comp: Thrust,
    state: [AimState, SwingState, FollowupState],
    attach: (c, e, d) => {
      Thrust.damage[e] = d.damage
      Thrust.knockback[e] = d.knockback
      Thrust.reach[e] = d.reach
      Thrust.hitRadius[e] = d.hitRadius
      Thrust.thrustMs[e] = d.thrustMs
      Thrust.lungeDist[e] = d.lungeDist
      abilityOnHit[e] = d.onHit
      if (d.combo) {
        addComponent(c.world, e, ThrustCombo)
        ThrustCombo.delayMs[e] = d.combo.delayMs
      }
    },
  },
  strike: {
    comp: Strike,
    attach: (_c, e, d) => {
      Strike.damage[e] = d.damage
      Strike.knockback[e] = d.knockback
      Strike.targets[e] = d.targets
      Strike.coinsPerHit[e] = d.coinsPerHit ?? 0
      abilityArtEmoji[e] = d.drop.emoji
      Strike.size[e] = d.drop.size
      Strike.fromAbove[e] = d.drop.fromAbove
      Strike.dropMs[e] = d.drop.dropMs
      Strike.staggerMs[e] = d.drop.staggerMs
    },
  },
  assassinate: {
    comp: Assassinate,
    state: [AimState, FollowupState, BlinkState],
    attach: (c, e, d) => {
      Assassinate.damage[e] = d.damage
      Assassinate.knockback[e] = d.knockback
      Assassinate.range[e] = d.range
      Assassinate.behindDist[e] = d.behindDist
      Assassinate.strikeMs[e] = d.strikeMs
      abilityOnHit[e] = d.onHit
      if (d.execute) {
        addComponent(c.world, e, Execute)
        Execute.hpRatio[e] = d.execute.hpRatio
        Execute.mul[e] = d.execute.mul
      }
    },
  },
  boomerang: {
    comp: Boomerang,
    state: [AimState, ThrownState],
    attach: (c, e, d) => {
      Boomerang.damage[e] = d.damage
      Boomerang.knockback[e] = d.knockback
      Boomerang.range[e] = d.range
      Boomerang.outMs[e] = d.outMs
      Boomerang.returnSpeed[e] = d.returnSpeed
      Boomerang.hitRadius[e] = d.hitRadius
      Boomerang.spinDegPerSec[e] = d.spinDegPerSec
      if (d.twin) addComponent(c.world, e, BoomerangTwin)
      if (d.coinMagnetRadius !== undefined) {
        addComponent(c.world, e, CoinMagnet)
        CoinMagnet.radius[e] = d.coinMagnetRadius
      }
    },
  },
  summon: {
    comp: Summon,
    attach: (_c, e, d) => {
      Summon.count[e] = d.count
      Summon.damage[e] = d.damage
      Summon.knockback[e] = d.knockback
      Summon.intervalMs[e] = d.intervalMs
      Summon.lifeMs[e] = d.lifeMs
      abilityArtEmoji[e] = d.minion.emoji
      Summon.size[e] = d.minion.size
      Summon.speed[e] = d.minion.speed
      abilityOnHit[e] = d.onHit
    },
  },
  projectile: {
    comp: Shoot,
    state: [AimState, ShotsState],
    attach: (c, e, d) => {
      Shoot.damage[e] = d.damage
      Shoot.knockback[e] = d.knockback
      Shoot.range[e] = d.range ?? 0 // 0 = 用 ACQUIRE 的缺省索敌上限
      Shoot.lifeMs[e] = d.lifeMs ?? 0
      if (d.aim === 'move') addComponent(c.world, e, AimMove)
      assertFree(c.world, e, Bolt, '弹丸外形组件') // 弹道与弩塔共用 Bolt，同宿主装两条就会撞
      addComponent(c.world, e, Bolt)
      // 描边随阵营：敌弹与我方弹用不同的外圈
      Bolt.frame[e] = c.frames.index(d.projectile.emoji, Faction.v[e] === FACTION.enemy ? 'enemyProjectile' : 'player')
      Bolt.size[e] = d.projectile.size
      Bolt.radius[e] = d.projectile.radius
      Bolt.speed[e] = d.projectile.speed
      Bolt.rotOffset[e] = d.projectile.rotationOffsetDeg
      if (d.volley) {
        addComponent(c.world, e, Volley)
        Volley.count[e] = d.volley.count
        Volley.spreadDeg[e] = d.volley.spreadDeg
        Volley.randomRotate[e] = d.volley.randomRotate ? 1 : 0
      }
      if (d.everyN) {
        addComponent(c.world, e, EveryN)
        EveryN.n[e] = d.everyN.n
        EveryN.count[e] = d.everyN.count
        EveryN.spreadDeg[e] = d.everyN.spreadDeg
      }
      if (d.pierce !== undefined) {
        addComponent(c.world, e, Pierce)
        Pierce.n[e] = d.pierce
      }
      abilityOnHit[e] = d.onHit
      abilityFireSfx[e] = d.fireSfx
    },
  },
  turret: {
    comp: Turret,
    attach: (c, e, d) => {
      Turret.placeIntervalMs[e] = d.placeIntervalMs
      Turret.maxTurrets[e] = d.maxTurrets
      Turret.fireIntervalMs[e] = d.fireIntervalMs
      Turret.damage[e] = d.damage
      Turret.knockback[e] = d.knockback
      Turret.range[e] = d.range
      abilityArtEmoji[e] = d.turret.emoji
      Turret.size[e] = d.turret.size
      // 塔开火用的弹丸外形：塔自持的那条 projectile 能力从这里抄
      assertFree(c.world, e, Bolt, '弹丸外形组件')
      addComponent(c.world, e, Bolt)
      Bolt.frame[e] = c.frames.index(d.projectile.emoji, 'player')
      Bolt.size[e] = d.projectile.size
      Bolt.radius[e] = d.projectile.radius
      Bolt.speed[e] = d.projectile.speed
      Bolt.rotOffset[e] = d.projectile.rotationOffsetDeg
      if (d.burst) {
        addComponent(c.world, e, Burst)
        Burst.count[e] = d.burst.count
        Burst.spreadDeg[e] = d.burst.spreadDeg
      }
    },
  },
  timeStop: {
    comp: TimeStop,
    attach: (_c, e, d) => {
      TimeStop.durationMs[e] = d.durationMs
    },
  },
  nuke: {
    comp: Nuke,
    attach: (_c, e, d) => {
      Nuke.damage[e] = d.damage
      Nuke.bossRatio[e] = d.bossRatio
    },
  },
  heal: {
    comp: Heal,
    attach: (c, e, d) => {
      Heal.amount[e] = d.amount
      Heal.range[e] = d.range
      if (d.aoe) {
        addComponent(c.world, e, HealAoe)
        HealAoe.ratio[e] = d.aoe.ratio
      }
      if (d.defib) {
        addComponent(c.world, e, HealDefib)
        HealDefib.reviveCutMs[e] = d.defib.reviveCutMs
      }
    },
  },
  slowAura: {
    comp: SlowAura,
    state: [PulseState, AuraState],
    attach: (c, e, d) => {
      SlowAura.radius[e] = d.radius
      SlowAura.slowFactor[e] = d.slowFactor
      SlowAura.color[e] = d.color
      if (d.dps !== undefined) {
        addComponent(c.world, e, AuraDps)
        AuraDps.perSec[e] = d.dps
      }
      if (d.freeze) {
        addComponent(c.world, e, AuraFreeze)
        AuraFreeze.intervalMs[e] = d.freeze.intervalMs
        AuraFreeze.durationMs[e] = d.freeze.durationMs
      }
    },
  },
  laser: {
    comp: Laser,
    state: [AimState, RadialState],
    attach: (c, e, d) => {
      Laser.damage[e] = d.damage
      Laser.knockback[e] = d.knockback
      Laser.range[e] = d.range
      Laser.beamRadius[e] = d.beamRadius
      Laser.color[e] = d.color
      if (d.backBeam) addComponent(c.world, e, LaserBackBeam)
      if (d.radial) {
        addComponent(c.world, e, LaserRadial)
        LaserRadial.beams[e] = d.radial.beams
        LaserRadial.ratio[e] = d.radial.ratio
        LaserRadial.stepMs[e] = d.radial.stepMs
      }
    },
  },
}

/** 全部能力参数组件（= KINDS 的 comp）。冷却下沉到每种能力之后，
 * 「推进所有冷却」这件事没法再靠单个 query 完成，只能逐种扫一遍 */
export const ABILITY_COMPS: readonly (object & CdComp)[] = Object.values(KINDS).map((k) => k.comp)

// ── 装备：把 def 物化成组件 ──────────────────────────────────────────────────



// 「一条能力」的工厂。
//
// 它不是一种实体，而是**一组可以挂在任何实体上的组件**：有外形的挂在自己的武器实体上
//（spawnWeaponBody 造的那颗），徒手的直接挂施放者自己。所以本文件与 weapon.ts 的分工是
// 「装什么」与「长什么样」，不是两种实体。
//
// 此后「谁有哪些能力」就是世界里挂着这组组件、且 Owner 指向他的那些实体
//（可能包括他自己），不再是某个对象持有的数组。

/** 装备期定死的乘区（队伍侧由道具/等级/团队卡折算；中立方全 1） */
export interface AmpInit {
  dmg: number
  cd: number
  crit: number
  kb: number
  /** 是否吃战场限时层的队伍乘区 */
  battle: boolean
}

export const NEUTRAL_AMP: AmpInit = { dmg: 1, cd: 1, crit: 0, kb: 1, battle: false }

/** 挂一条能力所需的关系与初值 */
export interface AbilityInit {
  /** 施放者：伤害算谁的账、吃谁的乘区、随谁的死活开关闸门（武器=持有者，弩塔=建造者） */
  owner: number
  /** 施放锚点：从哪儿放这一下（武器=持有者，弩塔=它自己） */
  anchor: number
  faction: number
  /** 首发冷却（错峰用） */
  cooldownMs: number
  amp: AmpInit
  /** 只等施放请求，不进自动扫描（队长技能） */
  manual?: boolean
  /** 出手后的冷却重置间隔；0 = 这一种能力没有冷却概念，由它自己安排下一次 */
  baseMs: number
  /** 索敌/命中是否无视断壁遮挡 */
  piercesWalls?: boolean
}

/** 挂一条能力（参数由调用方自己写进组件）。弩塔的开火走这条——它的参数不来自
 * 任何 def，而是从建造它的那件武器的组件里抄 */
export function attachAbilityCore(
  sim: Sim,
  eid: number,
  comp: object & CdComp,
  state: readonly { comp: object; reset(eid: number): void }[],
  init: AbilityInit,
): void {
  const world = sim.world
  // 同一个宿主不能挂两份同种能力：组件按 eid 只有一格，第二份会**静默覆盖**第一份的
  // 参数与冷却，表现成「其中一条莫名其妙不出手」，不报错。真需要两份（牛仔的左右两把枪）
  // 就让其中一份住进自己的实体——系统查的是组件，宿主是谁它们并不关心。
  assertFree(world, eid, comp, 'kind 组件')
  for (const st of state) assertFree(world, eid, st.comp, '状态组件')
  // 通用部分：每条能力都要的。**这些全是每宿主一份**（阵营、乘区、闸门都由持有者决定），
  // 所以同一个宿主挂多条能力时它们重复写入同一格也无妨。每条能力各一份的东西
  //（冷却、瞄准、各 kind 的运行状态）一律不在这里——见 comp 与 state。
  // prettier-ignore
  addComponents(world, eid, Ability, Owner, Anchor, Faction, Amp, Frozen, Disarmed, WallBlocked, comp)
  // 该 kind 自己的状态组件：用得到才挂
  for (const st of state) {
    addComponent(world, eid, st.comp)
    st.reset(eid)
  }
  if (init.manual) addComponent(world, eid, Manual)
  Owner.eid[eid] = init.owner
  Anchor.eid[eid] = init.anchor
  Faction.v[eid] = init.faction
  comp.cdLeft[eid] = init.cooldownMs
  comp.cdBase[eid] = init.baseMs
  Amp.dmg[eid] = init.amp.dmg
  Amp.cd[eid] = init.amp.cd
  Amp.crit[eid] = init.amp.crit
  Amp.kb[eid] = init.amp.kb
  Amp.battle[eid] = init.amp.battle ? 1 : 0
  Frozen.v[eid] = 0
  Disarmed.v[eid] = 0
  WallBlocked.v[eid] = init.piercesWalls ? 0 : 1
}

/** 这一格已经有人住了 = 有人要挂第二份同种能力。硬抛：静默覆盖比崩溃难查得多 */
export function assertFree(world: EcsWorld, eid: number, comp: object, what: string): void {
  if (hasComponent(world, eid, comp)) {
    throw new Error(`实体 ${eid} 上已有这条能力的${what}：同一宿主不能挂两份同种能力，请让其中一份住进独立实体`)
  }
}

/** 装备一条来自 def 的能力：查登记表 → 挂通用包与该 kind 的组件 → 把参数抄进组件。
 * **这是 def.kind 在整个生命周期里被读的唯一一次**——此后 system 只认组件 */
export function attachAbility(sim: Sim, eid: number, def: AbilityDef, init: Omit<AbilityInit, 'baseMs' | 'piercesWalls'>): void {
  const spec = KINDS[def.kind]
  attachAbilityCore(sim, eid, spec.comp, spec.state ?? [], {
    ...init,
    baseMs: 'cooldownMs' in def ? def.cooldownMs : 0,
    piercesWalls: abilityPiercesWalls(def),
  })
  // 参数抄在最后——有些 attach 要按 Faction 挑外形（敌弹与我方弹的描边不同）
  ;(spec.attach as ((c: AttachCtx, e: number, d: AbilityDef) => void) | undefined)?.(
    { world: sim.world, frames: sim.frames },
    eid,
    def,
  )
}

/** 装备一条能力，返回承载它的 eid。
 *
 * **有外形的住进自己的武器实体，徒手的直接挂施放者身上。**
 * 差别仅此而已——两种都只是「谁身上挂着这组能力组件」，施放系统查的是组件，
 * 从不问宿主是什么。徒手能力（军医的战地医疗与飞针、敌人的弹幕与天罚、队长技能载荷）
 * 因此不再需要一颗有名无实的空武器实体。
 *
 * 无论挂在哪，owner 与 anchor 都指施放者本人：账算他的、闸门随他的死活、枪口从他身上算起。
 * 武器身体只是外形，从不参与判定（激光是从人身上射出去的，不是从手电筒尖）。 */
export function equipAbility(
  sim: Sim,
  host: number,
  def: AbilityDef,
  faction: number,
  cooldownMs: number,
  amp: AmpInit,
  manual = false,
): number {
  const carrier = 'held' in def && def.held ? spawnWeaponBody(sim, host, def.held, faction) : host
  attachAbility(sim, carrier, def, { owner: host, anchor: host, faction, cooldownMs, amp, manual })
  return carrier
}

/** 收走某持有者名下的全部武器与它们造出来的子实体（召唤物、坠物、在途双子镖）。
 * 持有者离场时调——eid 会被回收再分配，不能留孤儿 */
export function unequipAbilities(sim: Sim, ownerEid: number): void {
  const world = sim.world
  const weapons: number[] = []
  for (const e of query(world, [Weapon, Owner])) if (Owner.eid[e] === ownerEid) weapons.push(e)
  // 子实体记的是「哪条能力放的我」，而徒手能力就挂在持有者自己身上——故归属要连本人一起查。
  // 少了这一条，寒气光环的区与天罚的坠物会活过放它们的人（那时 eid 已被回收再分配）
  const hosts = [...weapons, ownerEid]
  for (const d of query(world, [Drop, Owner])) if (hosts.includes(Owner.eid[d]!)) removeEntity(world, d)
  // 跟随型区域(寒气光环)挂在能力名下;静止的地面区不挂 Owner——毒圈活过放它的人是常态
  for (const z of [...query(world, [ZoneFollow, Owner])]) if (hosts.includes(Owner.eid[z]!)) removeEntity(world, z)
  // 召唤物的 Owner 就是施放者本人（Built.by 才指母武器），故直接按持有者判
  for (const m of [...query(world, [Minion, Owner])]) if (Owner.eid[m] === ownerEid) removeEntity(world, m)
  // 在途的镖是独立实体，随掷出它的武器一并回收
  for (const f of [...query(world, [Flyer])]) if (weapons.includes(Flyer.of[f]!)) removeEntity(world, f)
  // 持有者本人不在此删——调用方紧接着 removeEntity 它，挂在它身上的能力组件随之消失
  for (const e of weapons) removeEntity(world, e)
}
