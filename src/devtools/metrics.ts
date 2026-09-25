import Phaser from 'phaser'

interface Frame {
  total: number
  update: number
  render: number
  rest: number
  jitter: number
  seq: number
}

const CAPACITY = 1800
const WARMUP_MS = 800

const buf: Frame[] = []
let head = 0
let filled = 0
let warmUntil = 0
let markSeq = 0

let attached: Phaser.Game | undefined
let stepStart = 0
let renderStart = 0
let lastUpdate = 0
let lastRender = 0
let pending = false
let prevTotal = 0
let nextSeq = 0
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
  drawCount = g.renderer instanceof Phaser.Renderer.Canvas.CanvasRenderer ? g.renderer.drawCount : undefined
  pending = performance.now() >= warmUntil
}

function record(total: number): void {
  const f: Frame = {
    total,
    update: lastUpdate,
    render: lastRender,
    rest: Math.max(0, total - lastUpdate - lastRender),
    jitter: prevTotal > 0 ? Math.abs(total - prevTotal) : 0,
    seq: nextSeq++,
  }
  prevTotal = total
  buf[head] = f
  head = (head + 1) % CAPACITY
  if (filled < CAPACITY) filled++
}

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

export function resetMetrics(): void {
  buf.length = 0
  head = 0
  filled = 0
  prevTotal = 0
  pending = false
  markSeq = nextSeq
  warmUntil = performance.now() + WARMUP_MS
}

/** 统计从下一帧起算，此前的样本只留在曲线里 */
export function markMetrics(): void {
  markSeq = nextSeq
}

export function metricsMarkSeq(): number {
  return markSeq
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))
  return sorted[i]!
}

export interface MetricsReport {
  samples: number
  warming: boolean
  total: { p50: number; p95: number; p99: number; max: number }
  update: { p50: number }
  render: { p50: number }
  rest: { p50: number }
  jitter: { p50: number }
  fps: number
  fpsMedian: number
  fpsLow1: number
  buckets: readonly number[]
  drawCount?: number
}

function stat(v: readonly number[]): { mean: number; p50: number; p95: number; p99: number; max: number } {
  if (v.length === 0) return { mean: 0, p50: 0, p95: 0, p99: 0, max: 0 }
  const s = [...v].sort((a, b) => a - b)
  const sum = v.reduce((a, b) => a + b, 0)
  return { mean: sum / v.length, p50: percentile(s, 50), p95: percentile(s, 95), p99: percentile(s, 99), max: s[s.length - 1]! }
}

export function metricsReport(refreshHz = 60): MetricsReport {
  const frames = buf.slice(0, filled).filter((f) => f.seq >= markSeq)
  const total = stat(frames.map((f) => f.total))
  const update = stat(frames.map((f) => f.update))
  const render = stat(frames.map((f) => f.render))
  const rest = stat(frames.map((f) => f.rest))
  const jitter = stat(frames.map((f) => f.jitter))

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

export function recentFrames(n: number): { total: number; seq: number }[] {
  const out: { total: number; seq: number }[] = []
  for (let i = 0; i < Math.min(n, filled); i++) {
    const f = buf[(head - 1 - i + CAPACITY * 2) % CAPACITY]
    if (f) out.push(f)
  }
  return out
}

let rafStarted = false
let rafPeakHz = 0
let rafFrames = 0
let rafWindowStart = 0

export function startRafMeter(): void {
  if (rafStarted) return
  rafStarted = true
  rafWindowStart = performance.now()
  const tick = (now: number): void => {
    rafFrames++
    const span = now - rafWindowStart
    if (span >= 1000) {
      rafPeakHz = Math.max(rafPeakHz, Math.round((rafFrames * 1000) / span))
      rafFrames = 0
      rafWindowStart = now
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

export function rafHz(): number {
  return rafPeakHz
}

let rendererCache: string | undefined

function shortGpu(raw: string): string {
  if (raw === '') return '未知 GPU'
  if (/swiftshader|llvmpipe|software/i.test(raw)) return 'SwiftShader 软件渲染 · 时间读数不可用'
  const m = /Renderer:\s*([^,()]+)/.exec(raw) ?? /^ANGLE \([^,]+,\s*([^,()]+)/.exec(raw)
  return (m?.[1] ?? raw).trim().slice(0, 48)
}

export function rendererInfo(game: Phaser.Game): string {
  if (!rendererCache) {
    if (game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      const gl = game.renderer.gl
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      const raw = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
      rendererCache = `WebGL · ${shortGpu(raw)}`
    } else {
      rendererCache = 'Canvas'
    }
  }
  return rendererCache
}

export function heapMB(): number | undefined {
  const m = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  return m ? Math.round(m.usedJSHeapSize / 1048576) : undefined
}
