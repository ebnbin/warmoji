import { UNIT } from '../core/units'
import type { Rng } from '../core/rng'
import { FOLLOW, WANDER } from '../battle/config'
import { ORBIT } from '../characters/orbit'
import { TEAM, MEMBER } from '../characters/registry'
import { formationPosts, ringPostAngle } from '../characters/formation'
import type { FormationId } from '../characters/formation'
import { angleDiff, orbitTendency, pickDriver, stepPhase, threatWeight } from '../characters/orbit'
import type { OrbitThreat } from '../characters/orbit'
import { Alive, Breath, Depth, Follow, Pop, Sprite, Threat, Transform, Wander } from './components'
import { steerEnemies, updateFrameTargets } from './enemy'
import { memberContact, memberVisual, reviveMembers, tickPoison } from './combat'
import { updateEnemyProjectiles, updateProjectiles } from './projectile'
import type { EcsWorld } from './world'
import type { Point } from '../core/vec'
import type { RunState } from '../run/state'
import type { EffectCtx, TargetInfo } from '../abilities/types'
import { TIMESTOP, timeScaleFor } from '../battle/timeStop'
import { BATTLE_FX_IDENTITY, foldBattleEffects } from '../battlefield/registry'
import type { BattleEffects } from '../battlefield/registry'
import type { BattleMod } from '../battlefield/battlefield'
import type { FieldPickupDef } from '../battlefield/registry'

// ECS 战斗仿真状态 + 系统(纯逻辑,禁 phaser)。数学逐行镜像旧 BaseArenaScene 的
// updateOrbit / moveTeam / layoutTeam,常量与公式不变,只把「读写精灵」换成「读写组件」。

export interface Sim {
  world: EcsWorld
  /** 队伍中心(世界坐标) */
  center: { x: number; y: number }
  /** 环相位(可旋转环整体转动) */
  orbitPhase: number
  driverPost: number
  /** 本帧移动方向(输入系统写:键盘归一或摇杆向量) */
  teamDir: { x: number; y: number }
  /** 本帧移动量 0..1(键盘满推=1,摇杆取模长):供时停时标 */
  moveInputRaw: number
  /** 队伍移速(世界像素/秒) */
  moveSpeed: number
  formation: FormationId
  /** 阵容人数 */
  count: number
  /** 槽位 → 岗位 */
  postBySlot: number[]
  /** 槽位 → 环上秉性(避敌/迎敌) */
  lineupOrbit: number[]
  /** eid,按槽位序(稳定迭代) */
  members: number[]
  mapId: import('../maps/registry').MapId
  mapW: number
  mapH: number
  elapsedMs: number
  /** 本帧威胁点(敌人位置) */
  frameTargets: Point[]
  /** 全队阵亡(游戏结束标记;失败结算) */
  over: boolean
  /** 终波 Boss 被击败(场景侧据此走通关结算) */
  bossDown: boolean
  /** 队员受击累计次数(场景侧据增量触发受击震屏) */
  memberHitCount: number
  /** 队长技能的限时全队增伤(镜像 stats.damageMul + skillBuffUntil):到期由 stepSim 复原 */
  skillDamageMul: number
  skillBuffUntil: number
  /** 全场蹦迪窗口结束时刻(镜像 danceEndsAt):窗口内全体敌人定身摇摆,含窗口内新登场者 */
  danceEndsAt: number
  /** 时停剩余(世界时长):>0 时世界时标随队伍移动量放缩(动则时行、静则近乎凝固) */
  timeStopMsLeft: number
  /** 移动量的低通平滑值(实时 delta 推进):worldTimeScale 的输入 */
  chrono: number
  /** 战场拾取施加的限时层(逐个到期)与其每帧重折的乘区(镜像 battleMods/battleFx) */
  battleMods: BattleMod[]
  battleFx: BattleEffects
  /** 团队卡的敌速乘区(开局定;与 battleFx.enemySlowMul 并行相乘) */
  enemySlowMul: number
  /** 本帧敌方存活快照(能力索敌共享;wire 每帧重建) */
  enemyTargets: TargetInfo[]
  /** 本帧队员存活快照(敌方能力索敌共享;enemyWire 每帧重建) */
  memberTargets: TargetInfo[]
  /** 敌人行为随机源(游荡换向/生成等;按 run 种子确定) */
  rng: Rng
  /** 波次/累计战斗时长(难度曲线) */
  wave: number
  combatMs: number
  /** 刷怪冷却 + 预告中待落地的敌人(telegraph 延迟) */
  spawnCooldownMs: number
  pendingSpawns: PendingSpawn[]
  /** 本帧内死亡且带亡语的敌人快照(场景侧 runDeathEffects 逐帧排空) */
  pendingDeaths: PendingDeath[]
  /** 本帧敌人受伤的飘字事件(场景侧 drainDamageNumbers 排空) */
  pendingDamageNumbers: DamageNumber[]
  /** 本帧粒子爆点(死亡/拾币;场景侧 drainBursts 排空,按 kind 分发发射器) */
  pendingBursts: Burst[]
  /** 队伍侧共享效果执行面(抛射物 onHit 命中链复用;armTeam 后由场景注入) */
  effectCtx?: EffectCtx
  /** run 状态引用(金币/经验/抽卡入账;与旧场景同口径直改 run) */
  run: RunState
  /** 掉落/入账乘区(队长×道具,开局定;精英倍率逐杀叠) */
  reward: RewardConfig
  /** 本帧内死亡敌人待落地的金币(场景侧 drainPendingCoins 排空,需 atlas) */
  pendingCoins: PendingCoins[]
  /** 本帧携带者死亡处待落地的战场拾取(场景侧排空,需 scene 建光圈视觉) */
  pendingFieldDrops: { x: number; y: number; def: FieldPickupDef }[]
  /** 本帧新落地的携带者(场景侧给它挂极性光环) */
  pendingAuras: { eid: number; def: FieldPickupDef }[]
}

