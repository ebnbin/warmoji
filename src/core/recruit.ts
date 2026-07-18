import type { CaptainId, CharacterId } from './config'
import type { StringStorage } from './highscore'
import { Rng } from './rng'

// 招募候选池的随机源：种子绑队长、本地持久化。存储值 0 = 「未初始化」哨兵，
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

/** 抽一批候选：按（种子 × 已招人数）派生子流，从剩余候选中抽 k 个。
 * 纯函数——同一局内反复进出招募页、弃局重开后同样输入必得同样候选 */
export function rollCandidates(
  seed: number,
  recruitedCount: number,
  remaining: readonly CharacterId[],
  k: number,
): CharacterId[] {
  const rng = new Rng((seed ^ Math.imul(recruitedCount + 1, 0x9e3779b9)) >>> 0)
  const pool = [...remaining]
  const n = Math.max(0, Math.min(k, pool.length))
  // Fisher–Yates 只洗前 n 位
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng.next() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  return pool.slice(0, n)
}
