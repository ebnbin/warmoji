// 性能基准的负载规格与运行状态（模块级，跨场景重启保留）。
//
// 基准要回答的问题：同样数量级的实体，旧框架（arcade：一实体一 GameObject +
// Arcade Physics body）与 ECS（数据导向 + 自绘批量渲染）各自的帧预算花在哪。
// 因此负载必须「两侧同规格、可复现」——不靠自然刷怪，而是直接补足到目标数量。

export type BenchFramework = 'arcade' | 'ecs'

/** 一次基准的负载规格：各类实体的目标在场数量 */
export interface BenchSpec {
  /** 敌人：吃 AI/转向/碰撞/渲染 */
  enemies: number
  /** 我方弹体：吃逐帧位移 + 命中检测 + 渲染 */
  projectiles: number
  /** 地面金币：吃磁吸 + 拾取判定 + 渲染 */
  coins: number
}

/** 数量档位：几百 → 几千 → 上万，跨两个数量级 */
export const BENCH_STEPS: readonly number[] = [0, 100, 250, 500, 1000, 2000, 4000, 8000, 16000]

export interface BenchPreset {
  readonly id: string
  readonly label: string
  readonly desc: string
  readonly spec: BenchSpec
}

/** 预设：各自压一类实体，最后一个是混合满载 */
export const BENCH_PRESETS: readonly BenchPreset[] = [
  { id: 'light', label: '轻载', desc: '基线：正常战斗的量级', spec: { enemies: 100, projectiles: 100, coins: 100 } },
  { id: 'enemy', label: '敌人压力', desc: '只堆敌人：AI + 转向 + 碰撞', spec: { enemies: 4000, projectiles: 0, coins: 0 } },
  { id: 'proj', label: '弹幕压力', desc: '只堆弹体：逐帧位移 + 命中检测', spec: { enemies: 0, projectiles: 8000, coins: 0 } },
  { id: 'pickup', label: '拾取压力', desc: '只堆金币：磁吸 + 拾取判定', spec: { enemies: 0, projectiles: 0, coins: 8000 } },
  { id: 'mixed', label: '混合满载', desc: '三类同时拉满', spec: { enemies: 4000, projectiles: 4000, coins: 4000 } },
  { id: 'extreme', label: '极限', desc: '各 16000——预期两侧都会跪，看谁跪得晚', spec: { enemies: 16000, projectiles: 16000, coins: 16000 } },
]

const DEFAULT_SPEC: BenchSpec = { enemies: 1000, projectiles: 1000, coins: 1000 }

let spec: BenchSpec = { ...DEFAULT_SPEC }
let framework: BenchFramework = 'ecs'
/** 基准模式开关：置位后 battle facade 按 framework 强制路由，战斗侧进入补量循环 */
let active = false
/** 每秒把在场数量补回目标（实体会自然消亡，不补就测不到稳态） */
let refill = true

export function benchSpec(): BenchSpec {
  return spec
}

export function setBenchSpec(next: BenchSpec): void {
  spec = { ...next }
}

/** 单项加减：在 BENCH_STEPS 上按档位移动 */
export function stepBenchCount(key: keyof BenchSpec, dir: 1 | -1): void {
  const cur = spec[key]
  const i = BENCH_STEPS.findIndex((v) => v >= cur)
  const at = i < 0 ? BENCH_STEPS.length - 1 : i
  const next = BENCH_STEPS[Math.max(0, Math.min(BENCH_STEPS.length - 1, at + dir))]!
  spec = { ...spec, [key]: next }
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

export function benchRefill(): boolean {
  return refill
}

export function setBenchRefill(on: boolean): void {
  refill = on
}

/** 规格总量（面板标题用） */
export function benchTotal(s: BenchSpec = spec): number {
  return s.enemies + s.projectiles + s.coins
}
