import { ROSTER_IDS } from '../data/characters'
import { ENEMY_DEFS } from '../data/enemies'
import {
  setDensityOverride,
  setLabDifficulty,
  setLabEnemies,
  setLabFireRate,
  setLabInvincible,
  setLabLevel,
  setLabRoster,
} from '../run/lab'
import type { LabLevel, LabMul, SpawnParams } from '../run/lab'

// 性能基准的强度配置。
//
// 关键前提：**基准跑的是真实战斗，不是往场上倒实体**。
// 旁路注入一批惰性实体测出来的数字没有意义——真实战场里最贵的恰恰是那些注入
// 绕不过去的东西：索敌与转向、碰撞检测与解算、伤害/击退/暴击结算、状态效果
//（减速/中毒/变形）、死亡与掉落、能力冷却与开火、波次刷新与精英加成。
// 因此这里调的全是**真实玩法旋钮**（队伍规模、角色等级、刷怪强度、敌人血量、
// 我方攻速、敌人种类），实体数量是被观测的**结果**而非输入。
//
// 刷怪走的仍是游戏自己的 spawnStep 管线，只是用 setDensityOverride 把参数开到
// 试炼场档位之外——这样上千实体也是真刷出来的，每一只都在跑完整逻辑。

export type BenchFramework = 'arcade' | 'ecs'

export interface BenchProfile {
  readonly id: string
  readonly label: string
  readonly desc: string
  /** 队伍人数（真实角色，能力自动索敌开火） */
  readonly team: number
  /** 角色等级：换整套能力形态，高阶弹幕更密 */
  readonly level: LabLevel
  /** 刷怪参数：真实 spawnStep 读它 */
  readonly spawn: SpawnParams
  /** 敌人血量倍率：活得越久堆积越多 */
  readonly difficulty: LabMul
  /** 我方攻速倍率：冷却 ÷ 它，直接决定弹幕密度与命中结算频率 */
  readonly fireRate: LabMul
  /** 参战敌人种类数（取表前 N 种；种类越多分支越杂） */
  readonly kinds: number
}

/** 强度档位：从「正常一局」一路压到「几千只同时在场」 */
export const BENCH_PROFILES: readonly BenchProfile[] = [
  {
    id: 'normal', label: '正常一局', desc: '4 人基础档 · 中密度 —— 真实游戏的量级',
    team: 4, level: 0, spawn: { intervalMs: 700, cap: 12, batch: 1 }, difficulty: 1, fireRate: 1, kinds: 6,
  },
  {
    id: 'busy', label: '繁忙', desc: '8 人一阶 · 高密度 · 攻速 ×3 —— 后期大混战',
    team: 8, level: 1, spawn: { intervalMs: 240, cap: 60, batch: 2 }, difficulty: 3, fireRate: 3, kinds: 12,
  },
  {
    id: 'heavy', label: '重载 · 数百', desc: '8 人二阶 · 爆满 · 全种类 —— 原压测档',
    team: 8, level: 2, spawn: { intervalMs: 80, cap: 800, batch: 5 }, difficulty: 10, fireRate: 10, kinds: 28,
  },
  {
    id: 'k2', label: '2 千', desc: '把真实刷怪器开到 2000 并发',
    team: 8, level: 2, spawn: { intervalMs: 40, cap: 2000, batch: 12 }, difficulty: 10, fireRate: 10, kinds: 28,
  },
  {
    id: 'k4', label: '4 千', desc: '4000 并发 —— 预期两侧都开始跪',
    team: 8, level: 2, spawn: { intervalMs: 25, cap: 4000, batch: 24 }, difficulty: 10, fireRate: 10, kinds: 28,
  },
  {
    id: 'k8', label: '8 千', desc: '8000 并发 —— 看谁跪得晚',
    team: 8, level: 2, spawn: { intervalMs: 16, cap: 8000, batch: 48 }, difficulty: 10, fireRate: 10, kinds: 28,
  },
]

let profileId = BENCH_PROFILES[0]!.id
let framework: BenchFramework = 'ecs'
let active = false

export function benchProfile(): BenchProfile {
  return BENCH_PROFILES.find((p) => p.id === profileId) ?? BENCH_PROFILES[0]!
}

export function setBenchProfile(id: string): void {
  profileId = id
}

export function benchFramework(): BenchFramework {
  return framework
}

export function setBenchFramework(f: BenchFramework): void {
  framework = f
}

export function isBenchActive(): boolean {
  return active
}

export function setBenchActive(on: boolean): void {
  active = on
}

/** 把强度档位写进试炼场状态：随后的 beginRun + 战斗场景就跑在这个强度上。
 * 全部经真实旋钮生效——没有任何一处是绕过玩法直接改场上实体的 */
export function applyBenchProfile(): void {
  const p = benchProfile()
  setLabRoster(ROSTER_IDS.slice(0, Math.min(p.team, ROSTER_IDS.length)))
  setLabLevel(p.level)
  setLabEnemies(ENEMY_DEFS.slice(0, p.kinds).map((e) => e.kind))
  setLabDifficulty(p.difficulty)
  setLabFireRate(p.fireRate)
  setLabInvincible(true) // 免死：否则重载下队伍几秒就没，测不到稳态
  setDensityOverride(p.spawn)
}

/** 退出基准：撤掉刷怪覆写，试炼场回到自己的档位 */
export function clearBenchProfile(): void {
  setDensityOverride(undefined)
}
