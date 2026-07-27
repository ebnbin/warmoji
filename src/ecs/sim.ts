import { UNIT } from '../util/units'
import { SIM_PIPELINE } from './systems/pipeline/sim'
import { runPipeline } from './systems/pipeline/step'
import { animateCharacters } from './systems/animateCharacters'
import { stepPickupVisuals } from './systems/stepPickupVisuals'
import { updateShards } from './systems/updateShards'
import { layoutTeam } from './systems/layoutTeam'
import type { FormationId } from '../types/formation'
import type { EcsWorld } from './world'
import type { WorldHooks, WorldState } from './worlds'
import type { Outbox } from './outbox'
import type { RunState } from '../run/state'
import type { Target } from './utils/targets'
import type { FrameIndex } from './frames'
import { TIMESTOP } from '../data/timeStop'
import { timeScaleFor } from '../war/timeStop'
import { BATTLE_FX_IDENTITY } from '../data/battlefield'
import type { BattleEffects } from '../types/battlefield'
import type { BattleMod } from '../types/battlefield'
import { CAPTAINS } from '../data/captains'
import { aggregateTeamCards } from '../data/cards'
import { Rng } from '../util/rng'
import { spawnCaptain } from './entities/captain'
import { formTeam } from './entities/captain'
import { newWorldState, worldFor } from './worlds'
import { newOutbox } from './outbox'
import type { EcsAtlas } from './atlas'

// ECS 战斗仿真状态 + 系统(纯逻辑,禁 phaser)。数学逐行镜像旧 ArcadeBattleScene 的
// updateOrbit / moveTeam / layoutTeam,常量与公式不变,只把「读写精灵」换成「读写组件」。

export interface Sim {
  world: EcsWorld
  /** 本帧移动方向(输入系统写:键盘归一或摇杆向量) */
  teamDir: { x: number; y: number }
  /** 本帧移动量 0..1(键盘满推=1,摇杆取模长):供时停时标 */
  moveInputRaw: number
  /** 队长实体 eid：**队伍中心就是它的 Transform**（见 utils/team），移速/磁吸半径也是它的组件 */
  captain: number
  formation: FormationId
  /** 阵容人数 */
  count: number
  /** 槽位 → 岗位 */
  postBySlot: number[]
  /** 槽位 → 环上秉性(避敌/迎敌) */
  lineupOrbit: number[]
  /** eid,按槽位序(稳定迭代) */
  characters: number[]
  mapId: import('../types/maps').MapId
  mapW: number
  mapH: number
  /** 本图世界钩子(位移约束/打滑/落水结算…):开局按 mapId 取一份,系统在拐弯处调它 */
  hooks: WorldHooks
  /** 钩子自己的状态(滑行速度/周期时刻/缩圈/天体/断壁):除场景侧建场与取视觉外,只有 hooks 碰 */
  worldState: WorldState
  /** 相机世界视口(场景侧每帧回填):玩家子弹飞出视野一段即回收,镜像 cullProjectiles */
  view: { x: number; y: number; right: number; bottom: number }
  elapsedMs: number
  /** 纯视觉时钟(真实帧长累加):碎片飞散/金币弹入等在旧实现里是 tween 驱动的,
   * 既不吃时停时标,也不随波末过场冻结 */
  fxMs: number
  /** 本帧长度,帧起点写死一次。**system 一律从这里读,不再由调用方喂**——
   * 于是每个 system 的签名都是 (sim) => void,次序才可能被当数据编排。
   * dtMs = 真实帧长(玩家走位/呼吸/编队/纯视觉);
   * wdtMs = 世界时长(敌人/弹体/刷怪/攻速),时停期比 dtMs 慢 */
  dtMs: number
  wdtMs: number
  /** 全队阵亡(游戏结束标记;失败结算) */
  over: boolean
  /** 终波 Boss 被击败(场景侧据此走通关结算) */
  bossDown: boolean
  /** 队员受击累计次数(场景侧据增量触发受击震屏) */
  characterHitCount: number
  /** 时停剩余(世界时长):>0 时世界时标随队伍移动量放缩(动则时行、静则近乎凝固) */
  timeStopMsLeft: number
  /** 移动量的低通平滑值(实时 delta 推进):worldTimeScale 的输入 */
  chrono: number
  /** 战场拾取施加的限时层(逐个到期)与其每帧重折的乘区(镜像 battleMods/battleFx) */
  battleMods: BattleMod[]
  battleFx: BattleEffects
  /** 团队卡的敌速乘区(开局定;与 battleFx.enemySlowMul 并行相乘) */
  enemySlowMul: number
  /** 本帧金币吸点(磁力回旋镖:镖旁金币直接入账,省去飞回中心;wire 每帧重建) */
  frameAttractors: { x: number; y: number; r2: number }[]
  /** 本帧两侧存活快照(能力索敌共享;targets.ts 每帧重建,含环面镜像坐标) */
  enemyTargets: Target[]
  characterTargets: Target[]
  /** 帧索引表:纯逻辑系统据此建带贴图的实体(开局注入) */
  frames: FrameIndex
  /** 敌人行为随机源(游荡换向/生成等;按 run 种子确定) */
  rng: Rng
  /** 试炼场沙盒(刷怪走勾选敌人 + 场内密度/难度旋钮;免死无时限) */
  testMode: boolean
  /** 刷怪冷却(预告本身是实体,见 entities/telegraph.ts) */
  spawnCooldownMs: number
  /** 本帧内死亡且带亡语的敌人快照(帧内通道:runDeathEffects 在同一条流水线里排空) */
  pendingDeaths: PendingDeath[]
  /** 出站信箱:仿真只写、场景侧每帧排空的视觉事件(特效/爆点/飘字/冲击波/到手横幅) */
  out: Outbox
  /** 亡语同步重放(场景侧注入,需 scene/atlas):挂上即在 killEnemy 内当场跑,
   * 未挂则回落到 pendingDeaths 帧末排空 */
  onDeathFx?: (d: PendingDeath) => void
  /** run 状态引用(金币/经验/抽卡入账;与旧场景同口径直改 run) */
  run: RunState
  /** 掉落/入账乘区(队长×道具,开局定;精英倍率逐杀叠) */
  reward: RewardConfig
}

