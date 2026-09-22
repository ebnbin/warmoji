import { CAPTAINS } from '../data/captains'
import { CHARACTERS, MEMBER, ROSTER_IDS } from '../data/characters'
import type { CaptainId } from '../types/captains'
import type { CharacterId } from '../types/characters'
import { WAVE } from '../data/waves'
import type { FormationId } from '../types/formation'
import { browserStorage } from '../util/storage'
import type { ItemId } from '../types/items'
import type { CardId } from '../types/cards'
import type { MapId } from '../types/maps'
import { MAP_IDS } from '../data/maps'
import { drawRecruitPool, recruitSeed, refreshRecruitSeed, unlockedCount } from './recruit'
import { waveDurationMs } from '../data/waves'
import type { XpState } from '../types/xp'

export interface RunState {
  captainId: CaptainId
  mapId: MapId
  sandbox: boolean
  /** 一局一景，各波不变 */
  decorSeed: number
  /** 1 起；波次结束进商店前 +1 */
  wave: number
  coins: number
  kills: number
  /** level = 已升级数，xp = 当前级进度；无上限 */
  xp: XpState
  /** 每升 1 级 +1 */
  cardDraws: number
  /** cardId → 等级 */
  teamCards: Partial<Record<CardId, number>>
  /** 已完成波次的累计 */
  combatMs: number
  /** 顺序即卡位，整局固定 */
  recruitPool: CharacterId[]
  /** 下标即槽位 */
  roster: CharacterId[]
  /** 按槽位；0 = 波末已阵亡 */
  memberHp: number[]
  /** 按槽位；重复 = 堆叠；角色等级由此纯函数推导，凡进此列表就计入 */
  memberItems: ItemId[][]
  /** 进店时重置 */
  freeRefreshes: number
  /** 跨波持久；只在战斗内递减 */
  skillCdMs: number
  /** 0 号 = 受保护中心，1.. = 外圈；懒初始化；互换中心只交换两人 */
  guardOrder: CharacterId[]
  formationIntroduced: boolean
  stats: {
    damage: number[]
    kills: number[]
    deaths: number[]
    damageTaken: number[]
    /** 敌人名 → 我方击杀数 */
    enemyKills: Record<string, number>
    /** 敌人名 → 对我方造成的伤害 */
    enemyDamage: Record<string, number>
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
  // 跳波开局：难度时钟按被跳过波次的时长预推进，与正常打到该波一致
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
      eliteKills: 0,
    },
  }
  return current
}

export function tickSkillCd(remainMs: number, deltaMs: number): number {
  return Math.max(0, remainMs - deltaMs)
}

export function getRun(): RunState {
  if (!current) return beginRun('angel', ROSTER_IDS.slice(0, 1))
  return current
}

/** 胜/败/主动放弃的唯一收口 */
export function endRun(): void {
  if (current) refreshRecruitSeed(browserStorage(), current.captainId)
  current = undefined
}

export function rosterCap(run: RunState): number {
  return CAPTAINS[run.captainId].teamSize
}

/** 含本波名额 */
export function recruitUnlocked(run: RunState): number {
  return Math.min(unlockedCount(Math.min(rosterCap(run), run.wave)), run.recruitPool.length)
}

export function recruitCandidates(run: RunState): CharacterId[] {
  return run.recruitPool.slice(0, recruitUnlocked(run)).filter((id) => !run.roster.includes(id))
}

export function recruitDue(run: RunState): boolean {
  return run.roster.length < Math.min(rosterCap(run), run.wave)
}

export function recruitDueCount(run: RunState): number {
  const due = Math.min(rosterCap(run), run.wave) - run.roster.length
  return Math.max(0, Math.min(due, recruitCandidates(run).length))
}

export function canRecruit(run: RunState, id: CharacterId): boolean {
  return recruitDue(run) && id in CHARACTERS && !run.roster.includes(id)
}

/** 返回新槽位，失败 -1 */
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

/** 与 teamSize 脱钩 */
export const GUARD_MIN = 5

export function hasCenter(run: RunState): boolean {
  return run.roster.length >= GUARD_MIN
}

export function currentFormation(run: RunState): FormationId {
  return hasCenter(run) ? 'guard' : 'ring'
}

/** 增量保序：新入队者接到外圈末尾，中心不动 */
function ensureGuardOrder(run: RunState): void {
  if (!hasCenter(run)) return
  const kept = run.guardOrder.filter((id) => run.roster.includes(id))
  const added = run.roster.filter((id) => !kept.includes(id))
  if (added.length === 0 && kept.length === run.guardOrder.length) return
  run.guardOrder = [...kept, ...added]
}

/** 未达门槛按 roster 顺序 */
export function guardOrder(run: RunState): CharacterId[] {
  if (!hasCenter(run)) return [...run.roster]
  ensureGuardOrder(run)
  return [...run.guardOrder]
}

/** 未达门槛为 null */
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

/** null = 直接进店 */
export function promoteStep(run: RunState): 'recruit' | null {
  return recruitDueCount(run) > 0 ? 'recruit' : null
}

/** storedHp 0（阵亡）以低血量复活 */
export function waveStartHp(storedHp: number, maxHp: number): number {
  if (storedHp > 0) return Math.min(storedHp, maxHp)
  return Math.round(maxHp * WAVE.reviveHpRatio)
}

