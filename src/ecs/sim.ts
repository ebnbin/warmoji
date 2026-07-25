import { UNIT } from '../core/units'
import type { Rng } from '../core/rng'
import { FOLLOW, WANDER } from '../war/config'
import { ORBIT } from '../war/orbit'
import { MEMBER } from '../data/characters'
import { formationPosts, ringPostAngle } from '../data/formation'
import type { FormationId } from '../data/formation'
import { angleDiff, orbitTendency, pickDriver, stepPhase, threatWeight } from '../war/orbit'
import type { OrbitThreat } from '../war/orbit'
import { Alive, Breath, Depth, Follow, Pop, Sprite, Threat, Transform, VisOff, Wander } from './components'
import { steerEnemies, updateFrameTargets } from './enemy'
import { memberContact, memberVisual, regenMembers, reviveMembers, tickPoison } from './combat'
import { updateEnemyProjectiles, updateProjectiles } from './projectile'
import { backEaseOut } from './ease'
import { updateShards } from './shards'
import { updateCoinPop } from './pickups'
import { updateDormancy } from './worlds'
import type { FlowField, WallGrid } from '../war/world/ruins'
import type { EcsWorld } from './world'
import type { WorldHooks } from './worlds'
import type { Point } from '../core/vec'
import type { RunState } from '../run/state'
import type { EffectCtx, TargetInfo } from '../war/abilities/types'
import { TIMESTOP, timeScaleFor } from '../war/timeStop'
import { BATTLE_FX_IDENTITY, foldBattleEffects } from '../data/battlefield'
import type { BattleEffects } from '../data/battlefield'
import type { BattleMod } from '../data/battlefield'
import type { FieldPickupDef } from '../data/battlefield'

// ECS 战斗仿真状态 + 系统(纯逻辑,禁 phaser)。数学逐行镜像旧 ArcadeBattleScene 的
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
  mapId: import('../data/maps').MapId
  mapW: number
  mapH: number
  /** 本图世界钩子(位移约束/打滑/落水结算…):开局按 mapId 取一份,系统在拐弯处调它 */
  hooks: WorldHooks
  /** 队伍滑行速度(世界像素/秒):浮冰等动量世界的积分器状态,有界世界恒 0 */
  teamVx: number
  teamVy: number
  /** 世界周期结算/事件的下次时刻(落水掉血、圈外掉血、下一颗天体;hooks 自管) */
  worldTickAt: number
  /** 终波缩圈(无限图):圆心 + 当前半径(世界像素);未开圈为 null */
  zone: { x: number; y: number; r: number } | null
  /** 天体横扫(深空图):预警/划行中的那一次;未在途为 null。场景侧据此建/毁预警轨迹与球体 */
  meteor: Meteor | null
  /** 断壁世界(残垣图):网格 + 流场 + 待拆格队列;非断壁图为 null */
  walls: Walls | null
  /** 相机世界视口(场景侧每帧回填):玩家子弹飞出视野一段即回收,镜像 cullProjectiles */
  view: { x: number; y: number; right: number; bottom: number }
  elapsedMs: number
  /** 纯视觉时钟(真实帧长累加):碎片飞散/金币弹入等在旧实现里是 tween 驱动的,
   * 既不吃时停时标,也不随波末过场冻结 */
  fxMs: number
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
  /** 本帧减速区(寒气光环等每帧重新登记,叠乘敌方移速 + 冷色调提示;wire 每帧重建) */
  frameSlowZones: { x: number; y: number; r2: number; factor: number }[]
  /** 本帧金币吸点(磁力回旋镖:镖旁金币直接入账,省去飞回中心;wire 每帧重建) */
  frameAttractors: { x: number; y: number; r2: number }[]
  /** 本帧敌方存活快照(能力索敌共享;wire 每帧重建) */
  enemyTargets: TargetInfo[]
  /** 本帧队员存活快照(敌方能力索敌共享;enemyWire 每帧重建) */
  memberTargets: TargetInfo[]
  /** 敌人行为随机源(游荡换向/生成等;按 run 种子确定) */
  rng: Rng
  /** 试炼场沙盒(刷怪走勾选敌人 + 场内密度/难度旋钮;免死无时限) */
  testMode: boolean
  /** 波次/累计战斗时长(难度曲线) */
  wave: number
  combatMs: number
  /** 刷怪冷却 + 预告中待落地的敌人(telegraph 延迟) */
  spawnCooldownMs: number
  pendingSpawns: PendingSpawn[]
  /** 精英波敌潮的延迟排期(到点才求落点,镜像 spawnSurge 的 delayedCall) */
  pendingSurges: { at: number; hpMul: number; forceElite: boolean }[]
  /** 本帧内死亡且带亡语的敌人快照(场景侧 runDeathEffects 逐帧排空) */
  pendingDeaths: PendingDeath[]
  /** 本帧敌人受伤的飘字事件(场景侧 drainDamageNumbers 排空) */
  pendingDamageNumbers: DamageNumber[]
  /** 本帧粒子爆点(死亡/拾币;场景侧 drainBursts 排空,按 kind 分发发射器) */
  pendingBursts: Burst[]
  /** 本帧冲击波圈(自爆群伤示警;场景侧 drainRings 排空,走 blastRing) */
  pendingRings: { x: number; y: number; radius: number }[]
  /** 队伍侧共享效果执行面(抛射物 onHit 命中链复用;armTeam 后由场景注入) */
  effectCtx?: EffectCtx
  /** 抛射物 onHit 效果链的归属槽位:每次命中前改写成该子弹的 srcSlot(镜像 teamEffectSlot) */
  effectSlot: number
  /** 亡语同步重放(场景侧注入,需 scene/atlas):挂上即在 killEnemy 内当场跑,
   * 未挂则回落到 pendingDeaths 帧末排空 */
  onDeathFx?: (d: PendingDeath) => void
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

