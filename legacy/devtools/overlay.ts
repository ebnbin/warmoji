import type Phaser from 'phaser'

/** 覆盖层的坐标以 CSS 像素计，原点在画布左上角 */
export interface OverlayCtx {
  readonly game: Phaser.Game
  /** 业务 scene 主相机下的世界坐标 → 覆盖层坐标 */
  toLocal(scene: Phaser.Scene, x: number, y: number, sfx?: number, sfy?: number): { x: number; y: number }
  /** 画布像素 → 覆盖层坐标 */
  canvasToLocal(px: number, py: number): { x: number; y: number }
}

/** 每帧在清空过的画笔上重画一遍 */
export type OverlayPainter = (g: Phaser.GameObjects.Graphics, ctx: OverlayCtx) => void

const painters = new Set<OverlayPainter>()

export function addOverlayPainter(p: OverlayPainter): () => void {
  painters.add(p)
  return () => {
    painters.delete(p)
  }
}

export function paintOverlays(g: Phaser.GameObjects.Graphics, ctx: OverlayCtx): void {
  for (const p of painters) p(g, ctx)
}

type Cam = Phaser.Cameras.Scene2D.Camera

/** 不考虑相机旋转 */
export function worldToCanvas(cam: Cam, wx: number, wy: number, sfx = 1, sfy = 1): { x: number; y: number } {
  const ox = cam.width * cam.originX
  const oy = cam.height * cam.originY
  return {
    x: cam.x + ox + (wx - cam.scrollX * sfx - ox) * cam.zoomX,
    y: cam.y + oy + (wy - cam.scrollY * sfy - oy) * cam.zoomY,
  }
}

export function canvasToWorld(cam: Cam, px: number, py: number, sfx = 1, sfy = 1): { x: number; y: number } {
  const ox = cam.width * cam.originX
  const oy = cam.height * cam.originY
  return {
    x: (px - cam.x - ox) / cam.zoomX + cam.scrollX * sfx + ox,
    y: (py - cam.y - oy) / cam.zoomY + cam.scrollY * sfy + oy,
  }
}