/** 掉落/拾取乘区(镜像 grantKillRewards / magnetCoins / endWave 的乘区来源) */
export interface RewardConfig {
  /** 经验乘区(队长 xpGainMul × 道具 xpGainMul;精英 ELITE.xpMul 逐杀再叠) */
  captainXpMul: number
  /** 双倍金币概率(道具) */
  doubleCoinChance: number
  /** 磁吸半径(px:队长 coinMagnet × 道具 magnetMul) */
  magnetRadius: number
  /** 波末回复比例(团队道具:大锅) */
  waveHealRatio: number
  /** 波末金币分红(团队道具:债券) */
  waveCoins: number
}

/** 待落地金币(死亡点 + 枚数) */
export interface PendingCoins {
  x: number
  y: number
  count: number
}

/** 预告中待落地的敌人 */
export interface PendingSpawn {
  def: import('../enemies/registry').EnemyDef
  x: number
  y: number
  hp: number
  elite: boolean
  boss: boolean
  at: number
  /** 携带者载荷(死亡即掉这枚拾取);普通刷怪为 undefined */
  carries?: FieldPickupDef
}

/** 敌人受伤飘字(死亡点/命中点 + 数值;暴击金色放大) */
export interface DamageNumber {
  x: number
  y: number
  amount: number
  crit: boolean
}

/** 粒子爆点(kind 选发射器:death 紫爆 / coin 金爆 / puff 灰烟) */
export interface Burst {
  x: number
  y: number
  count: number
  kind: 'death' | 'coin' | 'puff'
}

/** 死亡快照(带亡语的敌人;实体已移除,死亡效果按此在死亡点重放) */
export interface PendingDeath {
  def: import('../enemies/registry').EnemyDef
  x: number
  y: number
  elite: boolean
  boss: boolean
  dmgMul: number
}

/** 队伍活感·探测与轨道(镜像 updateOrbit):逐员判定探测范围内有无敌人 + 环上主力驱动共享相位 */
function updateOrbit(sim: Sim, delta: number): void {
  const { count, formation } = sim
  if (sim.members.length === 0) return
  const range = ORBIT.detectRange * UNIT
  const rangeSq = range * range
  const wants = new Array<number>(sim.members.length).fill(0)
  let rotatable = false
  for (let slot = 0; slot < sim.members.length; slot++) {
    const eid = sim.members[slot]!
    Threat.v[eid] = 0
    if (!Alive.v[eid]) continue
    const bias = sim.lineupOrbit[slot] ?? 0
    const idx = sim.postBySlot[slot] ?? slot
    const base = ringPostAngle(formation, idx, count)
    if (base !== null) rotatable = true
    const theta = (base ?? 0) + sim.orbitPhase
    const threats: OrbitThreat[] = []
    for (const t of sim.frameTargets) {
      const dx = t.x - Transform.x[eid]!
      const dy = t.y - Transform.y[eid]!
      const dSq = dx * dx + dy * dy
      if (dSq >= rangeSq) continue
      Threat.v[eid] = 1
      if (base === null || bias === 0) break
      threats.push({
        diff: angleDiff(theta, Math.atan2(t.y - sim.center.y, t.x - sim.center.x)),
        weight: threatWeight(Math.sqrt(dSq), range),
      })
    }
    if (base !== null && bias !== 0) wants[idx] = orbitTendency(bias, threats)
  }
  if (!rotatable) return
  sim.driverPost = pickDriver(
    wants.map((w) => Math.abs(w)),
    Math.random,
  )
  sim.orbitPhase = stepPhase(sim.orbitPhase, sim.driverPost >= 0 ? (wants[sim.driverPost] ?? 0) : 0, delta)
}

