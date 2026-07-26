import { addComponent, removeComponent } from 'bitecs'
import { playSfx } from '../../audio/sfx'
import { Ability, Amp, Anchor, Bolt, Burst, Emplacement, Faction, Minion, Owner, Retiring, Shoot, Shots, Turret, Volley } from '../components'
import { abilityArtEmoji } from '../store'
import { spawnMinion } from '../entities/minion'
import { attachAbilityCore } from './equip'
import { ownerX, ownerY } from '../utils/amp'
import { liveOnes } from '../utils/turret'
import type { Sim } from '../sim'

/** 超编被拆的退场动画时长（ms，视觉钟） */
export const RETIRE_MS = 240
/** 入场弹入时长（ms，视觉钟） */
export const POP_MS = 220
/** 首发延迟：架好稍顿一下再开第一弓 */
const FIRST_SHOT_MS = 200

/** 给塔挂上开火能力：**参数不来自任何 def**，逐个从建造它的那件武器的组件里抄。
 * 三连弩（Burst）就是那条能力的齐射（Volley）；锚点是塔自己 */
function armTurret(sim: Sim, weapon: number, m: number): void {
  attachAbilityCore(sim, m, Shoot, [{ comp: Shots, reset: (x) => { Shots.n[x] = 0 } }], {
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
