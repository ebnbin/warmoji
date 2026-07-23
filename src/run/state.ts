import { CAPTAINS } from '../captains/registry'
import { CHARACTERS, MEMBER, ROSTER_IDS } from '../characters/registry'
import type { CaptainId } from '../captains/registry'
import type { CharacterId } from '../characters/registry'
import { WAVE } from './waves'
import type { FormationId } from '../characters/formation'
import { browserStorage } from '../core/storage'
import type { ItemId } from '../items/registry'
import type { CardId } from '../cards/registry'
import type { MapId } from '../maps/registry'
import { MAP_IDS } from '../maps/registry'
import { drawRecruitPool, recruitSeed, refreshRecruitSeed, unlockedCount } from './recruit'
import { waveDurationMs } from './waves'
import { gainXp } from './xp'
import type { XpState } from './xp'

// 一局（run）的跨波次状态：出发时创建，波次间经由商店传递，回组队页时丢弃。
// 经验模型：每升 1 级得 1 颗能量豆（队长技能的弹药，上限 SKILL.maxBeans，
// 满则经验冻结）。招募与经验无关：开局招 1 人，此后每波结束固定招 1 人
//（强制、不可跳过、无其他途径），直到满编（上限 = 队长编制）。
// 角色没有等级：变强只靠商店道具（含角色专属升级卡）。
export interface RunState {
  captainId: CaptainId
  /** 本局地图（关卡）；开局在地图选择页定下 */
  mapId: MapId
  /** 测试模式：地图页勾选进入——免死无时限的沙盒，敌人/角色/队长/密度/难度场内自由切换 */
  testMode: boolean
  /** 地面装饰的摆放种子：一局一景，同局各波不变 */
  decorSeed: number
  /** 当前要打的波次（1 起）；波次结束进商店前 +1 */
  wave: number
  coins: number
  kills: number
  /** 经验进度：level = 生涯已升的级数（驱动升级抽卡次数），xp = 当前级的攒取进度。
   * 每升 1 级 = 1 次团队升级抽卡（cardDraws），无上限、不冻结 */
  xp: XpState
  /** 待抽的团队升级卡次数（每升 1 级 +1；战斗后开卡页逐次三选一） */
  cardDraws: number
  /** 已获得的团队升级卡（cardId → 等级）：聚合成 teamFx，替代原队长道具那套 */
  teamCards: Partial<Record<CardId, number>>
  /** 已完成波次的累计战斗时长，驱动难度曲线跨波递增 */
  combatMs: number
  /** 命定卡池：开局按队长种子抽定的可招募范围（顺序即卡位，整局固定；
   * 按已开放编制数逐档解锁，见 core/recruit.ts unlockedCount） */
  recruitPool: CharacterId[]
  /** 已招募角色（下标即槽位） */
  roster: CharacterId[]
  /** 按槽位的波末血量；0 = 该波结束时已阵亡 */
  memberHp: number[]
  /** 按槽位的已装备道具（重复 = 堆叠）。角色专属经验/等级由此列表纯函数推导
   *（characterXp = 各道具 upgradeXp 之和），与获得来源无关——凡进此列表就计入 */
  memberItems: ItemId[][]
  /** 本次商店剩余的免费刷新次数（进店时按队长能力重置） */
  freeRefreshes: number
  /** 队长主动技能的剩余冷却：跨波持久，战斗内实时递减（商店/整编不走表） */
  skillCdMs: number
  /** N 保 1 的岗位次序：0 号 = 受保护中心，1.. = 外圈固定次序；满员时懒初始化。
   * 互换中心只交换两个人的岗位，其他人永不跳位 */
  guardOrder: CharacterId[]
  /** 首次满员的阵型页是否已自动展示（只展示一次，之后走商店入口调整） */
  formationIntroduced: boolean
  /** 结算统计：按槽位整局累计（输出/承伤/击杀/阵亡）+ 按敌人名的敌情明细 */
  stats: {
    damage: number[]
    kills: number[]
    deaths: number[]
    damageTaken: number[]
    /** 敌人名 → 我方击杀数 */
    enemyKills: Record<string, number>
    /** 敌人名 → 它们对我方造成的伤害 */
    enemyDamage: Record<string, number>
    eliteKills: number
  }
}

let current: RunState | undefined

