import { addComponent } from 'bitecs'
import {
  AimMove, AreaBlast, Assassinate, FACTION, Faction, Aura, AuraDps, AuraFreeze, BlastEcho, Blink, Bolt, Boomerang,
  BoomerangTwin, Buff, Burst, ChainArc, CoinMagnet, Dance, EveryN, Execute, Followup, Heal, HealAoe,
  HealDefib, Laser, LaserBackBeam, LaserRadial, Nuke, Pierce, Pulse, Radial, Rally, Shoot, Shots,
  SlowAura, Strike, Summon, Sweep, Swing, Thrust, ThrustCombo, TimeStop, Turret, Volley,
} from '../components'
import { abilityArtEmoji, abilityFireSfx, abilityOnHit } from '../store'
import type { FrameIndex } from '../frames'
import type { EcsWorld } from '../world'
import type { AbilityDef } from '../../types/abilityDefs'

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

/** attach 能用到的东西：世界（挂可选组件）+ 帧索引（把 emoji 解析成 frame） */
export interface AttachCtx {
  readonly world: EcsWorld
  readonly frames: FrameIndex
}

/** 一种能力的登记项 */
interface KindSpec<K extends AbilityDef['kind']> {
  /** 这一种能力的组件：既是归属标记，也装参数 */
  readonly comp: object
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
    state: [SwingState],
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
    state: [SwingState, FollowupState],
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
    state: [FollowupState, BlinkState],
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
    state: [ShotsState],
    attach: (c, e, d) => {
      Shoot.damage[e] = d.damage
      Shoot.knockback[e] = d.knockback
      Shoot.range[e] = d.range ?? 0 // 0 = 用 ACQUIRE 的缺省索敌上限
      Shoot.lifeMs[e] = d.lifeMs ?? 0
      if (d.aim === 'move') addComponent(c.world, e, AimMove)
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
    state: [RadialState],
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
