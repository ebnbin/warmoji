import Phaser from 'phaser'
import { computeViewport } from '../core/viewport'
import type { ViewportSpec } from '../core/viewport'

export const VIEWPORT_CHANGED = 'viewport-changed'

export let viewport: ViewportSpec = computeViewport(
  window.innerWidth,
  window.innerHeight,
  window.devicePixelRatio,
)

export interface SafeInsets {
  top: number
  right: number
  bottom: number
  left: number
}

/** 刘海/状态栏/Home 条的安全区侵入（逻辑 px）：全屏贴边的 UI 须以此偏移 */
export let safeInsets: SafeInsets = readSafeInsets()

function readSafeInsets(): SafeInsets {
  const style = getComputedStyle(document.documentElement)
  const px = (name: string): number => parseFloat(style.getPropertyValue(name)) || 0
  const s = viewport.fitScale
  return {
    top: px('--safe-top') / s,
    right: px('--safe-right') / s,
    bottom: px('--safe-bottom') / s,
    left: px('--safe-left') / s,
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
 * canvas 物理像素 = CSS × DPR，CSS 尺寸手动钉在窗口大小；
 * 高分屏上 1 canvas 像素 = 1 设备像素，浏览器不再做拉伸重采样。
 */
export function refreshViewport(game: Phaser.Game): void {
  viewport = computeViewport(window.innerWidth, window.innerHeight, window.devicePixelRatio)
  safeInsets = readSafeInsets()
  game.scale.resize(
    Math.round(viewport.cssWidth * viewport.dpr),
    Math.round(viewport.cssHeight * viewport.dpr),
  )
  game.scale.setZoom(1 / viewport.dpr)
  game.canvas.style.width = `${viewport.cssWidth}px`
  game.canvas.style.height = `${viewport.cssHeight}px`
  game.events.emit(VIEWPORT_CHANGED)
}
