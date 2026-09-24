import type { MetricsReport } from './metrics'

// window.__sandbox：独立于 __warmoji（后者战斗期间不写）

export interface SandboxPerfProbe {
  live: { enemies: number; projectiles: number; coins: number }
  objects: number
  metrics: MetricsReport
}

export function reportSandboxPerf(p: SandboxPerfProbe): void {
  window.__sandbox = p
}

export function clearSandboxPerf(): void {
  window.__sandbox = undefined
}
