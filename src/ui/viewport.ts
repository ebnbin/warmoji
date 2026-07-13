import Phaser from 'phaser'
import { computeViewport } from '../core/viewport'
import type { ViewportSpec } from '../core/viewport'

export const VIEWPORT_CHANGED = 'viewport-changed'

/** 画布 CSS 尺寸取 #game 容器实测矩形（html 高度为 100dvh）：
 * iOS 独立 PWA 下 window.innerHeight 不含 Home 条区域，不能作为全屏依据 */
function cssSize(): { w: number; h: number } {
  const rect = document.getElementById('game')?.getBoundingClientRect()
  return {
    w: rect?.width || window.innerWidth,
    h: rect?.height || window.innerHeight,
  }
}

const initial = cssSize()
export let viewport: ViewportSpec = computeViewport(
  initial.w,
  initial.h,
  window.devicePixelRatio,
)

export interface SafeInsets {
  top: number
  right: number
  bottom: number
  left: number
}

/** 刘海/状态栏/Home 条的安全区侵入（逻辑 px）：全屏贴边的 UI 须以此偏移 */
export let safeInsets: SafeInsets = readSafeInsets(viewport.fitScale)

function readSafeInsets(fitScale: number): SafeInsets {
  const style = getComputedStyle(document.documentElement)
  const px = (name: string): number => parseFloat(style.getPropertyValue(name)) || 0
  return {
    top: px('--safe-top') / fitScale,
    right: px('--safe-right') / fitScale,
    bottom: px('--safe-bottom') / fitScale,
    left: px('--safe-left') / fitScale,
  }
}

/** 文本栅格化密度跟随渲染缩放（含 DPR），避免放大发糊 */
export function textRes(): number {
  return Math.max(1, viewport.renderScale)
}

export function applyCamera(scene: Phaser.Scene): void {
  const cam = scene.cameras.main
  cam.setZoom(viewport.renderScale)
  cam.centerOn(viewport.logicalWidth / 2, viewport.logicalHeight / 2)
}

/**
 * canvas 物理像素 = CSS × DPR，CSS 尺寸手动钉在 #game 实测矩形；
 * 高分屏上 1 canvas 像素 = 1 设备像素，浏览器不再做拉伸重采样。
 * 无实际变化时跳过（iOS 视口异步稳定需要多次复查，不能每次都重启场景）。
 */
export function refreshViewport(game: Phaser.Game, force = false): void {
  const css = cssSize()
  const next = computeViewport(css.w, css.h, window.devicePixelRatio)
  const nextInsets = readSafeInsets(next.fitScale)
  const same =
    Math.abs(next.cssWidth - viewport.cssWidth) < 0.5 &&
    Math.abs(next.cssHeight - viewport.cssHeight) < 0.5 &&
    next.dpr === viewport.dpr &&
    Math.abs(nextInsets.top - safeInsets.top) < 0.5 &&
    Math.abs(nextInsets.right - safeInsets.right) < 0.5 &&
    Math.abs(nextInsets.bottom - safeInsets.bottom) < 0.5 &&
    Math.abs(nextInsets.left - safeInsets.left) < 0.5
  if (same && !force) return
  viewport = next
  safeInsets = nextInsets
  game.scale.resize(
    Math.round(viewport.cssWidth * viewport.dpr),
    Math.round(viewport.cssHeight * viewport.dpr),
  )
  game.scale.setZoom(1 / viewport.dpr)
  game.canvas.style.width = `${viewport.cssWidth}px`
  game.canvas.style.height = `${viewport.cssHeight}px`
  game.events.emit(VIEWPORT_CHANGED)
}
