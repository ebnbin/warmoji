import Phaser from 'phaser'

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

export function rendererInfo(game: Phaser.Game): string {
  if (!rendererCache) {
    if (game.renderer.type === Phaser.WEBGL) {
      const gl = (game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      const raw = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
      rendererCache = `WebGL · ${shortGpu(raw)}`
    } else {
      rendererCache = 'Canvas'
    }
  }
  return rendererCache
}

function shortGpu(raw: string): string {
  if (raw === '') return '未知 GPU'
  if (/swiftshader|llvmpipe|software/i.test(raw)) return 'SwiftShader 软件渲染 · 时间读数不可用'
  const m = /Renderer:\s*([^,()]+)/.exec(raw) ?? /^ANGLE \([^,]+,\s*([^,()]+)/.exec(raw)
  return (m?.[1] ?? raw).trim().slice(0, 48)
}

export function heapMB(): number | undefined {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
  return m ? Math.round(m.usedJSHeapSize / 1048576) : undefined
}
