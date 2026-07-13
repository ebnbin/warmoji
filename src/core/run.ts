import { MEMBER, WAVE } from './config'
import type { ItemId } from './items'
import type { XpState } from './xp'

// 一局（run）的跨波次状态：出发时创建，波次间经由商店传递，回组队页时丢弃。
// 金币/击杀/经验在战斗中直接累积；血量在波次结束时快照。
export interface RunState {
  /** 当前要打的波次（1 起）；波次结束进商店前 +1 */
  wave: number
  coins: number
  kills: number
  xp: XpState
  /** 已完成波次的累计战斗时长，驱动难度曲线跨波递增 */
  combatMs: number
  /** 按阵容槽位的波末血量；0 = 该波结束时已阵亡 */
  memberHp: number[]
  /** 按阵容槽位的已购道具（重复 = 堆叠） */
  memberItems: ItemId[][]
  captainItems: ItemId[]
  /** 本次商店剩余的免费刷新次数（进店时按队长能力重置） */
  freeRefreshes: number
}

let current: RunState | undefined

export function beginRun(memberCount: number): RunState {
  current = {
    wave: 1,
    coins: 0,
    kills: 0,
    xp: { level: 1, xp: 0 },
    combatMs: 0,
    memberHp: Array.from({ length: memberCount }, () => MEMBER.maxHp),
    memberItems: Array.from({ length: memberCount }, () => []),
    captainItems: [],
    freeRefreshes: 0,
  }
  return current
}

/** 阵容变化或未经组队页直接进战斗时自动开新局兜底 */
export function getRun(memberCount: number): RunState {
  if (!current || current.memberHp.length !== memberCount) return beginRun(memberCount)
  return current
}

export function endRun(): void {
  current = undefined
}

/** 调试/e2e 注入：给进行中的一局加金币 */
export function grantCoins(n: number): void {
  if (current) current.coins += n
}

/** 波次开局血量：存活者延续波末血量，阵亡者以低血量复活 */
export function waveStartHp(storedHp: number, maxHp: number): number {
  if (storedHp > 0) return Math.min(storedHp, maxHp)
  return Math.round(maxHp * WAVE.reviveHpRatio)
}
