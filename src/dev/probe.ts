import type { MetricsReport } from './metrics'

// window.__dev：独立于 __warmoji（后者是 HUD 状态，ECS 战斗期间不写），两套框架下都可采集

export interface DevPerfProbe {
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
