import Phaser from 'phaser'
import { computeViewport } from './viewport'
import type { Viewport } from './viewport'

export const VIEWPORT_CHANGED = 'viewport-changed'

export function isStandalone(): boolean {
  return navigator.standalone === true
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

export interface Size {
  readonly w: number
  readonly h: number
}

function windowSize(): Size {
  if (isStandalone()) {
    const short = Math.min(screen.width, screen.height)
    const long = Math.max(screen.width, screen.height)
    const landscape = window.matchMedia('(orientation: landscape)').matches
    return landscape ? { w: long, h: short } : { w: short, h: long }
  }
  const rect = document.body.getBoundingClientRect()
  return {
    w: rect.width || window.innerWidth,
    h: rect.height || window.innerHeight,
  }
}

/** 窗口里留给游戏的一块，贴着左上角：开发面板停靠时从右边或下边让出地方 */
let carve = (win: Size): Size => win

export function setGameArea(fn: (win: Size) => Size): void {
  carve = fn
}

const initialWin = windowSize()
const initial = carve(initialWin)
export let viewport: Viewport = computeViewport(
  initial.w,
  initial.h,
  window.devicePixelRatio,
)

interface SafeInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export let safeInsets: SafeInsets = readSafeInsets(viewport.fitScale, initial, initialWin)

/** 游戏区没贴到窗口的那一边不算刘海与导航条 */
function readSafeInsets(fitScale: number, area: Size, win: Size): SafeInsets {
  const style = getComputedStyle(document.documentElement)
  const px = (side: keyof SafeInsets): number => parseFloat(style.getPropertyValue(`--safe-${side}`)) || 0
  return {
    top: px('top') / fitScale,
    right: area.w < win.w ? 0 : px('right') / fitScale,
    bottom: area.h < win.h ? 0 : px('bottom') / fitScale,
    left: px('left') / fitScale,
  }
}

function placeGame(area: Size): void {
  const el = document.getElementById('game')
  if (!el) return
  el.style.width = `${area.w}px`
  el.style.height = `${area.h}px`
}

export function textRes(): number {
  return Math.max(1, viewport.renderScale)
}

export function applyCamera(scene: Phaser.Scene): void {
  const cam = scene.cameras.main
  cam.setZoom(viewport.renderScale)
  cam.centerOn(viewport.logicalWidth / 2, viewport.logicalHeight / 2)
}

/** 无实际变化时须跳过：iOS 视口异步稳定需要多次复查，不能每次都重启场景 */
export function refreshViewport(game: Phaser.Game, force = false): void {
  const win = windowSize()
  const area = carve(win)
  placeGame(area)
  const next = computeViewport(area.w, area.h, window.devicePixelRatio)
  const nextInsets = readSafeInsets(next.fitScale, area, win)
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
