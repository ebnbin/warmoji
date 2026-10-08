import { CHARACTERS, ROSTER_IDS, memberStats } from '../data/characters'
import type { CharacterId } from '../types/characters'
import { WAVE } from '../data/waves'
import { fightsOf, RUNS } from '../data/runs'
import type { GrowthProgress, ItemId } from '../types/items'
import type { Hazard, MapId } from '../types/maps'
import type { EnemyKind } from '../types/enemies'
import type { MutatorId, RunDef, RunId, StepDef, TeamSlot } from '../types/runs'
import type { XpState } from '../types/xp'
import type { SceneKey } from '../scene/keys'
import { sandboxTeam } from '../ecs/sandbox/knobs'
import { rollSandbox, sandboxRun } from './sandbox'

/** 无敌时的生命上限 */
export const INVINCIBLE_HP = 10_000_000

export interface RunState {
  /** 这一局的玩法 */
  def: RunDef
  /** 内置关卡的 id，记成绩要用；按一份关卡数据开的局没有 */
  runId?: RunId
  /** 离开这一局时回到的页面；不写就按各个出口原本去的地方 */
  origin?: SceneKey
  /** 走到第几步 */
  step: number
  /** 这一场或接下来那一场在哪张地图上打 */
  mapId: MapId
  decorSeed: number
  coins: number
  kills: number
  /** 全队经验：满了升级 */
  xp: XpState
  /** 全队升级已经领了几次：靠全队升级的一局里，每次招一名新队员或给一名队员升一级算一次 */
  claimed: number
  combatMs: number
  roster: CharacterId[]
  /** 每人带进下一场的生命；Infinity 是满血开局 */
  memberHp: number[]
  memberItems: ItemId[][]
  skillCd: number[]
  /** 永久形态（局内进化），-1 是本体 */
  memberForm: number[]
  /** 跨波保留的资源值，-1 是没有 */
  memberRes: number[]
  memberGrowth: GrowthProgress[]
  /** 靠全队升级的一局里每人升到了几级 */
  memberLevels: number[]
  /** 每人已计入成长的击杀数 */
  growthKills: number[]
  leaderId: CharacterId
  /** 队员的等级下限：买道具攒的等级比它低时按它算 */
  minLevel: number
  /** 队伍无敌：生命上限锁在极大值 */
  invincible: boolean
  /** 全队还能起来几次；Infinity 是不限 */
  lives: number
  /** 这一局回不来的队员，按名单位置 */
  fallen: boolean[]
  /** 开局前自选的词缀 */
  mutators: MutatorId[]
  stats: {
    damage: number[]
    kills: number[]
    deaths: number[]
    damageTaken: number[]
    enemyKills: Partial<Record<EnemyKind, number>>
    enemyDamage: Partial<Record<EnemyKind, number>>
    hazardDamage: Partial<Record<Hazard, number>>
    /** 死于地图上各种危害的敌人 */
    hazardKills: Partial<Record<Hazard, number>>
    eliteKills: number
    /** 手动换队长的次数 */
    switches: number
    /** 放主动技能的次数 */
    casts: number
  }
}

let current: RunState | undefined

/** 预设队伍的名单：指定的直接入队，按标签的从别的位置都没占、带齐这些标签的角色里随机挑 */
function pickTeam(slots: readonly TeamSlot[]): CharacterId[] {
  const out: CharacterId[] = []
  const fixed = new Set(slots.filter((s) => typeof s === 'string'))
  for (const s of slots) {
    if (typeof s === 'string') {
      out.push(s)
      continue
    }
    const pool = ROSTER_IDS.filter((c) => !fixed.has(c) && !out.includes(c) && s.tags.every((t) => CHARACTERS[c].tags.includes(t)))
    out.push(pool[Math.floor(Math.random() * pool.length)]!)
  }
  return out
}

/** 开一局内置关卡，带上自选的词缀 */
export function beginRun(id: RunId, mutators: readonly MutatorId[] = []): RunState {
  return openRun(RUNS[id], { runId: id, mutators })
}

/** 在这张图上开一局沙盒 */
export function beginSandbox(map: MapId): RunState {
  return openRun(sandboxRun(map), {})
}

/** 从选图页进一张图的沙盒：先在这张图对应的角色、小怪与头目里重抽一遍 */
export function enterSandbox(map: MapId): RunState {
  rollSandbox(map)
  return beginSandbox(map)
}

/** 按一份关卡数据开一局，离开时回到 origin */
export function beginCustomRun(def: RunDef, origin: SceneKey): RunState {
  return openRun(def, { origin })
}

/** 按同样的玩法、词缀与来处再开一局 */
export function restartRun(run: RunState): RunState {
  return openRun(run.def, { runId: run.runId, mutators: run.mutators, origin: run.origin })
}

/** 新的布景种子：地图的布局、地面装饰与出怪口都按它生成 */
function newSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0
}

