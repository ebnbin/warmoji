import Phaser from 'phaser'

// dev 面板的环境诊断：原生 rAF 频率计 / 渲染器信息 / JS 堆内存

let rafStarted = false
let rafHzValue = 0
let rafFrames = 0
let rafWindowStart = 0

/** 独立于 Phaser 循环的原生 rAF 频率计：区分帧率锁在浏览器还是引擎 */
export function startRafMeter(): void {
  if (rafStarted) return
  rafStarted = true
  rafWindowStart = performance.now()
  const tick = (now: number): void => {
    rafFrames++
    if (now - rafWindowStart >= 1000) {
      rafHzValue = Math.round((rafFrames * 1000) / (now - rafWindowStart))
      rafFrames = 0
      rafWindowStart = now
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** 最近 1 秒的实测 rAF 频率；未满 1 秒返回 0 */
export function rafHz(): number {
  return rafHzValue
}

let rendererCache: string | undefined

/** 渲染后端 + GPU 型号（用于识别 SwiftShader 等软件渲染） */
export function rendererInfo(game: Phaser.Game): string {
  if (!rendererCache) {
    if (game.renderer.type === Phaser.WEBGL) {
      const gl = (game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '未知 GPU'
      rendererCache = `WebGL · ${gpu}`
    } else {
      rendererCache = 'Canvas'
    }
  }
  return rendererCache
}

/** Chrome 系独有的 JS 堆用量（MB）；其他浏览器返回 undefined */
export function heapMB(): number | undefined {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
  return m ? Math.round(m.usedJSHeapSize / 1048576) : undefined
}
