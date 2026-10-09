import { SIM_PIPELINE } from './systems/pipeline/sim'
import { runPipeline } from './systems/pipeline/step'
import { settleLandings } from './systems/landCharacters'
import { finishZoneFades } from './systems/updateZones'
import { updateEmplacements } from './systems/updateEmplacements'
import { updateShards } from './systems/updateShards'
import { expireFx } from './systems/expireFx'
import { layoutTeam } from './systems/layoutTeam'
import type { EcsWorld } from './world'
import type { WorldHooks, WorldState } from './worlds/hooks'
import type { Outbox } from './outbox'
import type { RunState } from '../run/state'
import type { Target } from './utils/targets'
import type { FrameIndex } from './frames'
import { TIMESTOP } from '../data/timeStop'
import { BATTLE_FX_IDENTITY } from '../data/battlefield'
import type { BattleEffects } from '../types/battlefield'
import { Rng } from '../util/rng'
import { formTeam } from './entities/team'
import { newWorldState } from './worlds/hooks'
import { worldFor } from './worlds/registry'
import { newOutbox } from './outbox'
import { FACTION, Stats } from './components'
import type { FightDef } from '../types/runs'
import { fightMods, newFight } from './fight/state'
import { layDown } from './systems/shared/combat'
import type { FightState } from './fight/state'

export interface Sim {
  world: EcsWorld
  teamDir: { x: number; y: number }
  moveInputRaw: number
  leader: number
  heading: { x: number; y: number }
  handover: Handover | null
  aim: { x: number; y: number }
  characters: number[]
  /** 每个角色的主动技能（连段的第一段），按槽位 */
  skills: number[]
  mapId: import('../types/maps').MapId
  mapW: number
  mapH: number
  hooks: WorldHooks
  worldState: WorldState
  view: { x: number; y: number; right: number; bottom: number }
  elapsedMs: number
  fxMs: number
  dtMs: number
  wdtMs: number
  over: boolean
  /** 这一场有头目倒下过 */
  bossDown: boolean
  timeStopMsLeft: number
  chrono: number
  battleFx: BattleEffects
  /** 队伍道具定下的全场规则：敌人的移速与出怪速度的倍率 */
  foes: { readonly speed: number; readonly count: number }
  frameAttractors: { x: number; y: number; r2: number }[]
  /** 按阵营的可被打身体快照，每帧开头与身体走完后各刷新一次 */
  targets: Target[][]
  frames: FrameIndex
  /** 走过的步数 */
  tick: number
  rng: Rng
  /** 只给画面效果用的随机：不占玩法那一路，开关画面效果也不改变战局 */
  fxRng: Rng
  /** 这一场的规则与进行中的状态 */
  fight: FightState
  pendingDeaths: PendingDeath[]
  out: Outbox
  onDeathFx?: (d: PendingDeath) => void
  run: RunState
}

/** 换队长的过渡期：尺寸插值、相机偏移收敛、新队长免伤；camX/camY 是旧中心相对新中心的偏移 */
interface Handover {
  msLeft: number
  ms: number
  from: number
  to: number
  fromScale: number
  toScale: number
  camX: number
  camY: number
}

export interface PendingDeath {
  eid: number
  def: import('../types/enemies').NpcDef
  x: number
  y: number
  elite: boolean
  boss: boolean
  /** 死者的出手属性：亡语按它结算 */
  atk: import('./utils/stats').Offense
  faction: number
}

export function initialLayout(sim: Sim): void {
  sim.dtMs = 0
  layoutTeam(sim)
}

function timeScaleFor(input01: number): number {
  const t = input01 < 0 ? 0 : input01 > 1 ? 1 : input01
  return TIMESTOP.floor + (1 - TIMESTOP.floor) * t
}

export function worldTimeScale(sim: Sim): number {
  return sim.timeStopMsLeft > 0 ? timeScaleFor(sim.chrono) : 1
}

/** 打完以后战局停住：画面时钟照真实时间走，到时的特效、碎片、装置、场照样收走，还在空中的队员直接落地 */
export function stepFrozen(sim: Sim, dtMs: number): void {
  sim.dtMs = dtMs
  sim.fxMs += dtMs
  updateShards(sim)
  expireFx(sim)
  settleLandings(sim)
  finishZoneFades(sim)
  updateEmplacements(sim)
}

export function stepSim(sim: Sim): void {
  sim.elapsedMs += sim.wdtMs
  sim.fxMs += sim.dtMs
  if (sim.timeStopMsLeft > 0) sim.timeStopMsLeft = Math.max(0, sim.timeStopMsLeft - sim.wdtMs)
  sim.chrono += (sim.moveInputRaw - sim.chrono) * Math.min(1, sim.dtMs / TIMESTOP.easeMs)
  runPipeline(SIM_PIPELINE, sim)
}

export function makeSim(
  world: EcsWorld,
  frames: FrameIndex,
  run: RunState,
  origin: { x: number; y: number },
  mapW: number,
  mapH: number,
  fight: FightDef,
): Sim {
  const state = newFight(fight, run)
  const seed = (run.decorSeed ^ 0x9e37 ^ Math.imul(run.step, 0x9e3779b1)) >>> 0
  const team = formTeam(world, frames, run, origin.x, origin.y, fightMods(state, FACTION.team))
  const { characters, leader } = team
  const sim: Sim = {
    world,
    teamDir: { x: 0, y: 0 },
    moveInputRaw: 0,
    characters,
    skills: [],
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
    timeStopMsLeft: 0,
    chrono: 0,
    battleFx: { ...BATTLE_FX_IDENTITY },
    foes: {
      speed: characters.reduce((v, m) => v * Stats.enemySpeed[m]!, 1),
      count: characters.reduce((v, m) => v * Stats.enemyCount[m]!, 1),
    },
    frameAttractors: [],
    targets: [[], []],
    frames,
    pendingDeaths: [],
    out: newOutbox(),
    tick: 0,
    rng: new Rng(seed),
    fxRng: new Rng((seed ^ 0x5bd1e995) >>> 0),
    fight: state,
    run,
    leader,
    heading: { x: 0, y: -1 },
    handover: null,
    aim: { x: 0, y: -1 },
  }
  // 上一场倒下的人倒着上场
  characters.forEach((m, slot) => {
    if (run.memberHp[slot] === 0) layDown(sim, m)
  })
  return sim
}