/** 掉落/拾取乘区(镜像 grantKillRewards / magnetCoins / endWave 的乘区来源) */
export interface RewardConfig {
  /** 经验乘区(队长 xpGainMul × 道具 xpGainMul;精英 ELITE.xpMul 逐杀再叠) */
  captainXpMul: number
  /** 双倍金币概率(道具) */
  doubleCoinChance: number
  /** 波末回复比例(团队道具:大锅) */
  waveHealRatio: number
  /** 波末金币分红(团队道具:债券) */
  waveCoins: number
}

/** 死亡快照(带亡语的敌人;实体已移除,死亡效果按此在死亡点重放) */
export interface PendingDeath {
  def: import('../types/enemies').EnemyDef
  x: number
  y: number
  elite: boolean
  boss: boolean
  dmgMul: number
}

/** 首帧前把队员摆到岗位(镜像 setup 里的 layoutTeam(0)) */
export function initialLayout(sim: Sim): void {
  sim.dtMs = 0 // 首帧摆位:弹簧/游移都按 0 帧长求值,人直接到位
  layoutTeam(sim)
  animateCharacters(sim)
}

/** 一帧仿真(镜像 update 的 updateOrbit→moveTeam→steerEnemies 次序);delta 为真实帧长(ms) */

/** 世界时间流速(镜像 worldTimeScale):时停窗口内随队伍移动量放缩,窗口外恒 1 */
export function worldTimeScale(sim: Sim): number {
  return sim.timeStopMsLeft > 0 ? timeScaleFor(sim.chrono) : 1
}

/** 波末/失败过场的冻结期:世界与战斗全停,但纯视觉照旧收尾——
 * 旧实现只 physics.pause(),碎片飞散与金币弹入是 tween,不受影响 */
export function stepFrozenVisuals(sim: Sim): void {
  sim.fxMs += sim.dtMs
  updateShards(sim)
  stepPickupVisuals(sim)
}

/** 一帧仿真。两个帧长在帧起点由场景写进 sim（dtMs 真实 / wdtMs 世界），
 * 此后每个 system 自己去读。次序是数据，见 pipeline/sim.ts */
export function stepSim(sim: Sim): void {
  // 世界钟按世界时长推进:波次计时/复活/无敌帧/毒跳等一并随时停放慢(与旧一致)
  sim.elapsedMs += sim.wdtMs
  sim.fxMs += sim.dtMs // 纯视觉时钟走真实帧长
  if (sim.timeStopMsLeft > 0) sim.timeStopMsLeft = Math.max(0, sim.timeStopMsLeft - sim.wdtMs)
  // 移动量低通平滑走实时 delta:moveTeam 会写 moveInputRaw,供下一帧 worldTimeScale 读
  sim.chrono += (sim.moveInputRaw - sim.chrono) * Math.min(1, sim.dtMs / TIMESTOP.easeMs)
  runPipeline(SIM_PIPELINE, sim)
}

/** 组装本局的仿真状态。**队长实体先建**——队伍中心即它的位置，队员绕它编队，
 * 移速/磁吸半径是它的组件而非全局字段。随后建全部角色实体，最后拼出 Sim。 */
export function makeSim(
  world: EcsWorld,
  atlas: EcsAtlas,
  run: RunState,
  testMode: boolean,
  center: { x: number; y: number },
  mapW: number,
  mapH: number,
): Sim {
  const teamFx = aggregateTeamCards(run.teamCards)
  const captainDef = CAPTAINS[run.captainId]
  const captain = spawnCaptain(
    world,
    center.x,
    center.y,
    captainDef.moveSpeed * UNIT * teamFx.moveSpeedMul,
    captainDef.coinMagnet * UNIT * teamFx.magnetMul,
  )
  const team = formTeam(world, atlas, run, testMode, captain)
  const { count, formation, postBySlot, lineupOrbit, characters } = team
  return {
    world,
    teamDir: { x: 0, y: 0 },
    moveInputRaw: 0,
    formation,
    count,
    postBySlot,
    lineupOrbit,
    characters,
    mapId: run.mapId,
    mapW,
    mapH,
    hooks: worldFor(run.mapId),
    worldState: newWorldState(),
    view: { x: 0, y: 0, right: mapW, bottom: mapH },
    elapsedMs: 0,
    fxMs: 0,
    dtMs: 0,
    wdtMs: 0,
    over: false,
    bossDown: false,
    characterHitCount: 0,
    timeStopMsLeft: 0,
    chrono: 0,
    battleMods: [],
    battleFx: { ...BATTLE_FX_IDENTITY },
    enemySlowMul: teamFx.enemySlowMul,
    frameAttractors: [],
    enemyTargets: [],
    characterTargets: [],
    frames: atlas,
    pendingDeaths: [],
    out: newOutbox(),
    rng: new Rng(run.decorSeed ^ 0x9e37),
    testMode,
    spawnCooldownMs: 300,
    run,
    reward: {
      captainXpMul: captainDef.xpGainMul * teamFx.xpGainMul,
      doubleCoinChance: teamFx.doubleCoinChance,
      waveHealRatio: teamFx.waveHealRatio,
      waveCoins: teamFx.waveCoins,
    },
    captain,
  }
}
