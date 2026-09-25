import Phaser from 'phaser'
import { COLOR } from './draw'

export interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

const TAP_SLOP = 12

/** 用子相机裁剪的滚动区：内容只由子相机渲染与命中，越出视口即不可见不可点 */
export class ScrollRegion {
  readonly content: Phaser.GameObjects.Container

  private rect: Rect
  private scroll = 0
  private max = 0
  private contentHeight = 0
  private readonly bar: Phaser.GameObjects.Graphics
  private dragging = false
  private moved = false
  private dragStartY = 0
  private dragStartScroll = 0

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly cam: Phaser.Cameras.Scene2D.Camera,
    rect: Rect,
    depth: number,
  ) {
    this.rect = rect
    this.content = scene.add.container(rect.x, rect.y).setDepth(depth)
    scene.cameras.main.ignore(this.content)
    this.bar = scene.add.graphics().setDepth(depth)
    cam.ignore(this.bar)
    cam.setVisible(true)
    cam.inputEnabled = true
    this.applyRect()
    scene.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this)
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this)
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this)
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this)
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this)
  }

  get wasDragged(): boolean {
    return this.moved
  }

  get viewport(): Rect {
    return this.rect
  }

  get offset(): number {
    return this.scroll
  }

  add(objs: readonly Phaser.GameObjects.GameObject[]): void {
    this.content.add([...objs])
  }

  clear(): void {
    this.content.removeAll(true)
    this.contentHeight = 0
    this.max = 0
    this.setScroll(0)
  }

  setContentHeight(h: number): void {
    this.contentHeight = Math.max(0, h)
    this.max = Math.max(0, this.contentHeight - this.rect.h)
    this.setScroll(this.scroll)
  }

  scrollTo(y: number): void {
    this.setScroll(y)
  }

  setRect(rect: Rect): void {
    this.rect = rect
    this.content.x = rect.x
    this.applyRect()
    this.max = Math.max(0, this.contentHeight - rect.h)
    this.setScroll(this.scroll)
  }

  destroy(): void {
    const input = this.scene.input
    input.off(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this)
    input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this)
    input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this)
    input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this)
    input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this)
    this.content.destroy()
    this.bar.destroy()
    this.cam.setVisible(false)
    this.cam.inputEnabled = false
  }

  /** 子相机的画布视口与缩放须与主相机一致，内容才与外框对齐 */
  private applyRect(): void {
    const main = this.scene.cameras.main
    const r = this.rect
    const ox = main.width * main.originX
    const oy = main.height * main.originY
    const vx = Math.round(main.x + ox + (r.x - main.scrollX - ox) * main.zoomX)
    const vy = Math.round(main.y + oy + (r.y - main.scrollY - oy) * main.zoomY)
    const vw = Math.max(1, Math.round(r.w * main.zoomX))
    const vh = Math.max(1, Math.round(r.h * main.zoomY))
    this.cam.setViewport(vx, vy, vw, vh)
    this.cam.setZoom(main.zoomX, main.zoomY)
    const cx = (vx + vw / 2 - main.x - ox) / main.zoomX + main.scrollX + ox
    const cy = (vy + vh / 2 - main.y - oy) / main.zoomY + main.scrollY + oy
    this.cam.centerOn(cx, cy)
  }

  private worldPoint(p: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return this.scene.cameras.main.getWorldPoint(p.x, p.y)
  }

  private contains(w: { x: number; y: number }): boolean {
    const r = this.rect
    return w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h
  }

  private onWheel(p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    if (this.contains(this.worldPoint(p))) this.setScroll(this.scroll + dy * 0.6)
  }

  private onDown(p: Phaser.Input.Pointer): void {
    this.moved = false
    const w = this.worldPoint(p)
    this.dragging = this.contains(w)
    if (this.dragging) {
      this.dragStartY = w.y
      this.dragStartScroll = this.scroll
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.dragging || !p.isDown) return
    const dy = this.dragStartY - this.worldPoint(p).y
    if (this.max > 0 && Math.abs(dy) > TAP_SLOP) this.moved = true
    if (this.moved) this.setScroll(this.dragStartScroll + dy)
  }

  private onUp(): void {
    this.dragging = false
  }

  private setScroll(y: number): void {
    this.scroll = Math.max(0, Math.min(this.max, y))
    this.content.y = this.rect.y - this.scroll
    this.drawBar()
  }

  private drawBar(): void {
    const g = this.bar
    g.clear()
    if (this.max <= 0) return
    const r = this.rect
    const h = Math.max(24, (r.h / this.contentHeight) * r.h)
    const y = r.y + (this.scroll / this.max) * (r.h - h)
    g.fillStyle(COLOR.line, 0.22)
    g.fillRoundedRect(r.x + r.w - 5, y, 4, h, 2)
  }
}
