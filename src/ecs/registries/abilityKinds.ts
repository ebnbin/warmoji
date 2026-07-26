import { addComponent } from 'bitecs'
import {
  Aura, AuraDps, AuraFreeze, Blink, Followup, Heal, HealAoe, HealDefib,
  Laser, LaserBackBeam, LaserRadial, Nuke, Pulse, Radial, Shots, SlowAura, Swing, TimeStop,
} from '../components'
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

/** 尚未参数化的 kind 用的空标记（参数仍走 AbilityRef → def 表；逐个搬完即删） */
export const KindRally = {}
export const KindDance = {}
export const KindBuff = {}
export const KindAreaBlast = {}
export const KindChainArc = {}
export const KindThrust = {}
export const KindSweep = {}
export const KindStrike = {}
export const KindAssassinate = {}
export const KindProjectile = {}
export const KindBoomerang = {}
export const KindSummon = {}
export const KindTurret = {}

/** 一种能力的登记项 */
interface KindSpec<K extends AbilityDef['kind']> {
  /** 这一种能力的组件：既是归属标记，也装参数 */
  readonly comp: object
  /** 这种能力自己需要的状态组件；不列即不挂 */
  readonly state?: readonly StateSpec[]
  /** 装备那一刻把 def 的参数写进组件；未参数化的 kind 省略 */
  attach?(world: EcsWorld, e: number, def: Extract<AbilityDef, { kind: K }>): void
}

export const KINDS: { [K in AbilityDef['kind']]: KindSpec<K> } = {
  rally: { comp: KindRally },
  dance: { comp: KindDance },
  buff: { comp: KindBuff },
  areaBlast: { comp: KindAreaBlast, state: [FollowupState] },
  chainArc: { comp: KindChainArc },
  thrust: { comp: KindThrust, state: [SwingState, FollowupState] },
  sweep: { comp: KindSweep, state: [SwingState] },
  strike: { comp: KindStrike },
  assassinate: { comp: KindAssassinate, state: [FollowupState, BlinkState] },
  projectile: { comp: KindProjectile, state: [ShotsState] },
  boomerang: { comp: KindBoomerang },
  summon: { comp: KindSummon },
  turret: { comp: KindTurret },

  // ── 已参数化：def 只在下面这一次被读 ──
  timeStop: {
    comp: TimeStop,
    attach: (_w, e, d) => {
      TimeStop.durationMs[e] = d.durationMs
    },
  },
  nuke: {
    comp: Nuke,
    attach: (_w, e, d) => {
      Nuke.damage[e] = d.damage
      Nuke.bossRatio[e] = d.bossRatio
    },
  },
  heal: {
    comp: Heal,
    attach: (w, e, d) => {
      Heal.amount[e] = d.amount
      Heal.range[e] = d.range
      if (d.aoe) {
        addComponent(w, e, HealAoe)
        HealAoe.ratio[e] = d.aoe.ratio
      }
      if (d.defib) {
        addComponent(w, e, HealDefib)
        HealDefib.reviveCutMs[e] = d.defib.reviveCutMs
      }
    },
  },
  slowAura: {
    comp: SlowAura,
    state: [PulseState, AuraState],
    attach: (w, e, d) => {
      SlowAura.radius[e] = d.radius
      SlowAura.slowFactor[e] = d.slowFactor
      SlowAura.color[e] = d.color
      if (d.dps !== undefined) {
        addComponent(w, e, AuraDps)
        AuraDps.perSec[e] = d.dps
      }
      if (d.freeze) {
        addComponent(w, e, AuraFreeze)
        AuraFreeze.intervalMs[e] = d.freeze.intervalMs
        AuraFreeze.durationMs[e] = d.freeze.durationMs
      }
    },
  },
  laser: {
    comp: Laser,
    state: [RadialState],
    attach: (w, e, d) => {
      Laser.damage[e] = d.damage
      Laser.knockback[e] = d.knockback
      Laser.range[e] = d.range
      Laser.beamRadius[e] = d.beamRadius
      Laser.color[e] = d.color
      if (d.backBeam) addComponent(w, e, LaserBackBeam)
      if (d.radial) {
        addComponent(w, e, LaserRadial)
        LaserRadial.beams[e] = d.radial.beams
        LaserRadial.ratio[e] = d.radial.ratio
        LaserRadial.stepMs[e] = d.radial.stepMs
      }
    },
  },
}
