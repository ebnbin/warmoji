import Phaser from 'phaser'

// dev 面板的环境诊断：原生 rAF 频率计 / 渲染器信息 / JS 堆内存

let rafStarted = false
let rafPeakHz = 0
let rafFrames = 0
let rafWindowStart = 0

/** 显示器刷新率的实测上限。
 *
 * 取**全程峰值**而非当前值：rAF 的触发频率不会超过屏幕刷新率，但主线程一被占满
 * 它自己就被拖慢——重载下的瞬时值只是又一个 fps 读数，不是屏幕能力
 *（实测 8 千档读到 19Hz / 31Hz，而机器是 60Hz 起步的屏幕）。
 * 峰值则在菜单/配置页这种空闲时段自然打到真实刷新率并留住，才是想要的参考基准。 */
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

/** 实测到的屏幕刷新率上限（Hz）；不足 1 秒尚无读数时返回 0 */
export function rafHz(): number {
  return rafPeakHz
}

let rendererCache: string | undefined

/** 渲染后端 + GPU 型号，**压成一行**。
 *
 * 原始 UNMASKED_RENDERER 串又长又全是噪声，在面板里要占两行
 *（`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`），
 * 真正要看的只有两件事：是不是软件渲染、什么型号。软件渲染直接标红字义——
 * 那种环境下面板里所有时间读数都不可用（见 dev/metrics.ts 顶部）。 */
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
  // `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)` → `Apple M4 Pro`
  const m = /Renderer:\s*([^,()]+)/.exec(raw) ?? /^ANGLE \([^,]+,\s*([^,()]+)/.exec(raw)
  return (m?.[1] ?? raw).trim().slice(0, 48)
}

/** Chrome 系独有的 JS 堆用量（MB）；其他浏览器返回 undefined */
export function heapMB(): number | undefined {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
  return m ? Math.round(m.usedJSHeapSize / 1048576) : undefined
}
