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

// 把 def 翻译成组件的唯一登记点；此后没有任何 system 读 def.kind

/** 状态组件与它的清零方式：eid 复用须清零 */
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
const AimState: StateSpec = { comp: Aim, reset: (e) => { Aim.rad[e] = 0 } }
const ThrownState: StateSpec = { comp: Thrown, reset: (e) => { Thrown.n[e] = 0 } }

export interface AttachCtx {
  readonly world: EcsWorld
  readonly frames: FrameIndex
}

interface KindSpec<K extends AbilityDef['kind']> {
  /** 既是归属标记也装参数，含自己的冷却 */
  readonly comp: object & CdComp
  /** 不列即不挂 */
  readonly state?: readonly StateSpec[]
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
      Shoot.range[e] = d.range ?? 0
      Shoot.lifeMs[e] = d.lifeMs ?? 0
      if (d.aim === 'move') addComponent(c.world, e, AimMove)
      assertFree(c.world, e, Bolt, '弹丸外形组件') // 弹道与弩塔共用 Bolt，同宿主装两条就会撞
      addComponent(c.world, e, Bolt)
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
      // 塔自持的 projectile 能力从这里抄外形
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

export const ABILITY_COMPS: readonly (object & CdComp)[] = Object.values(KINDS).map((k) => k.comp)

// ── 装备 ──



// 一条能力 = 一组可挂在任何实体上的组件：有外形的挂在武器实体上，徒手的挂施放者自己

/** 装备期定死；中立方全 1 */
export interface AmpInit {
  dmg: number
  cd: number
  crit: number
  kb: number
  /** 是否吃战场限时层的队伍乘区 */
  battle: boolean
}

export const NEUTRAL_AMP: AmpInit = { dmg: 1, cd: 1, crit: 0, kb: 1, battle: false }

export interface AbilityInit {
  /** 归属：伤害账、乘区、闸门都按它（弩塔 = 建造者） */
  owner: number
  /** 出手位置来源（弩塔 = 它自己） */
  anchor: number
  faction: number
  /** 首发冷却 */
  cooldownMs: number
  amp: AmpInit
  /** 不进自动扫描 */
  manual?: boolean
  /** 0 = 无冷却概念 */
  baseMs: number
  /** 索敌/命中是否无视断壁遮挡 */
  piercesWalls?: boolean
}

/** 参数由调用方自己写进组件 */
export function attachAbilityCore(
  sim: Sim,
  eid: number,
  comp: object & CdComp,
  state: readonly { comp: object; reset(eid: number): void }[],
  init: AbilityInit,
): void {
  const world = sim.world
  // 同一宿主不能挂两份同种能力（组件按 eid 只有一格）；需要两份就让其中一份住进自己的实体
  assertFree(world, eid, comp, 'kind 组件')
  for (const st of state) assertFree(world, eid, st.comp, '状态组件')
  // 每宿主一份的通用组件；每条能力各一份的在 comp 与 state
  // prettier-ignore
  addComponents(world, eid, Ability, Owner, Anchor, Faction, Amp, Frozen, Disarmed, WallBlocked, comp)
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

/** 已有人住即抛错 */
export function assertFree(world: EcsWorld, eid: number, comp: object, what: string): void {
  if (hasComponent(world, eid, comp)) {
    throw new Error(`实体 ${eid} 上已有这条能力的${what}：同一宿主不能挂两份同种能力，请让其中一份住进独立实体`)
  }
}

/** def.kind 只在此读一次 */
export function attachAbility(sim: Sim, eid: number, def: AbilityDef, init: Omit<AbilityInit, 'baseMs' | 'piercesWalls'>): void {
  const spec = KINDS[def.kind]
  attachAbilityCore(sim, eid, spec.comp, spec.state ?? [], {
    ...init,
    baseMs: 'cooldownMs' in def ? def.cooldownMs : 0,
    piercesWalls: abilityPiercesWalls(def),
  })
  // 须在 Faction 之后：attach 按 Faction 挑外形
  ;(spec.attach as ((c: AttachCtx, e: number, d: AbilityDef) => void) | undefined)?.(
    { world: sim.world, frames: sim.frames },
    eid,
    def,
  )
}

/** 返回承载它的 eid：有外形的住进武器实体，徒手的挂施放者自己；owner 与 anchor 一律指施放者，武器身体不参与判定 */
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

/** 持有者离场时调；eid 会被回收，不能留孤儿 */
export function unequipAbilities(sim: Sim, ownerEid: number): void {
  const world = sim.world
  const weapons: number[] = []
  for (const e of query(world, [Weapon, Owner])) if (Owner.eid[e] === ownerEid) weapons.push(e)
  // 徒手能力挂在持有者自己身上，归属须连本人一起查
  const hosts = [...weapons, ownerEid]
  for (const d of query(world, [Drop, Owner])) if (hosts.includes(Owner.eid[d]!)) removeEntity(world, d)
  // 静止地面区不挂 Owner，可活过放它的人
  for (const z of [...query(world, [ZoneFollow, Owner])]) if (hosts.includes(Owner.eid[z]!)) removeEntity(world, z)
  for (const m of [...query(world, [Minion, Owner])]) if (Owner.eid[m] === ownerEid) removeEntity(world, m)
  for (const f of [...query(world, [Flyer])]) if (weapons.includes(Flyer.of[f]!)) removeEntity(world, f)
  // 持有者本人由调用方删
  for (const e of weapons) removeEntity(world, e)
}
