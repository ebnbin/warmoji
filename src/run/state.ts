import { CHARACTERS, ROSTER_IDS, memberStats } from '../data/characters'
import type { CharacterId } from '../types/characters'
import { WAVE } from '../data/waves'
import { RUNS } from '../data/runs'
import type { GrowthProgress, ItemId } from '../types/items'
import type { Hazard, MapId } from '../types/maps'
import type { EnemyKind } from '../types/enemies'
import type { FightDef, MutatorId, RunDef, RunId, StepDef, TeamSlot } from '../types/runs'
import { MAP_IDS } from '../data/maps'
import type { XpState } from '../types/xp'
import { sandboxTeam } from '../ecs/sandbox/knobs'

/** 无敌时的生命上限 */
export const INVINCIBLE_HP = 10_000_000

export interface RunState {
  /** 这一局的玩法 */
  runId: RunId
  /** 走到第几步 */
  step: number
  /** 这一场或接下来那一场在哪张地图上打 */
  mapId: MapId
  /** 这一局的地图：玩家选的或玩法固定的，没写地图的场次在这里打 */
  homeMap: MapId
  decorSeed: number
  wave: number
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

/** 开一局：地图固定的不看玩家选的；玩法给了队伍就按它组队、满血开局，否则由招募步骤补上；给了开局进度就从那里起；带上自选的词缀 */
export function beginRun(id: RunId, mapId: MapId = MAP_IDS[0]!, mutators: readonly MutatorId[] = []): RunState {
  const def = RUNS[id]
  const home = def.map ?? mapId
  const run: RunState = {
    runId: id,
    step: 0,
    mapId: home,
    homeMap: home,
    decorSeed: (Math.random() * 0xffffffff) >>> 0,
    wave: def.start?.wave ?? 1,
    coins: def.coins ?? 0,
    kills: 0,
    xp: { level: 1, xp: 0 },
    claimed: 0,
    combatMs: (def.start?.sec ?? 0) * 1000,
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
    mutators: [...mutators],
    stats: {
      damage: [],
      kills: [],
      deaths: [],
      damageTaken: [],
      enemyKills: {},
      enemyDamage: {},
      hazardDamage: {},
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

export function currentRun(): RunState | undefined {
  return current
}

export function getRun(): RunState {
  if (current) return current
  const run = beginRun('classic')
  addMember(run, ROSTER_IDS[0]!)
  skipFilled(run)
  return run
}

export function endRun(): void {
  current = undefined
}

export function runDef(run: RunState): RunDef {
  return RUNS[run.runId]
}

/** 这一局实际打了多久：开局进度给的秒数不算 */
export function foughtMs(run: RunState): number {
  return run.combatMs - (runDef(run).start?.sec ?? 0) * 1000
}

/** 当前这一步；步骤都走完了是 undefined */
export function stepOf(run: RunState): StepDef | undefined {
  return runDef(run).steps[run.step]
}

/** 已经招够人的招募步骤直接跳过 */
export function skipFilled(run: RunState): void {
  while (stepOf(run)?.kind === 'recruit' && recruitDueCount(run) === 0) run.step++
  syncMap(run)
}

/** 当前这一步做完了，走到下一个要做的步骤 */
export function nextStep(run: RunState): void {
  run.step++
  skipFilled(run)
}

/** 这一场在哪张地图上打 */
export function fightMap(run: RunState, fight: FightDef): MapId {
  return fight.map ?? run.homeMap
}

/** 地图跟着当前或接下来那一场走；后面没有战斗了就留在最后一场的地图上 */
function syncMap(run: RunState): void {
  const next = runDef(run).steps.slice(run.step).find((s) => s.kind === 'fight')
  if (next?.kind === 'fight') run.mapId = fightMap(run, next.fight)
}

/** 这一局许招的角色：规则限定了标签就只许招同时带着它们的 */
export function recruitPool(run: RunState): CharacterId[] {
  const tags = runDef(run).rules?.recruit?.tags ?? []
  return ROSTER_IDS.filter((id) => tags.every((t) => CHARACTERS[id].tags.includes(t)))
}

/** 许招又还没入队的角色 */
export function recruitCandidates(run: RunState): CharacterId[] {
  return recruitPool(run).filter((id) => !run.roster.includes(id))
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
