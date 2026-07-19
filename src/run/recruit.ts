import type { CaptainId } from '../captains/registry'
import type { CharacterId } from '../characters/registry'
import type { StringStorage } from '../core/storage'
import { Rng } from '../core/rng'

// 命定卡池的随机源：种子绑队长、本地持久化。存储值 0 = 「未初始化」哨兵，
// 第一次真正取用时以当前时间戳初始化并落盘（0 永远不会被当作实际种子）。
// 一局任何形式的落幕（胜/败/主动放弃，收口在 run.ts endRun）都滚一个新种子；
// 刷新页面/关浏览器/菜单里来回逛不换池——「开局立刻弃局来换池」是已知且
// 被允许的行为，堵死它反而让连续对局总看到同一批人、像 bug。
const KEY = 'warmoji.recruit.v1'

function loadSeeds(storage: StringStorage | undefined): Record<string, number> {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(KEY) ?? 'null')
    return typeof raw === 'object' && raw !== null ? (raw as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function saveSeeds(storage: StringStorage | undefined, seeds: Record<string, number>): void {
  try {
    storage?.setItem(KEY, JSON.stringify(seeds))
  } catch {
    // 隐私模式/配额写入失败可忽略
  }
}

/** 时间戳种子（>>>0 后可能为 0 的宇宙射线兜底成 1，保住哨兵语义） */
function freshSeed(): number {
  return Math.max(1, Date.now() >>> 0)
}

/** 读队长的招募种子；未初始化（0/缺失/脏数据）时用时间戳初始化并落盘 */
export function recruitSeed(storage: StringStorage | undefined, captainId: CaptainId): number {
  const seeds = loadSeeds(storage)
  const stored = seeds[captainId]
  let seed = typeof stored === 'number' && Number.isFinite(stored) ? stored >>> 0 : 0
  if (seed === 0) {
    seed = freshSeed()
    seeds[captainId] = seed
    saveSeeds(storage, seeds)
  }
  return seed
}

/** 一局落幕：给该队长滚一个新种子 */
export function refreshRecruitSeed(storage: StringStorage | undefined, captainId: CaptainId): void {
  const seeds = loadSeeds(storage)
  seeds[captainId] = freshSeed()
  saveSeeds(storage, seeds)
}

/** 开局抽定整局的命定卡池：从全花名册抽 size 张（顺序即卡位，整局固定）。
 * 纯函数——弃局重开（种子未刷）必得同样十张、同样排列 */
export function drawRecruitPool(
  seed: number,
  roster: readonly CharacterId[],
  size = RECRUIT.poolSize,
): CharacterId[] {
  const rng = new Rng(seed >>> 0)
  const pool = [...roster]
  const n = Math.max(0, Math.min(size, pool.length))
  // Fisher–Yates 只洗前 n 位
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng.next() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  return pool.slice(0, n)
}

/** 已开放编制数 → 解锁的卡数（查表，越界取末位并封顶池大小） */
export function unlockedCount(openSlots: number): number {
  const table = RECRUIT.unlocks
  const idx = Math.max(0, Math.min(table.length - 1, openSlots - 1))
  return Math.min(RECRUIT.poolSize, openSlots <= 0 ? 0 : table[idx]!)
}

/** 卡位 index（0 起）要到几名编制开放时才揭晓（1 起）；表外卡位视作末档 */
export function unlockAt(index: number): number {
  const table = RECRUIT.unlocks
  for (let k = 0; k < table.length; k++) {
    if (table[k]! >= index + 1) return k + 1
  }
  return table.length
}

// 命定卡池：开局用队长种子一次抽 poolSize 张角色牌（整局固定，不逐轮重抽），
// 按「已开放编制数」查表解锁可选张数——开放 1 人 4 张、2 人 6 张…封顶全开。
// 未解锁的牌盖着（❓ 不露身份），已入队的牌保留在池中标记（本文件）
export const RECRUIT = {
  poolSize: 10,
  /** 下标 = 开放编制数 - 1；越界取末位（≥5 人全开） */
  unlocks: [4, 6, 8, 9, 10],
} as const