/** 有界世界:队伍中心钳在盒内(镜像 ArenaScene.constrainTeam;断壁/漂移等后续世界钩子再叠) */
function constrainTeam(sim: Sim, next: Point): Point {
  const clampMin = (TEAM.ringRadius + MEMBER.radius) * UNIT
  return {
    x: Math.min(Math.max(next.x, clampMin), sim.mapW - clampMin),
    y: Math.min(Math.max(next.y, clampMin), sim.mapH - clampMin),
  }
}

/** 队伍位移 + 布局(镜像 moveTeam→layoutTeam) */
function moveTeam(sim: Sim, delta: number): void {
  const dir = sim.teamDir
  const step = (sim.moveSpeed * sim.battleFx.moveSpeedMul * delta) / 1000
  const next = constrainTeam(sim, { x: sim.center.x + dir.x * step, y: sim.center.y + dir.y * step })
  sim.center.x = next.x
  sim.center.y = next.y
  layout(sim, delta)
}

/** Back.easeOut(Phaser 默认过冲量):复活弹入用,末段轻微过冲再回落 */
function backEaseOut(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  const u = t - 1
  return 1 + c3 * u * u * u + c1 * u * u
}

/** 逐员:岗位偏移 + 待机游移 + 跟随弹簧 → 写 Transform/Depth(镜像 layoutTeam) */
function layout(sim: Sim, delta: number): void {
  const posts = formationPosts(sim.formation, sim.count, sim.orbitPhase)
  const moving = sim.teamDir.x !== 0 || sim.teamDir.y !== 0
  const dt = Math.min(delta, 50) / 1000
  const tSec = sim.elapsedMs / 1000
  const memberSize = MEMBER.size * UNIT
  for (let slot = 0; slot < sim.members.length; slot++) {
    const eid = sim.members[slot]!
    const idx = sim.postBySlot[slot] ?? slot
    const p = posts[idx] ?? { x: 0, y: 0 }
    const wanderOn = Alive.v[eid]! && !moving && !Threat.v[eid]
    let amp = Wander.amp[eid]!
    amp += ((wanderOn ? 1 : 0) - amp) * Math.min(1, delta / WANDER.rampMs)
    Wander.amp[eid] = amp
    const wander = amp * WANDER.radius
    const seed = Wander.seed[eid]!
    const tx = sim.center.x + p.x + Math.sin(tSec * WANDER.freqX + seed) * wander
    const ty = sim.center.y + p.y + Math.sin(tSec * WANDER.freqY + seed * 2.3) * wander
    // 跟随弹簧(用局部量演算,避免类型化数组元素的复合赋值歧义)
    let fx = Follow.x[eid]!
    let fy = Follow.y[eid]!
    let fvx = Follow.vx[eid]!
    let fvy = Follow.vy[eid]!
    if (dt > 0) {
      const k = Follow.k[eid]!
      const c = 2 * Math.sqrt(k) * FOLLOW.zeta
      fvx += (k * (tx - fx) - c * fvx) * dt
      fvy += (k * (ty - fy) - c * fvy) * dt
      fx += fvx * dt
      fy += fvy * dt
    }
    const lagX = tx - fx
    const lagY = ty - fy
    const lag = Math.hypot(lagX, lagY)
    if (lag > FOLLOW.maxLag) {
      const pull = 1 - FOLLOW.maxLag / lag
      fx += lagX * pull
      fy += lagY * pull
    }
    Follow.x[eid] = fx
    Follow.y[eid] = fy
    Follow.vx[eid] = fvx
    Follow.vy[eid] = fvy
    Transform.x[eid] = fx
    Transform.y[eid] = fy
    const guarded = sim.formation === 'guard' && idx === 0
    Depth.z[eid] = guarded ? 8.5 : 10 + (fy - sim.center.y) / UNIT
    // 程序化小动画(镜像 animateMember):呼吸挤压拉伸 + 朝移动方向翻转(仅活着的)。
    // 复活弹入期(Pop)用弹入缩放覆盖呼吸(镜像 reviveMember 的 Back.easeOut scale 弹)
    if (Alive.v[eid]) {
      if (Pop.until[eid]! > sim.elapsedMs) {
        const t = 1 - (Pop.until[eid]! - sim.elapsedMs) / 200
        const pop = memberSize * (0.3 + 0.7 * backEaseOut(t))
        Transform.w[eid] = pop
        Transform.h[eid] = pop
      } else {
        const bp = Breath.phase[eid]! + delta / (moving ? 85 : 140)
        Breath.phase[eid] = bp
        const s = Math.sin(bp) * (moving ? 0.13 : 0.09)
        Transform.w[eid] = memberSize * (1 - s * 0.6)
        Transform.h[eid] = memberSize * (1 + s)
      }
      if (Math.abs(sim.teamDir.x) > 0.2) Sprite.flipX[eid] = sim.teamDir.x > 0 ? 1 : 0
    }
  }
}

