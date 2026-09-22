import { UNIT } from '../util/units'
import { SIM_PIPELINE } from './systems/pipeline/sim'
import { runPipeline } from './systems/pipeline/step'
import { animateCharacters } from './systems/animateCharacters'
import { stepPickupVisuals } from './systems/stepPickupVisuals'
import { updateShards } from './systems/updateShards'
import { animateBooms } from './systems/animateBooms'
import { expireFx } from './systems/expireFx'
import { layoutTeam } from './systems/layoutTeam'
import type { FormationId } from '../types/formation'
import type { EcsWorld } from './world'
import type { WorldHooks, WorldState } from './worlds/hooks'
import type { Outbox } from './outbox'
import type { RunState } from '../run/state'
import type { Target } from './utils/targets'
import type { FrameIndex } from './frames'
import { TIMESTOP } from '../data/timeStop'
import { BATTLE_FX_IDENTITY } from '../data/battlefield'
import type { BattleEffects } from '../types/battlefield'
import { CAPTAINS } from '../data/captains'
import { aggregateTeamCards } from '../data/cards'
import { Rng } from '../util/rng'
import { spawnCaptain } from './entities/captain'
import { formTeam } from './entities/captain'
import { newWorldState, worldFor } from './worlds/hooks'
import { newOutbox } from './outbox'
import type { EcsAtlas } from './atlas'

export interface Sim {
  world: EcsWorld
  teamDir: { x: number; y: number }
  /** 0..1，供时停时标 */
  moveInputRaw: number
  /** 队伍中心即它的 Transform */
  captain: number
  formation: FormationId
  count: number
  /** 槽位 → 岗位 */
  postBySlot: number[]
  /** 槽位 → 环上秉性 */
  lineupOrbit: number[]
  /** 按槽位序 */
  characters: number[]
  mapId: import('../types/maps').MapId
  mapW: number
  mapH: number
  hooks: WorldHooks
  /** 只有 hooks 与场景侧建场/取视觉碰它 */
  worldState: WorldState
  /** 场景侧每帧回填 */
  view: { x: number; y: number; right: number; bottom: number }
  elapsedMs: number
  /** 纯视觉时钟：真实帧长累加，不吃时停，过场冻结期照走 */
  fxMs: number
  /** 帧起点写一次，system 一律从这里读。dtMs 真实帧长（走位/视觉）；wdtMs 世界时长（敌人/弹体/刷怪），时停期更慢 */
  dtMs: number
  wdtMs: number
  over: boolean
  bossDown: boolean
  /** 场景侧据增量触发震屏 */
  characterHitCount: number
  /** 世界时长；>0 时世界时标随移动量放缩 */
  timeStopMsLeft: number
  /** 移动量的低通平滑值，worldTimeScale 的输入 */
  chrono: number
  /** 派生值：由在场限时层实体折出 */
  battleFx: BattleEffects
  /** 开局定；与 battleFx.enemySlowMul 相乘 */
  enemySlowMul: number
  /** 每帧重建 */
  frameAttractors: { x: number; y: number; r2: number }[]
  /** 每帧重建，含环面镜像坐标 */
  enemyTargets: Target[]
  characterTargets: Target[]
  frames: FrameIndex
  /** 按 run 种子确定 */
  rng: Rng
  sandbox: boolean
  spawnCooldownMs: number
  /** 帧内通道，runDeathEffects 排空 */
  pendingDeaths: PendingDeath[]
  /** 仿真只写，场景侧每帧排空 */
  out: Outbox
  /** 挂上则在 killEnemy 内当场跑，否则回落到 pendingDeaths */
  onDeathFx?: (d: PendingDeath) => void
  run: RunState
  /** 开局定；精英倍率逐杀再叠 */
  reward: RewardConfig
}

export interface RewardConfig {
  /** 队长 × 道具；精英逐杀再叠 */
  captainXpMul: number
  doubleCoinChance: number
  waveHealRatio: number
  waveCoins: number
}

/** 实体已移除，死亡效果按此在死亡点重放 */
export interface PendingDeath {
  def: import('../types/enemies').EnemyDef
  x: number
  y: number
  elite: boolean
  boss: boolean
  dmgMul: number
}

export function initialLayout(sim: Sim): void {
  sim.dtMs = 0 // 0 帧长：人直接到位
  layoutTeam(sim)
  animateCharacters(sim)
}

/** 移动量 [0,1] → 流速 [floor,1]，线性 */
function timeScaleFor(input01: number): number {
  const t = input01 < 0 ? 0 : input01 > 1 ? 1 : input01
  return TIMESTOP.floor + (1 - TIMESTOP.floor) * t
}

/** 时停窗口外恒 1 */
export function worldTimeScale(sim: Sim): number {
  return sim.timeStopMsLeft > 0 ? timeScaleFor(sim.chrono) : 1
}

/** 过场冻结期：世界全停，纯视觉照旧收尾 */
export function stepFrozenVisuals(sim: Sim): void {
  sim.fxMs += sim.dtMs
  updateShards(sim)
  animateBooms(sim)
  expireFx(sim)
  stepPickupVisuals(sim)
}

/** 帧长由场景在帧起点写进 sim；次序见 pipeline/sim.ts */
export function stepSim(sim: Sim): void {
  sim.elapsedMs += sim.wdtMs
  sim.fxMs += sim.dtMs
  if (sim.timeStopMsLeft > 0) sim.timeStopMsLeft = Math.max(0, sim.timeStopMsLeft - sim.wdtMs)
  // moveInputRaw 由 moveTeam 写，供下一帧读
  sim.chrono += (sim.moveInputRaw - sim.chrono) * Math.min(1, sim.dtMs / TIMESTOP.easeMs)
  runPipeline(SIM_PIPELINE, sim)
}

/** 队长实体先建，再建角色实体 */
export function makeSim(
  world: EcsWorld,
  atlas: EcsAtlas,
  run: RunState,
  sandbox: boolean,
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
  const team = formTeam(world, atlas, run, sandbox, captain)
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
    battleFx: { ...BATTLE_FX_IDENTITY },
    enemySlowMul: teamFx.enemySlowMul,
    frameAttractors: [],
    enemyTargets: [],
    characterTargets: [],
    frames: atlas,
    pendingDeaths: [],
    out: newOutbox(),
    rng: new Rng(run.decorSeed ^ 0x9e37),
    sandbox,
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
