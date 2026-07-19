import Phaser from 'phaser'
import { computeViewport } from './viewport'
import type { Viewport } from './viewport'

export const VIEWPORT_CHANGED = 'viewport-changed'

/** iOS 从主屏幕启动的独立 PWA（navigator.standalone 为 Safari 私有属性） */
export function isStandalone(): boolean {
  return (navigator as unknown as { standalone?: boolean }).standalone === true
}

/** iOS PWA 冷启动/旋转后内容层可能钉在扣掉 Home 条的错误视口上（已知 WebKit bug，
 * 物理旋转才修正）。短暂把 viewport-fit 切成 auto 再切回 cover，隔帧生效，
 * 强制 WebKit 做等效旋转的视口重算；完成后回调方重新量尺寸 */
export function nudgeIosViewport(onDone: () => void): void {
  if (!isStandalone()) return
  const meta = document.querySelector('meta[name="viewport"]')
  const original = meta?.getAttribute('content')
  if (!meta || !original || !original.includes('viewport-fit=cover')) return
  meta.setAttribute('content', original.replace('viewport-fit=cover', 'viewport-fit=auto'))
  requestAnimationFrame(() => {
    meta.setAttribute('content', original)
    requestAnimationFrame(onDone)
  })
}

/** 画布 CSS 尺寸。
 * 独立 PWA 恒为全屏，但 iOS 竖屏首次布局会把 Home 条区域从视口里扣掉且不再更新
 * （innerHeight/dvh 全是错的，事件也不补发），故直接取屏幕物理尺寸按方向映射；
 * 浏览器模式取 #game 实测矩形（html 高度 100dvh） */
function cssSize(): { w: number; h: number } {
  if (isStandalone()) {
    const short = Math.min(screen.width, screen.height)
    const long = Math.max(screen.width, screen.height)
    const landscape = window.matchMedia('(orientation: landscape)').matches
    return landscape ? { w: long, h: short } : { w: short, h: long }
  }
  const rect = document.getElementById('game')?.getBoundingClientRect()
  return {
    w: rect?.width || window.innerWidth,
    h: rect?.height || window.innerHeight,
  }
}

const initial = cssSize()
export let viewport: Viewport = computeViewport(
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
