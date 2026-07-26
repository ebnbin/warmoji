import Phaser from 'phaser'

// 帧耗时采样器：把一帧拆成「更新」与「渲染」两段分别计时。
//
// 为什么必须拆开：arcade 与 ECS 的开销结构完全不同——arcade 一实体一 GameObject +
// 一个物理体，更新与渲染都随实体数线性涨；ECS 逻辑在紧凑数组里跑、渲染走自绘批量，
// 两段的斜率不一样。只看总帧时看不出差异出在哪一段，也就无从判断优化方向。
//
// 计时点用 Phaser 的四个全局帧阶段事件：
//   PRE_STEP → POST_STEP     引擎步进（场景 update + 物理 + tween）
//   PRE_RENDER → POST_RENDER 渲染提交
// 两段之外还有浏览器合成/vsync 等待，故 update + render 通常小于 rawDelta。
//
// 为什么用 loop.rawDelta 而不是 loop.delta（= 场景 update(time, delta) 收到的那个）：
// delta 被 TimeStep 加工过两道——默认 smoothStep 走 10 帧滑动平均，且一旦超过
// minFps 对应的 200ms 就**整个丢弃真实值、拿历史值顶替**（TimeStep.smoothDelta）。
// 那是为了让游戏逻辑在掉帧时不崩，不是给测量用的。rawDelta 才是未加工的墙钟帧间隔。
//（副作用：真掉到 5fps 以下时游戏会进慢动作，实体行为速度都变了——那种读数没有意义）
//
// Phaser 自带的 fps 统计只有 game.loop.actualFps 一个，口径是「每秒实际帧数」的
// 指数滑动平均（α=0.25，每秒更新）——与本文件的 fps（1000/平均帧时）等价。
// 它粒度只到秒、且 α=0.25 意味着约 10 秒才收敛（初值还被播种成 targetFps 60），
// 所以给不出分位数/分段/抖动/vsync 分档，这个采样器才有存在必要。
// 但它是**独立实现的对照组**：两个数长期对不上就是这边算错了——
// 「稳态 fps 误用中位数倒数」那个 bug 正是被它 35.2 对 59.9 的差距暴露出来的。
//
// ⚠️ 软件渲染环境（SwiftShader / 无 GPU 的 CI 容器）下**所有时间读数都不可用**：
// 实测同一框架同一档位重复三次，更新 p50 极差 arcade 7.2ms、ECS 22.0ms（11.3→33.3），
// 总帧 p50 极差 116ms——噪声比两套框架的差距大一个量级，读数只反映当时 CPU 争抢。
// 这种环境下只看面板的「引擎结构」段（GameObject / 物理体数）：那是整数计数，与机器无关。
// 想要可用的时间数据，必须在有真实 GPU 的机器上跑，且重复多次看分布。

/** 单帧采样 */
interface Frame {
  /** 本帧总时长（loop.rawDelta，含 vsync 等待） */
  total: number
  /** 引擎步进耗时 */
  update: number
  /** 渲染提交耗时 */
  render: number
  /** 两段之外的部分（vsync 等待/合成）。**必须逐帧算好再统计**：
   * 中位数不可加，用 total.p50 − update.p50 − render.p50 会算出负数
   *（实测 ECS 8 千档：16.7 − 10.8 − 7.4 = −1.5，clamp 成 0 就是个假读数） */
  rest: number
  /** 与上一帧的时长差（绝对值）——帧节奏抖动。
   * 稳定 60fps 时接近 0；在 16.7/33.3 之间反复横跳（judder）时约等于 16.7。
   * 这是分位数看不见的东西：p50=16.7、p95=33.3 既可能是「先顺后卡」，
   * 也可能是「每帧都在抖」，后者才是肉眼最难受的那种，只有帧间差能区分 */
  jitter: number
}

const CAPACITY = 1800 // 约 30 秒 @60fps；环形覆盖
/** 预热时长（ms）：跳过刚开场那阵（建纹理/编译着色器/首次批处理，不代表稳态）。
 * 按时间而非帧数——重载下可能只有几 fps，按帧数会等到天荒地老 */
const WARMUP_MS = 800

const buf: Frame[] = []
let head = 0
let filled = 0
let warmUntil = 0

let attached: Phaser.Game | undefined
let stepStart = 0
let renderStart = 0
let lastUpdate = 0
let lastRender = 0
let prevTotal = 0
/** 渲染器统计：Canvas 渲染器有 drawCount，WebGL 没有 —— 取不到就是 undefined，
 * 别填 0 冒充读数（面板上一个假的 0 比一条「—」更误导） */
let drawCount: number | undefined

function onPreStep(): void {
  stepStart = performance.now()
}
function onPostStep(): void {
  lastUpdate = performance.now() - stepStart
}
function onPreRender(): void {
  renderStart = performance.now()
}
function onPostRender(): void {
  lastRender = performance.now() - renderStart
  const g = attached
  if (!g) return
  // Phaser 的渲染器统计（Canvas 与 WebGL 字段名一致时可取；取不到留 0）
  const r = g.renderer as unknown as { drawCount?: number }
  drawCount = typeof r.drawCount === 'number' ? r.drawCount : undefined
  if (performance.now() < warmUntil) return
  const total = g.loop.rawDelta
  const f: Frame = {
    total, update: lastUpdate, render: lastRender,
    rest: Math.max(0, total - lastUpdate - lastRender),
    jitter: prevTotal > 0 ? Math.abs(total - prevTotal) : 0,
  }
  prevTotal = total
  buf[head] = f
  head = (head + 1) % CAPACITY
  if (filled < CAPACITY) filled++
}

