import Phaser from 'phaser'

// 帧时取 loop.rawDelta：loop.delta 经 TimeStep 平滑，且超过 200ms 会被历史值顶替，不能用于测量。
// rawDelta 在本帧 PRE_STEP 前写好，是上一帧起点到本帧起点，故上一帧到下一帧 PRE_STEP 才结算

interface Frame {
  /** 本帧起点到下一帧起点，含 vsync 等待 */
  total: number
  update: number
  render: number
  /** total − update − render，即帧外时间；须逐帧算好再统计，中位数不可加 */
  rest: number
  /** 与上一帧的时长差（绝对值） */
  jitter: number
  /** 入账序号，跨 reset 单调递增 */
  seq: number
}

const CAPACITY = 1800 // 约 30 秒 @60fps
/** ms；按时间而非帧数：重载下可能只有几 fps */
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
/** 上一帧的分项已测完、等下一帧起点结算 */
let pending = false
let prevTotal = 0
let nextSeq = 0
/** Canvas 渲染器才有；取不到就是 undefined，不填 0 */
let drawCount: number | undefined

function onPreStep(): void {
  const g = attached
  if (pending && g) record(g.loop.rawDelta)
  pending = false
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
  const r = g.renderer as unknown as { drawCount?: number }
  drawCount = typeof r.drawCount === 'number' ? r.drawCount : undefined
  pending = performance.now() >= warmUntil
}

function record(total: number): void {
  const f: Frame = {
    total, update: lastUpdate, render: lastRender,
    rest: Math.max(0, total - lastUpdate - lastRender),
    jitter: prevTotal > 0 ? Math.abs(total - prevTotal) : 0,
    seq: nextSeq++,
  }
  prevTotal = total
  buf[head] = f
  head = (head + 1) % CAPACITY
  if (filled < CAPACITY) filled++
}

/** 幂等 */
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
  pending = false
}

/** 切换负载后调用 */
export function resetMetrics(): void {
  buf.length = 0
  head = 0
  filled = 0
  prevTotal = 0
  pending = false
  warmUntil = performance.now() + WARMUP_MS
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))
  return sorted[i]!
}

export interface MetricsReport {
  /** 预热后 */
  samples: number
  /** 为真时读数不可信 */
  warming: boolean
  /** ms */
  total: { p50: number; p95: number; p99: number; max: number }
  /** ms */
  update: { p50: number }
  /** ms */
  render: { p50: number }
  /** ms */
  rest: { p50: number }
  /** ms */
  jitter: { p50: number }
  /** 1000 / 平均帧时 */
  fps: number
  /** 1000 / 中位帧时；vsync 量化下双峰分布会整个跳档，不能当帧率用 */
  fpsMedian: number
  /** 最慢 1% 帧对应的 FPS */
  fpsLow1: number
  /** 落在 1 / 2 / 3 / ≥4 个刷新周期内的帧数占比，0–1 */
  buckets: readonly number[]
  /** WebGL 渲染器不提供，为 undefined */
  drawCount?: number
}

function stat(v: readonly number[]): { mean: number; p50: number; p95: number; p99: number; max: number } {
  if (v.length === 0) return { mean: 0, p50: 0, p95: 0, p99: 0, max: 0 }
  const s = [...v].sort((a, b) => a - b)
  const sum = v.reduce((a, b) => a + b, 0)
  return { mean: sum / v.length, p50: percentile(s, 50), p95: percentile(s, 95), p99: percentile(s, 99), max: s[s.length - 1]! }
}

/** 下一帧入账时的序号 */
export function nextFrameSeq(): number {
  return nextSeq
}

/** refreshHz 测不到时按 60 算；只统计序号 ≥ fromSeq 的帧 */
export function metricsReport(refreshHz = 60, fromSeq = 0): MetricsReport {
  const frames = buf.slice(0, filled).filter((f) => f.seq >= fromSeq)
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
    fps: total.mean > 0 ? 1000 / total.mean : 0,
    fpsMedian: total.p50 > 0 ? 1000 / total.p50 : 0,
    fpsLow1: total.p99 > 0 ? 1000 / total.p99 : 0,
    buckets: frames.length > 0 ? hist.map((c) => c / frames.length) : hist,
    drawCount,
  }
}

/** 新→旧 */
export function recentFrames(n: number): { total: number; seq: number }[] {
  const out: { total: number; seq: number }[] = []
  for (let i = 0; i < Math.min(n, filled); i++) {
    const f = buf[(head - 1 - i + CAPACITY * 2) % CAPACITY]
    if (f) out.push(f)
  }
  return out
}
