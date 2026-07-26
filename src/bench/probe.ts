import type { MetricsReport } from './metrics'
import type { BenchFramework, BenchSpec } from './spec'

// 基准读数的对外出口：window.__bench。
// 独立于游戏的 __warmoji 探针——后者是 HUD 状态、且 ECS 战斗期间不写；
// 基准要能在两侧同样地被外部脚本（CI/对比脚本）采集，故自带一条通道。

export interface BenchProbe {
  framework: BenchFramework
  spec: BenchSpec
  /** 在场实际数量（与 spec 的差值即补量滞后） */
  live: { enemies: number; projectiles: number; coins: number }
  objects: number
  bodies: number
  metrics: MetricsReport
}

export function reportBench(p: BenchProbe): void {
  window.__bench = p
}

export function clearBench(): void {
  window.__bench = undefined
}