/** 开一局：玩法给了队伍就按它组队、满血开局，否则由招募步骤补上；带上自选的词缀 */
function openRun(def: RunDef, opts: { readonly runId?: RunId; readonly mutators?: readonly MutatorId[]; readonly origin?: SceneKey }): RunState {
  const run: RunState = {
    def,
    runId: opts.runId,
    origin: opts.origin,
    step: 0,
    mapId: fightsOf(def)[0]!.map,
    decorSeed: newSeed(),
    coins: def.coins ?? 0,
    kills: 0,
    xp: { level: 1, xp: 0 },
    claimed: 0,
    combatMs: 0,
    roster: [],
    memberHp: [],
    memberItems: [],
    skillCd: [],
    memberForm: [],
    memberRes: [],
    memberGrowth: [],
    memberLevels: [],
    growthKills: [],
    leaderId: ROSTER_IDS[0]!,
    minLevel: 1,
    invincible: false,
    lives: def.rules?.lives ?? Infinity,
    fallen: [],
    mutators: [...(opts.mutators ?? [])],
    stats: {
      damage: [],
      kills: [],
      deaths: [],
      damageTaken: [],
      enemyKills: {},
      enemyDamage: {},
      hazardDamage: {},
      hazardKills: {},
      eliteKills: 0,
      switches: 0,
      casts: 0,
    },
  }
  if (def.team === 'knobs') {
    const t = sandboxTeam()
    for (const m of t.ids) addMember(run, m)
    run.minLevel = t.level
    run.invincible = t.invincible
    run.memberHp.fill(Infinity)
  } else if (def.team) {
    for (const m of pickTeam(def.team.slots)) addMember(run, m)
    run.minLevel = def.team.level ?? 1
    run.memberHp.fill(Infinity)
  }
  syncMap(run)
  current = run
  return run
}

/** 把这一局当作进行中的一局：照录像重打时换上录下的那一局 */
export function adoptRun(run: RunState): void {
  current = run
}

export function currentRun(): RunState | undefined {
  return current
}

/** 进行中的一局：只有开了局才进得了要它的页面 */
export function getRun(): RunState {
  if (!current) throw new Error('没有进行中的一局')
  return current
}

export function endRun(): void {
  current = undefined
}

export function runDef(run: RunState): RunDef {
  return run.def
}

/** 这一局要走的步骤 */
export function stepsOf(run: RunState): readonly StepDef[] {
  return runDef(run).steps
}

/** 当前这一步；步骤都走完了是 undefined */
export function stepOf(run: RunState): StepDef | undefined {
  return stepsOf(run)[run.step]
}

/** 已经招够人的招募步骤直接跳过 */
export function skipFilled(run: RunState): void {
  while (stepOf(run)?.kind === 'recruit' && recruitDueCount(run) === 0) run.step++
  syncMap(run)
}

/** 当前这一步做完了，走到下一个要做的步骤；冒险的一章逛完商店，下一场换一张新生成的地图 */
export function nextStep(run: RunState): void {
  if (runDef(run).chapter !== undefined && stepOf(run)?.kind === 'shop') run.decorSeed = newSeed()
  run.step++
  skipFilled(run)
}

/** 地图跟着当前或接下来那一场走；后面没有战斗了就留在最后一场的地图上 */
function syncMap(run: RunState): void {
  const next = stepsOf(run).slice(run.step).find((s) => s.kind === 'fight')
  if (next?.kind === 'fight') run.mapId = next.fight.map
}

/** 还没入队的角色 */
export function recruitCandidates(run: RunState): CharacterId[] {
  return ROSTER_IDS.filter((id) => !run.roster.includes(id))
}

/** 当前这一步还要招几人：不是招募步骤就是 0 */
export function recruitDueCount(run: RunState): number {
  const step = stepOf(run)
  if (step?.kind !== 'recruit') return 0
  return Math.max(0, Math.min(step.upTo - run.roster.length, recruitCandidates(run).length))
}

/** 队员入队：第一个入队的就是队长 */
export function addMember(run: RunState, id: CharacterId): number {
  run.roster.push(id)
  run.memberHp.push(memberStats(CHARACTERS[id]).maxHp)
  run.memberItems.push([])
  run.skillCd.push(0)
  run.memberForm.push(-1)
  run.memberRes.push(-1)
  run.memberGrowth.push({})
  run.memberLevels.push(1)
  run.growthKills.push(0)
  run.fallen.push(false)
  run.stats.damage.push(0)
  run.stats.kills.push(0)
  run.stats.deaths.push(0)
  run.stats.damageTaken.push(0)
  if (run.roster.length === 1) run.leaderId = id
  return run.roster.length - 1
}

export function recruitMember(run: RunState, id: CharacterId): number {
  if (recruitDueCount(run) === 0 || !recruitCandidates(run).includes(id)) return -1
  return addMember(run, id)
}

/** 队长所在的名单位置；名单里找不到或他回不来了，就交给第一个还在的 */
export function leaderSlot(run: RunState): number {
  const at = run.roster.indexOf(run.leaderId)
  return at >= 0 && !run.fallen[at] ? at : Math.max(0, run.fallen.indexOf(false))
}

export function waveStartHp(storedHp: number, maxHp: number): number {
  if (storedHp > 0) return Math.min(storedHp, maxHp)
  return Math.round(maxHp * WAVE.reviveHpRatio)
}
