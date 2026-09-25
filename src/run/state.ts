import { CAPTAINS } from '../data/captains'
import { CHARACTERS, MEMBER, ROSTER_IDS } from '../data/characters'
import type { CaptainId } from '../types/captains'
import type { CharacterId } from '../types/characters'
import { WAVE } from '../data/waves'
import type { FormationId } from '../types/formation'
import { browserStorage } from '../util/storage'
import type { ItemId } from '../types/items'
import type { CardId } from '../types/cards'
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
  cardDraws: number
  teamCards: Partial<Record<CardId, number>>
  combatMs: number
  recruitPool: CharacterId[]
  roster: CharacterId[]
  memberHp: number[]
  memberItems: ItemId[][]
  freeRefreshes: number
  skillCdMs: number
  guardOrder: CharacterId[]
  formationIntroduced: boolean
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
    cardDraws: 0,
    teamCards: {},
    combatMs: skippedMs,
    roster,
    memberHp: roster.map(() => MEMBER.maxHp),
    memberItems: roster.map(() => []),
    freeRefreshes: 0,
    skillCdMs: 0,
    guardOrder: [],
    formationIntroduced: false,
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

const GUARD_MIN = 5

export function hasCenter(run: RunState): boolean {
  return run.roster.length >= GUARD_MIN
}

export function currentFormation(run: RunState): FormationId {
  return hasCenter(run) ? 'guard' : 'ring'
}

function ensureGuardOrder(run: RunState): void {
  if (!hasCenter(run)) return
  const kept = run.guardOrder.filter((id) => run.roster.includes(id))
  const added = run.roster.filter((id) => !kept.includes(id))
  if (added.length === 0 && kept.length === run.guardOrder.length) return
  run.guardOrder = [...kept, ...added]
}

export function guardOrder(run: RunState): CharacterId[] {
  if (!hasCenter(run)) return [...run.roster]
  ensureGuardOrder(run)
  return [...run.guardOrder]
}

export function guardCenter(run: RunState): CharacterId | null {
  if (!hasCenter(run)) return null
  ensureGuardOrder(run)
  return run.guardOrder[0] ?? null
}

export function setGuardCenter(run: RunState, id: CharacterId): boolean {
  if (!hasCenter(run) || !run.roster.includes(id)) return false
  ensureGuardOrder(run)
  const idx = run.guardOrder.indexOf(id)
  if (idx < 0) return false
  if (idx > 0) {
    const prev = run.guardOrder[0]!
    run.guardOrder[0] = id
    run.guardOrder[idx] = prev
  }
  return true
}

export function teamStep(run: RunState): SceneKey.Recruit | SceneKey.Formation | null {
  if (recruitDueCount(run) > 0) return SceneKey.Recruit
  if (hasCenter(run) && !run.formationIntroduced) return SceneKey.Formation
  return null
}

export function waveStartHp(storedHp: number, maxHp: number): number {
  if (storedHp > 0) return Math.min(storedHp, maxHp)
  return Math.round(maxHp * WAVE.reviveHpRatio)
}

