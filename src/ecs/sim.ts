import { SIM_PIPELINE } from './systems/pipeline/sim'
import { runPipeline } from './systems/pipeline/step'
import { animateCharacters, finishCharacterPops } from './systems/animateCharacters'
import { characterVisual } from './systems/characterVisual'
import { finishEnemyPops } from './systems/popInEnemies'
import { hideTelegraphs } from './systems/blinkTelegraphs'
import { finishZoneFades } from './systems/updateZones'
import { updateEmplacements } from './systems/updateEmplacements'
import { stepPickupVisuals } from './systems/stepPickupVisuals'
import { updateShards } from './systems/updateShards'
import { animateBooms } from './systems/animateBooms'
import { expireFx } from './systems/expireFx'
import { layoutTeam } from './systems/layoutTeam'
import type { EcsWorld } from './world'
import type { WorldHooks, WorldState } from './worlds/hooks'
import type { Outbox } from './outbox'
import type { DamageNumbers } from './damageNumbers'
import type { RunState } from '../run/state'
import type { Target } from './utils/targets'
import type { FrameIndex } from './frames'
import { TIMESTOP } from '../data/timeStop'
import { BATTLE_FX_IDENTITY } from '../data/battlefield'
import type { BattleEffects } from '../types/battlefield'
import { Rng } from '../util/rng'
import { formTeam } from './entities/team'
import { newWorldState, worldFor } from './worlds/hooks'
import { newOutbox } from './outbox'
import { newDamageNumbers } from './damageNumbers'
import type { EcsAtlas } from './atlas'

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
  bossDown: boolean
  characterHitCount: number
  timeStopMsLeft: number
  chrono: number
  battleFx: BattleEffects
  frameAttractors: { x: number; y: number; r2: number }[]
  /** 按阵营的可被打身体快照，每帧开头与身体走完后各刷新一次 */
  targets: Target[][]
  frames: FrameIndex
  rng: Rng
  sandbox: boolean
  spawnCooldownMs: number
  pendingDeaths: PendingDeath[]
  out: Outbox
  damageNumbers: DamageNumbers | null
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
  dmgMul: number
  faction: number
}

export function initialLayout(sim: Sim): void {
  sim.dtMs = 0
  layoutTeam(sim)
  animateCharacters(sim)
}

function timeScaleFor(input01: number): number {
  const t = input01 < 0 ? 0 : input01 > 1 ? 1 : input01
  return TIMESTOP.floor + (1 - TIMESTOP.floor) * t
}

export function worldTimeScale(sim: Sim): number {
  return sim.timeStopMsLeft > 0 ? timeScaleFor(sim.chrono) : 1
}

export function stepFrozenVisuals(sim: Sim): void {
  sim.fxMs += sim.dtMs
  updateShards(sim)
  animateBooms(sim)
  expireFx(sim)
  stepPickupVisuals(sim)
  characterVisual(sim)
  finishCharacterPops(sim)
  finishEnemyPops(sim)
  hideTelegraphs(sim)
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
  atlas: EcsAtlas,
  run: RunState,
  sandbox: boolean,
  origin: { x: number; y: number },
  mapW: number,
  mapH: number,
  damageNumbers: boolean,
): Sim {
  const team = formTeam(world, atlas, run, sandbox, origin.x, origin.y)
  const { characters, leader } = team
  return {
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
    characterHitCount: 0,
    timeStopMsLeft: 0,
    chrono: 0,
    battleFx: { ...BATTLE_FX_IDENTITY },
    frameAttractors: [],
    targets: [[], []],
    frames: atlas,
    pendingDeaths: [],
    out: newOutbox(),
    damageNumbers: damageNumbers ? newDamageNumbers() : null,
    rng: new Rng((run.decorSeed ^ 0x9e37 ^ Math.imul(run.wave, 0x9e3779b1)) >>> 0),
    sandbox,
    spawnCooldownMs: 300,
    run,
    leader,
    heading: { x: 0, y: -1 },
    handover: null,
    aim: { x: 0, y: -1 },
  }
}
