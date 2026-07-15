import type { CaptainId, CharacterId } from './config'
import { CAPTAINS, CHARACTERS, LEVELS, MEMBER, ROSTER_IDS, WAVE } from './config'
import type { FormationId } from './formation'
import type { ItemId } from './items'
import { gainXp } from './xp'
import type { XpState } from './xp'

// 一局（run）的跨波次状态：出发时创建，波次间经由商店传递，回组队页时丢弃。
// 经验模型：队伍每升 1 级得 1 点数，点数用于招募新角色（入队 1 级）或给在场角色 +1 级；
// 点数不可逆、允许攒着不花。阵容从首发（通常 1 人）逐波扩编，上限 = 队长编制。
export interface RunState {
  captainId: CaptainId
  /** 当前要打的波次（1 起）；波次结束进商店前 +1 */
  wave: number
  coins: number
  kills: number
  xp: XpState
  /** 已花掉的点数（招募+升级）；可用点数 = xp.level - pointsSpent */
  pointsSpent: number
  /** 已完成波次的累计战斗时长，驱动难度曲线跨波递增 */
  combatMs: number
  /** 已招募角色（下标即槽位） */
  roster: CharacterId[]
  /** 按槽位的角色等级（1..LEVELS.max） */
  memberLevels: number[]
  /** 按槽位的波末血量；0 = 该波结束时已阵亡 */
  memberHp: number[]
  /** 按槽位的已购道具（重复 = 堆叠） */
  memberItems: ItemId[][]
  captainItems: ItemId[]
  /** 本次商店剩余的免费刷新次数（进店时按队长能力重置） */
  freeRefreshes: number
  /** N 保 1 的岗位次序：0 号 = 受保护中心，1.. = 外圈固定次序；满员时懒初始化。
   * 互换中心只交换两个人的岗位，其他人永不跳位 */
  guardOrder: CharacterId[]
  /** 首次满员的阵型页是否已自动展示（只展示一次，之后走商店入口调整） */
  formationIntroduced: boolean
}

let current: RunState | undefined

export function beginRun(captainId: CaptainId, starters: readonly CharacterId[]): RunState {
  current = {
    captainId,
    wave: 1,
    coins: 0,
    kills: 0,
    xp: { level: CAPTAINS[captainId].startLevel, xp: 0 },
    pointsSpent: starters.length,
    combatMs: 0,
    roster: [...starters],
    memberLevels: starters.map(() => 1),
    memberHp: starters.map(() => MEMBER.maxHp),
    memberItems: starters.map(() => []),
    captainItems: [],
    freeRefreshes: 0,
    guardOrder: [],
    formationIntroduced: false,
  }
  return current
}

/** 未经组队页直接进战斗时兜底开新局（默认队长 + 花名册首个角色） */
export function getRun(): RunState {
  if (!current) return beginRun('angel', ROSTER_IDS.slice(0, 1))
  return current
}

export function endRun(): void {
  current = undefined
}

export function pointsAvailable(run: RunState): number {
  return Math.max(0, run.xp.level - run.pointsSpent)
}

export function rosterCap(run: RunState): number {
  return CAPTAINS[run.captainId].teamSize
}

/** 未招募的候选角色（按花名册顺序） */
export function recruitCandidates(run: RunState): CharacterId[] {
  return ROSTER_IDS.filter((id) => !run.roster.includes(id))
}

export function canRecruit(run: RunState, id: CharacterId): boolean {
  return (
    pointsAvailable(run) > 0 &&
    run.roster.length < rosterCap(run) &&
    id in CHARACTERS &&
    !run.roster.includes(id)
  )
}

/** 花 1 点招募：入队 1 级、满血、无道具；返回新槽位（失败 -1） */
export function recruitMember(run: RunState, id: CharacterId): number {
  if (!canRecruit(run, id)) return -1
  run.pointsSpent += 1
  run.roster.push(id)
  run.memberLevels.push(1)
  run.memberHp.push(MEMBER.maxHp)
  run.memberItems.push([])
  return run.roster.length - 1
}

export function isTeamFull(run: RunState): boolean {
  return run.roster.length >= rosterCap(run)
}

/** 满员后自动 N 保 1，未满员固定环形（阵型不可选） */
export function currentFormation(run: RunState): FormationId {
  return isTeamFull(run) ? 'guard' : 'ring'
}

/** 满员时懒初始化岗位次序（默认 = 花名册顺序，1 号位居中） */
function ensureGuardOrder(run: RunState): void {
  if (!isTeamFull(run)) return
  const valid =
    run.guardOrder.length === run.roster.length &&
    run.roster.every((id) => run.guardOrder.includes(id))
  if (!valid) run.guardOrder = [...run.roster]
}

/** N 保 1 的岗位次序快照：0 号中心、1.. 外圈；未满员按花名册顺序（环形用） */
export function guardOrder(run: RunState): CharacterId[] {
  if (!isTeamFull(run)) return [...run.roster]
  ensureGuardOrder(run)
  return [...run.guardOrder]
}

/** 受保护中心（岗位 0）；未满员无中心 */
export function guardCenter(run: RunState): CharacterId | null {
  if (!isTeamFull(run)) return null
  ensureGuardOrder(run)
  return run.guardOrder[0] ?? null
}

/** 设置受保护中心：只交换新旧中心两人的岗位，外圈其他人保持原位 */
export function setGuardCenter(run: RunState, id: CharacterId): boolean {
  if (!isTeamFull(run) || !run.roster.includes(id)) return false
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

/** 整编步骤：进商店前强制消费点数的类型——未满编先招募，满编后给未满级队员升级；
 * 无点数或无事可办（满编且全员满级）返回 null，直接进店 */
export function promoteStep(run: RunState): 'recruit' | 'upgrade' | null {
  if (pointsAvailable(run) <= 0) return null
  if (run.roster.length < rosterCap(run) && recruitCandidates(run).length > 0) return 'recruit'
  if (run.memberLevels.some((lv) => lv < LEVELS.max)) return 'upgrade'
  return null
}

export function canUpgrade(run: RunState, slot: number): boolean {
  const level = run.memberLevels[slot]
  return pointsAvailable(run) > 0 && level !== undefined && level < LEVELS.max
}

/** 花 1 点给槽位角色 +1 级 */
export function upgradeMember(run: RunState, slot: number): boolean {
  if (!canUpgrade(run, slot)) return false
  run.pointsSpent += 1
  run.memberLevels[slot] = (run.memberLevels[slot] ?? 1) + 1
  return true
}

/** 波次开局血量：存活者延续波末血量，阵亡者以低血量复活 */
export function waveStartHp(storedHp: number, maxHp: number): number {
  if (storedHp > 0) return Math.min(storedHp, maxHp)
  return Math.round(maxHp * WAVE.reviveHpRatio)
}

/** 调试/e2e 注入：给进行中的一局加金币 */
export function grantCoins(n: number): void {
  if (current) current.coins += n
}

/** 调试/e2e 注入：给进行中的一局加经验（走正常升级结算） */
export function grantXp(n: number): void {
  if (current) current.xp = gainXp(current.xp, n).state
}
