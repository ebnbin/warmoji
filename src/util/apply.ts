import Phaser from 'phaser'
import { computeViewport } from './viewport'
import type { Viewport } from './viewport'

export const VIEWPORT_CHANGED = 'viewport-changed'

export function isStandalone(): boolean {
  return (navigator as unknown as { standalone?: boolean }).standalone === true
}

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

export function textRes(): number {
  return Math.max(1, viewport.renderScale)
}

export function applyCamera(scene: Phaser.Scene): void {
  const cam = scene.cameras.main
  cam.setZoom(viewport.renderScale)
  cam.centerOn(viewport.logicalWidth / 2, viewport.logicalHeight / 2)
}

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
