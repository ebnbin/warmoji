import { CHARACTERS, ROSTER_IDS, memberStats } from '../data/characters'
import type { CharacterId } from '../types/characters'
import { WAVE } from '../data/waves'
import { RUNS } from '../data/runs'
import type { GrowthProgress, ItemId } from '../types/items'
import type { Hazard, MapId } from '../types/maps'
import type { EnemyKind } from '../types/enemies'
import type { RunDef, RunId, StepDef } from '../types/runs'
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
  mapId: MapId
  decorSeed: number
  wave: number
  coins: number
  kills: number
  xp: XpState
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
  /** 每人已计入成长的击杀数 */
  growthKills: number[]
  leaderId: CharacterId
  /** 队员的等级下限：买道具攒的等级比它低时按它算 */
  minLevel: number
  /** 队伍无敌：生命上限锁在极大值 */
  invincible: boolean
  stats: {
    damage: number[]
    kills: number[]
    deaths: number[]
    damageTaken: number[]
    enemyKills: Partial<Record<EnemyKind, number>>
    enemyDamage: Partial<Record<EnemyKind, number>>
    hazardDamage: Partial<Record<Hazard, number>>
    eliteKills: number
  }
}

let current: RunState | undefined

/** 开一局：玩法给了队伍就按它组队、满血开局，否则由招募步骤补上 */
export function beginRun(id: RunId, mapId: MapId = MAP_IDS[0]!): RunState {
  const def = RUNS[id]
  const run: RunState = {
    runId: id,
    step: 0,
    mapId,
    decorSeed: (Math.random() * 0xffffffff) >>> 0,
    wave: 1,
    coins: def.coins ?? 0,
    kills: 0,
    xp: { level: 1, xp: 0 },
    combatMs: 0,
    roster: [],
    memberHp: [],
    memberItems: [],
    skillCd: [],
    memberForm: [],
    memberRes: [],
    memberGrowth: [],
    growthKills: [],
    leaderId: ROSTER_IDS[0]!,
    minLevel: 1,
    invincible: false,
    stats: {
      damage: [],
      kills: [],
      deaths: [],
      damageTaken: [],
      enemyKills: {},
      enemyDamage: {},
      hazardDamage: {},
      eliteKills: 0,
    },
  }
  if (def.team === 'knobs') {
    const t = sandboxTeam()
    for (const m of t.ids) addMember(run, m)
    run.minLevel = t.level
    run.invincible = t.invincible
    run.memberHp.fill(Infinity)
  }
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

/** 当前这一步；步骤都走完了是 undefined */
export function stepOf(run: RunState): StepDef | undefined {
  return runDef(run).steps[run.step]
}

/** 已经招够人的招募步骤直接跳过 */
export function skipFilled(run: RunState): void {
  while (stepOf(run)?.kind === 'recruit' && recruitDueCount(run) === 0) run.step++
}

/** 当前这一步做完了，走到下一个要做的步骤 */
export function nextStep(run: RunState): void {
  run.step++
  skipFilled(run)
}

/** 还没入队的角色都能招 */
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
  run.growthKills.push(0)
  run.stats.damage.push(0)
  run.stats.kills.push(0)
  run.stats.deaths.push(0)
  run.stats.damageTaken.push(0)
  if (run.roster.length === 1) run.leaderId = id
  return run.roster.length - 1
}

export function recruitMember(run: RunState, id: CharacterId): number {
  if (recruitDueCount(run) === 0 || !(id in CHARACTERS) || run.roster.includes(id)) return -1
  return addMember(run, id)
}

/** 队长所在的名单位置；名单里找不到就回到首位 */
export function leaderSlot(run: RunState): number {
  return Math.max(0, run.roster.indexOf(run.leaderId))
}

export function waveStartHp(storedHp: number, maxHp: number): number {
  if (storedHp > 0) return Math.min(storedHp, maxHp)
  return Math.round(maxHp * WAVE.reviveHpRatio)
}