export function beginRun(
  captainId: CaptainId,
  starters: readonly CharacterId[],
  mapId: MapId = MAP_IDS[0]!,
  testMode = false,
): RunState {
  const captain = CAPTAINS[captainId]
  // 跳波开局（如神童）：难度时钟按被跳过波次的时长预推进，
  // 敌人血量/刷怪节奏与正常打到该波一致（也计入结算的总时长口径）；
  // 能量豆拉满，阵容不代填——recruitDue 按波次给足名额，玩家整编页自选招满
  let skippedMs = 0
  for (let w = 1; w < captain.startWave; w++) skippedMs += waveDurationMs(w)
  const roster = [...starters]
  current = {
    captainId,
    recruitPool: drawRecruitPool(recruitSeed(browserStorage(), captainId), ROSTER_IDS),
    mapId,
    testMode,
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
    // 开局 CD 即就绪：首放只卡在挣第一颗豆上
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

/** 未经组队页直接进战斗时兜底开新局（默认队长 + 花名册首个角色） */
export function getRun(): RunState {
  if (!current) return beginRun('angel', ROSTER_IDS.slice(0, 1))
  return current
}

/** 一局落幕（胜/败/主动放弃的唯一收口）：丢弃局状态并滚新招募种子 */
export function endRun(): void {
  if (current) refreshRecruitSeed(browserStorage(), current.captainId)
  current = undefined
}

export function rosterCap(run: RunState): number {
  return CAPTAINS[run.captainId].teamSize
}

/** 本轮解锁的卡数：按已开放编制数（含本波名额）查表 */
export function recruitUnlocked(run: RunState): number {
  return Math.min(unlockedCount(Math.min(rosterCap(run), run.wave)), run.recruitPool.length)
}

/** 当前可选的候选：命定卡池中已解锁且未入队的牌（保持卡位顺序） */
export function recruitCandidates(run: RunState): CharacterId[] {
  return run.recruitPool.slice(0, recruitUnlocked(run)).filter((id) => !run.roster.includes(id))
}

/** 本波是否有招募名额：开局 1 人，此后每波结束 +1，直到满编 */
export function recruitDue(run: RunState): boolean {
  return run.roster.length < Math.min(rosterCap(run), run.wave)
}

/** 本波实际可招的名额数（跳波开局可能一次多名；受已解锁未入队数钳制） */
export function recruitDueCount(run: RunState): number {
  const due = Math.min(rosterCap(run), run.wave) - run.roster.length
  return Math.max(0, Math.min(due, recruitCandidates(run).length))
}

export function canRecruit(run: RunState, id: CharacterId): boolean {
  return recruitDue(run) && id in CHARACTERS && !run.roster.includes(id)
}

/** 招募（本波名额内）：入队满血、无道具；返回新槽位（失败 -1） */
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

export function isTeamFull(run: RunState): boolean {
  return run.roster.length >= rosterCap(run)
}

/** 出现「受保护中心」（可编排）所需的最少队员数：首次满此数即可选一人居中，
 * 之后新入队者只补外圈——与 teamSize 脱钩（未来 8 人队长也在 5 人时定中心） */
export const GUARD_MIN = 5

/** 是否已达「有中心」门槛（roster ≥ GUARD_MIN）：驱动战斗阵型、编排首秀与商店阵型入口 */
export function hasCenter(run: RunState): boolean {
  return run.roster.length >= GUARD_MIN
}

/** 达 5 人后自动 N 保 1，未达则固定环形（阵型不可选） */
export function currentFormation(run: RunState): FormationId {
  return hasCenter(run) ? 'guard' : 'ring'
}

/** 懒同步岗位次序：增量保序——保留现有次序（含 0 号中心）、剔除已离队者、
 * 新入队者接到外圈末尾（roster 从 5 涨到 6/7/8 时中心不被冲掉） */
function ensureGuardOrder(run: RunState): void {
  if (!hasCenter(run)) return
  const kept = run.guardOrder.filter((id) => run.roster.includes(id))
  const added = run.roster.filter((id) => !kept.includes(id))
  // 无增减即已同步，避免无谓改写
  if (added.length === 0 && kept.length === run.guardOrder.length) return
  run.guardOrder = [...kept, ...added]
}

/** N 保 1 的岗位次序快照：0 号中心、1.. 外圈；未达门槛按花名册顺序（环形用） */
export function guardOrder(run: RunState): CharacterId[] {
  if (!hasCenter(run)) return [...run.roster]
  ensureGuardOrder(run)
  return [...run.guardOrder]
}

/** 受保护中心（岗位 0）；未达门槛无中心 */
export function guardCenter(run: RunState): CharacterId | null {
  if (!hasCenter(run)) return null
  ensureGuardOrder(run)
  return run.guardOrder[0] ?? null
}

/** 设置受保护中心：只交换新旧中心两人的岗位，外圈其他人保持原位 */
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

/** 整编步骤：本波有招募名额（且还有候选）就必须招——不可跳过、一页把
 * 全部名额选满（跳波开局可能一次多名）；否则直接进店 */
export function promoteStep(run: RunState): 'recruit' | null {
  return recruitDueCount(run) > 0 ? 'recruit' : null
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

/** 调试/e2e 注入：给进行中的一局加经验（升级即累积团队升级抽卡次数） */
export function grantXp(n: number): void {
  if (!current) return
  const gained = gainXp(current.xp, n)
  current.xp = gained.state
  current.cardDraws += gained.levelsGained
}
