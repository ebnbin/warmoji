// 基准会话标志：这一局是不是「跑基准」，以及跑在哪套框架上。
//
// 强度档位曾经也住在这里（BENCH_PROFILES + applyBenchProfile），靠一条
// setDensityOverride 旁路把刷怪参数顶到试炼场档位之外。现在档位已并入
// run/lab.ts 的规模阶梯与 LAB_PRESETS——基准与试炼场跑的本就是同一局沙盒，
// 强度也就没有理由分两处描述。这里只剩「会话」本身。

export type BenchFramework = 'arcade' | 'ecs'

let framework: BenchFramework = 'ecs'
let active = false

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