/** 挂上采样（幂等）。战斗场景 create 时调用 */
export function attachMetrics(game: Phaser.Game): void {
  if (attached === game) return
  detachMetrics()
  attached = game
  warmUntil = performance.now() + WARMUP_MS
  game.events.on(Phaser.Core.Events.PRE_STEP, onPreStep)
  game.events.on(Phaser.Core.Events.POST_STEP, onPostStep)
  game.events.on(Phaser.Core.Events.PRE_RENDER, onPreRender)
  game.events.on(Phaser.Core.Events.POST_RENDER, onPostRender)
}

export function detachMetrics(): void {
  const g = attached
  if (!g) return
  g.events.off(Phaser.Core.Events.PRE_STEP, onPreStep)
  g.events.off(Phaser.Core.Events.POST_STEP, onPostStep)
  g.events.off(Phaser.Core.Events.PRE_RENDER, onPreRender)
  g.events.off(Phaser.Core.Events.POST_RENDER, onPostRender)
  attached = undefined
}

/** 清空采样并重新预热（切换负载/框架后调用，否则新旧数据混在一起） */
export function resetMetrics(): void {
  buf.length = 0
  head = 0
  filled = 0
  prevTotal = 0
  warmUntil = performance.now() + WARMUP_MS
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))
  return sorted[i]!
}

export interface MetricsReport {
  /** 已采样帧数（预热后） */
  samples: number
  /** 仍在预热则为 true——此时读数不可信 */
  warming: boolean
  /** 帧总时长（ms） */
  total: { mean: number; p50: number; p95: number; p99: number; max: number }
  /** 引擎步进耗时（ms） */
  update: { mean: number; p50: number; p95: number; max: number }
  /** 渲染提交耗时（ms） */
  render: { mean: number; p50: number; p95: number; max: number }
  /** 两段之外（vsync 等待/合成）的逐帧耗时（ms） */
  rest: { mean: number; p50: number; p95: number; max: number }
  /** 帧间时长跳变（ms）——帧节奏抖动，见 Frame.jitter */
  jitter: { mean: number; p50: number; p95: number; max: number }
  /** **真实平均帧率** = 1000 / 平均帧时 = 每秒实际交付的帧数 */
  fps: number
  /** 由中位帧时换算的帧率。vsync 会把帧时量化成周期的整数倍，
   * 双峰分布下中位数整个跳到过半的那一档——只能读作「过半的帧落在哪一档」，
   * **不能当帧率用**（实测 ECS 8 千档：中位 59.9，真实平均只有 ~35） */
  fpsMedian: number
  /** 1% low：最慢 1% 帧对应的 FPS（卡顿体感） */
  fpsLow1: number
  /** vsync 档位分布：落在 1 / 2 / 3 / ≥4 个刷新周期内的帧数占比（0–1）。
   * 双峰一眼可见——这是任何单个分位数都藏不住的 */
  buckets: readonly number[]
  /** 最近一帧的渲染对象数；WebGL 渲染器不提供，为 undefined */
  drawCount?: number
}

function stat(v: readonly number[]): { mean: number; p50: number; p95: number; p99: number; max: number } {
  if (v.length === 0) return { mean: 0, p50: 0, p95: 0, p99: 0, max: 0 }
  const s = [...v].sort((a, b) => a - b)
  const sum = v.reduce((a, b) => a + b, 0)
  return { mean: sum / v.length, p50: percentile(s, 50), p95: percentile(s, 95), p99: percentile(s, 99), max: s[s.length - 1]! }
}

/** @param refreshHz 屏幕刷新率，用于把帧时按 vsync 周期分档；测不到时按 60 算 */
export function metricsReport(refreshHz = 60): MetricsReport {
  const frames = buf.slice(0, filled)
  const total = stat(frames.map((f) => f.total))
  const update = stat(frames.map((f) => f.update))
  const render = stat(frames.map((f) => f.render))
  const rest = stat(frames.map((f) => f.rest))
  const jitter = stat(frames.map((f) => f.jitter))

  // 半个周期的容差：赶上 vsync 的帧实测会略小于整周期
  const period = 1000 / (refreshHz > 0 ? refreshHz : 60)
  const hist = [0, 0, 0, 0]
  for (const f of frames) {
    const k = Math.max(1, Math.round(f.total / period))
    hist[Math.min(3, k - 1)]!++
  }

  return {
    samples: frames.length,
    warming: performance.now() < warmUntil,
    total,
    update,
    render,
    rest,
    jitter,
    // 平均帧时的倒数才等于每秒实际交付帧数；中位数的倒数在双峰分布下会严重虚高
    fps: total.mean > 0 ? 1000 / total.mean : 0,
    fpsMedian: total.p50 > 0 ? 1000 / total.p50 : 0,
    fpsLow1: total.p99 > 0 ? 1000 / total.p99 : 0,
    buckets: frames.length > 0 ? hist.map((c) => c / frames.length) : hist,
    drawCount,
  }
}

/** 最近 N 帧的总时长序列（面板画帧时曲线用，新→旧） */
export function recentFrameTimes(n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < Math.min(n, filled); i++) {
    const f = buf[(head - 1 - i + CAPACITY * 2) % CAPACITY]
    if (f) out.push(f.total)
  }
  return out
}
