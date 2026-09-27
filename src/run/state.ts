import { CHARACTERS, ROSTER_IDS, TEAM, memberStats } from '../data/characters'
import type { CharacterId } from '../types/characters'
import { WAVE } from '../data/waves'
import type { GrowthProgress, ItemId } from '../types/items'
import type { Hazard, MapId } from '../types/maps'
import type { EnemyKind } from '../types/enemies'
import { MAP_IDS } from '../data/maps'
import type { XpState } from '../types/xp'
import { SceneKey } from '../scene/keys'

export interface RunState {
  mapId: MapId
  sandbox: boolean
  decorSeed: number
  wave: number
  coins: number
  kills: number
  xp: XpState
  combatMs: number
  roster: CharacterId[]
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

export function beginRun(starters: readonly CharacterId[], mapId: MapId = MAP_IDS[0]!, sandbox = false): RunState {
  const roster = [...starters]
  current = {
    mapId,
    sandbox,
    decorSeed: (Math.random() * 0xffffffff) >>> 0,
    wave: 1,
    coins: 0,
    kills: 0,
    xp: { level: 1, xp: 0 },
    combatMs: 0,
    roster,
    memberHp: roster.map((id) => memberStats(CHARACTERS[id]).maxHp),
    memberItems: roster.map(() => []),
    skillCd: roster.map(() => 0),
    memberForm: roster.map(() => -1),
    memberRes: roster.map(() => -1),
    memberGrowth: roster.map(() => ({})),
    growthKills: roster.map(() => 0),
    leaderId: roster[0]!,
    stats: {
      damage: roster.map(() => 0),
      kills: roster.map(() => 0),
      deaths: roster.map(() => 0),
      damageTaken: roster.map(() => 0),
      enemyKills: {},
      enemyDamage: {},
      hazardDamage: {},
      eliteKills: 0,
    },
  }
  return current
}

export function currentRun(): RunState | undefined {
  return current
}

export function getRun(): RunState {
  if (!current) return beginRun(ROSTER_IDS.slice(0, 1))
  return current
}

export function endRun(): void {
  current = undefined
}

/** 还没入队的角色都能招 */
export function recruitCandidates(run: RunState): CharacterId[] {
  return ROSTER_IDS.filter((id) => !run.roster.includes(id))
}

function recruitDue(run: RunState): boolean {
  return run.roster.length < Math.min(TEAM.maxSize, run.wave)
}

export function recruitDueCount(run: RunState): number {
  const due = Math.min(TEAM.maxSize, run.wave) - run.roster.length
  return Math.max(0, Math.min(due, recruitCandidates(run).length))
}

function canRecruit(run: RunState, id: CharacterId): boolean {
  return recruitDue(run) && id in CHARACTERS && !run.roster.includes(id)
}

export function recruitMember(run: RunState, id: CharacterId): number {
  if (!canRecruit(run, id)) return -1
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
  return run.roster.length - 1
}

/** 队长所在的名单位置；名单里找不到就回到首位 */
export function leaderSlot(run: RunState): number {
  return Math.max(0, run.roster.indexOf(run.leaderId))
}

export function teamStep(run: RunState): SceneKey.Recruit | null {
  return recruitDueCount(run) > 0 ? SceneKey.Recruit : null
}

export function waveStartHp(storedHp: number, maxHp: number): number {
  if (storedHp > 0) return Math.min(storedHp, maxHp)
  return Math.round(maxHp * WAVE.reviveHpRatio)
}