/** 首帧前把队员摆到岗位(镜像 setup 里的 layoutTeam(0)) */
export function initialLayout(sim: Sim): void {
  layout(sim, 0)
}

/** 一帧仿真(镜像 update 的 updateOrbit→moveTeam→steerEnemies 次序);delta 为真实帧长(ms) */
/** 剔除到期的限时层后重折乘区(镜像 refoldBattleFx) */
export function refoldBattleFx(sim: Sim): void {
  if (sim.battleMods.length === 0) return
  const live = sim.battleMods.filter((m) => m.until > sim.elapsedMs)
  if (live.length === sim.battleMods.length && live.length > 0) return // 无变化则免折
  sim.battleMods = live
  sim.battleFx = live.length === 0 ? { ...BATTLE_FX_IDENTITY } : foldBattleEffects(live.map((m) => m.fx))
}

/** 世界时间流速(镜像 worldTimeScale):时停窗口内随队伍移动量放缩,窗口外恒 1 */
export function worldTimeScale(sim: Sim): number {
  return sim.timeStopMsLeft > 0 ? timeScaleFor(sim.chrono) : 1
}

/** 一帧仿真。delta = 真实帧长(玩家走位/呼吸/编队用),wdelta = 世界时长(敌人/弹体/刷怪用)。
 * 时停即「世界侧 wdelta 变慢而玩家侧 delta 照常」,故两者分开传(镜像旧 update 的 delta/wdelta) */
export function stepSim(sim: Sim, delta: number, wdelta: number = delta): void {
  // 世界钟按世界时长推进:波次计时/复活/无敌帧/毒跳等一并随时停放慢(与旧一致)
  sim.elapsedMs += wdelta
  if (sim.timeStopMsLeft > 0) sim.timeStopMsLeft = Math.max(0, sim.timeStopMsLeft - wdelta)
  // 移动量低通平滑走实时 delta:moveTeam 会写 moveInputRaw,供下一帧 worldTimeScale 读
  sim.chrono += (sim.moveInputRaw - sim.chrono) * Math.min(1, delta / TIMESTOP.easeMs)
  // 限时战斗层:剔除到期项后重折(乘区实时,先于移动/攻击/敌速消费,镜像 refoldBattleFx)
  refoldBattleFx(sim)
  // 队长技能的限时增伤到期复原(镜像 update 里的 skillBuffUntil 判定)
  if (sim.skillDamageMul !== 1 && sim.elapsedMs >= sim.skillBuffUntil) sim.skillDamageMul = 1
  // 敌人位置汇入 frameTargets(队伍 orbit/游移门控据此),先于 orbit
  updateFrameTargets(sim)
  updateOrbit(sim, delta)
  moveTeam(sim, delta)
  reviveMembers(sim)
  tickPoison(sim)
  // 以下为世界侧:时停期整体放慢(敌人移速/弹体位移都按 wdelta 积分,无需另乘时标)
  steerEnemies(sim, wdelta)
  updateProjectiles(sim, wdelta)
  updateEnemyProjectiles(sim, wdelta)
  memberContact(sim)
  memberVisual(sim)
}
