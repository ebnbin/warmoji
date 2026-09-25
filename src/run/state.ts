import { CAPTAINS } from '../data/captains'
import { CHARACTERS, MEMBER, ROSTER_IDS } from '../data/characters'
import type { CaptainId } from '../types/captains'
import type { CharacterId } from '../types/characters'
import { WAVE } from '../data/waves'
import { browserStorage } from '../util/storage'
import type { ItemId } from '../types/items'
import type { Hazard, MapId } from '../types/maps'
import type { EnemyKind } from '../types/enemies'
import { MAP_IDS } from '../data/maps'
import { drawRecruitPool, recruitSeed, refreshRecruitSeed, unlockedCount } from './recruit'
import { waveDurationMs } from '../data/waves'
import type { XpState } from '../types/xp'
import { SceneKey } from '../scene/keys'

export interface RunState {
  captainId: CaptainId
  mapId: MapId
  sandbox: boolean
  decorSeed: number
  wave: number
  coins: number
  kills: number
  xp: XpState
  combatMs: number
  recruitPool: CharacterId[]
  roster: CharacterId[]
  memberHp: number[]
  memberItems: ItemId[][]
  freeRefreshes: number
  skillCdMs: number
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

export function beginRun(
  captainId: CaptainId,
  starters: readonly CharacterId[],
  mapId: MapId = MAP_IDS[0]!,
  sandbox = false,
): RunState {
  const captain = CAPTAINS[captainId]
  let skippedMs = 0
  for (let w = 1; w < captain.startWave; w++) skippedMs += waveDurationMs(w)
  const roster = [...starters]
  current = {
    captainId,
    recruitPool: drawRecruitPool(recruitSeed(browserStorage(), captainId), ROSTER_IDS),
    mapId,
    sandbox,
    decorSeed: (Math.random() * 0xffffffff) >>> 0,
    wave: captain.startWave,
    coins: captain.startCoins,
    kills: 0,
    xp: { level: 1, xp: 0 },
    combatMs: skippedMs,
    roster,
    memberHp: roster.map(() => MEMBER.maxHp),
    memberItems: roster.map(() => []),
    freeRefreshes: 0,
    skillCdMs: 0,
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

export function tickSkillCd(remainMs: number, deltaMs: number): number {
  return Math.max(0, remainMs - deltaMs)
}

export function currentRun(): RunState | undefined {
  return current
}

export function getRun(): RunState {
  if (!current) return beginRun('angel', ROSTER_IDS.slice(0, 1))
  return current
}

export function endRun(): void {
  if (current) refreshRecruitSeed(browserStorage(), current.captainId)
  current = undefined
}

function rosterCap(run: RunState): number {
  return CAPTAINS[run.captainId].teamSize
}

export function recruitUnlocked(run: RunState): number {
  return Math.min(unlockedCount(Math.min(rosterCap(run), run.wave)), run.recruitPool.length)
}

export function recruitCandidates(run: RunState): CharacterId[] {
  return run.recruitPool.slice(0, recruitUnlocked(run)).filter((id) => !run.roster.includes(id))
}

function recruitDue(run: RunState): boolean {
  return run.roster.length < Math.min(rosterCap(run), run.wave)
}

export function recruitDueCount(run: RunState): number {
  const due = Math.min(rosterCap(run), run.wave) - run.roster.length
  return Math.max(0, Math.min(due, recruitCandidates(run).length))
}

function canRecruit(run: RunState, id: CharacterId): boolean {
  return recruitDue(run) && id in CHARACTERS && !run.roster.includes(id)
}

export function recruitMember(run: RunState, id: CharacterId): number {
  if (!canRecruit(run, id)) return -1
  run.roster.push(id)
  run.memberHp.push(MEMBER.maxHp)
  run.memberItems.push([])
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

