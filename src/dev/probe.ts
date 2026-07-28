import type { MetricsReport } from './metrics'

// 开发者读数的对外出口：window.__dev。
// 独立于游戏的 __warmoji 探针——后者是 HUD 状态、且 ECS 战斗期间不写；
// 性能读数要能在两套框架下同样地被外部脚本（CI/对比脚本）采集，故自带一条通道。

export interface DevPerfProbe {
  /** 在场实际数量 */
  live: { enemies: number; projectiles: number; coins: number }
  objects: number
  bodies: number
  metrics: MetricsReport
}

export function reportDevPerf(p: DevPerfProbe): void {
  window.__dev = p
}

export function clearDevPerf(): void {
  window.__dev = undefined
}