/** 断壁世界状态(残垣图):网格(可变,碾墙置通行)+ 绕墙流场(低频重算)+
 * 可达刷怪格 + 本帧被碾碎的格(场景侧排空拆视觉) */
export interface Walls {
  grid: WallGrid
  flow?: FlowField
  /** 上次重算流场时的队伍格与累计时长(格变了或到点就重算) */
  flowCellX: number
  flowCellY: number
  reflowAcc: number
  /** 从中心 4 连通可达的通行格(只在这些格刷怪,保证敌人总能寻到队伍) */
  spawnCells: number[]
  /** 本帧被碾碎的格索引(场景侧排空:拆视觉 + 扬尘) */
  smashed: number[]
}

/** 一次天体横扫(深空图):预警直线两端 + 起划时刻 + 划行进度 + 本次已结算过的实体 */
export interface Meteor {
  /** false=预警中(到 until 起划) true=划行中 */
  travelling: boolean
  sx: number
  sy: number
  ex: number
  ey: number
  until: number
  /** 划行进度 0..1 */
  t: number
  /** 每次横扫对同一实体只砸一次 */
  hit: Set<number>
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
  def: import('../data/enemies').EnemyDef
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
  def: import('../data/enemies').EnemyDef
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

/** 队伍位移 + 布局(镜像 moveTeam→layoutTeam);落点交给世界钩子(有界钳制/冰面动量) */
function moveTeam(sim: Sim, delta: number): void {
  const dir = sim.teamDir
  const step = (sim.moveSpeed * sim.battleFx.moveSpeedMul * delta) / 1000
  const drift = sim.hooks.teamDrift(sim, delta)
  const next = sim.hooks.constrainTeam(
    sim,
    { x: sim.center.x + dir.x * step + drift.x, y: sim.center.y + dir.y * step + drift.y },
    delta,
  )
  sim.center.x = next.x
  sim.center.y = next.y
  layout(sim, delta)
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
    const rawX = sim.center.x + p.x + Math.sin(tSec * WANDER.freqX + seed) * wander
    const rawY = sim.center.y + p.y + Math.sin(tSec * WANDER.freqY + seed * 2.3) * wander
    // 跟随弹簧(用局部量演算,避免类型化数组元素的复合赋值歧义)
    let fx = Follow.x[eid]!
    let fy = Follow.y[eid]!
    let fvx = Follow.vx[eid]!
    let fvy = Follow.vy[eid]!
    // 环面弹簧:目标取离当前跟随点最近的镜像——中心穿缝时队员各自走最短路穿门,阵型全程连贯
    const td = sim.hooks.worldDelta(sim, fx, fy, rawX, rawY)
    const tx = fx + td.x
    const ty = fy + td.y
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
    // 跟随点回绕(环面),弹簧状态始终保持在竞技场内
    const wrapped = sim.hooks.wrap(sim, fx, fy)
    fx = wrapped.x
    fy = wrapped.y
    Follow.x[eid] = fx
    Follow.y[eid] = fy
    Follow.vx[eid] = fvx
    Follow.vy[eid] = fvy
    // 能力视觉偏移叠在跟随点之上(突刺前冲/瞬闪):只动画面,不动阵型与索敌锚点
    Transform.x[eid] = fx + VisOff.x[eid]!
    Transform.y[eid] = fy + VisOff.y[eid]!
    const guarded = sim.formation === 'guard' && idx === 0
    // 遮挡纵深按世界差(环面上贴缝时不跳变)
    Depth.z[eid] = guarded ? 8.5 : 10 + sim.hooks.worldDelta(sim, sim.center.x, sim.center.y, fx, fy).y / UNIT
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

/** 波末/失败过场的冻结期:世界与战斗全停,但纯视觉照旧收尾——
 * 旧实现只 physics.pause(),碎片飞散与金币弹入是 tween,不受影响 */
export function stepFrozenVisuals(sim: Sim, delta: number): void {
  sim.fxMs += delta
  updateShards(sim, delta)
  updateCoinPop(sim)
}

/** 一帧仿真。delta = 真实帧长(玩家走位/呼吸/编队用),wdelta = 世界时长(敌人/弹体/刷怪用)。
 * 时停即「世界侧 wdelta 变慢而玩家侧 delta 照常」,故两者分开传(镜像旧 update 的 delta/wdelta) */
export function stepSim(sim: Sim, delta: number, wdelta: number = delta): void {
  // 世界钟按世界时长推进:波次计时/复活/无敌帧/毒跳等一并随时停放慢(与旧一致)
  sim.elapsedMs += wdelta
  sim.fxMs += delta // 纯视觉时钟走真实帧长
  if (sim.timeStopMsLeft > 0) sim.timeStopMsLeft = Math.max(0, sim.timeStopMsLeft - wdelta)
  // 移动量低通平滑走实时 delta:moveTeam 会写 moveInputRaw,供下一帧 worldTimeScale 读
  sim.chrono += (sim.moveInputRaw - sim.chrono) * Math.min(1, delta / TIMESTOP.easeMs)
  // 限时战斗层:剔除到期项后重折(乘区实时,先于移动/攻击/敌速消费,镜像 refoldBattleFx)
  refoldBattleFx(sim)
  // 队长技能的限时增伤到期复原(镜像 update 里的 skillBuffUntil 判定)
  if (sim.skillDamageMul !== 1 && sim.elapsedMs >= sim.skillBuffUntil) sim.skillDamageMul = 1
  // 休眠维护(无限世界:远离队伍的敌人冻结)——先于一切读敌人的系统
  updateDormancy(sim)
  // 敌人位置汇入 frameTargets(队伍 orbit/游移门控据此),先于 orbit
  updateFrameTargets(sim)
  updateOrbit(sim, delta)
  moveTeam(sim, delta)
  reviveMembers(sim)
  regenMembers(sim, wdelta)
  tickPoison(sim)
  // 以下为世界侧:时停期整体放慢(敌人移速/弹体位移都按 wdelta 积分,无需另乘时标)
  steerEnemies(sim, wdelta, delta)
  updateProjectiles(sim, wdelta)
  // 接触须先于敌弹:同帧两者争同一层无敌帧时旧实现是接触先手(overlap 注册序),
  // 否则贴脸接触的伤害/黏滞/荆棘反伤会被敌弹吃掉的无敌帧一并挡下
  memberContact(sim)
  updateEnemyProjectiles(sim, wdelta)
  memberVisual(sim)
  updateShards(sim, delta)
  // 世界周期结算(落水掉血等):在位移与战斗之后,读的是本帧最终位置
  sim.hooks.tick(sim, wdelta)
}
