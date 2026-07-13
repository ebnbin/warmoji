import Phaser from 'phaser'
import { computeViewport } from '../core/viewport'
import type { ViewportSpec } from '../core/viewport'

export const VIEWPORT_CHANGED = 'viewport-changed'

export let viewport: ViewportSpec = computeViewport(window.innerWidth, window.innerHeight)

/** 文本栅格化密度跟随缩放，避免相机放大后发糊 */
export function textRes(): number {
  return Math.max(1, viewport.fitScale)
}

export function applyCamera(scene: Phaser.Scene): void {
  const cam = scene.cameras.main
  cam.setZoom(viewport.fitScale)
  cam.centerOn(viewport.logicalWidth / 2, viewport.logicalHeight / 2)
}

export function refreshViewport(game: Phaser.Game): void {
  viewport = computeViewport(game.scale.width, game.scale.height)
  game.events.emit(VIEWPORT_CHANGED)
}
