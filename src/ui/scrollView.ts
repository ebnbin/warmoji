import Phaser from 'phaser'
import { clipTo, markDirty } from '../util/mask'
import { TAP_SLOP } from '../util/units'
import { markDragged, pressedOn, setClip } from './gesture'
import type { Rect } from './gesture'
import { INK } from './theme'

export type Axis = 'x' | 'y'

export interface ScrollOptions {
  readonly axis?: Axis
  readonly scrollbar?: boolean
  readonly initial?: number
  readonly onScroll?: (pos: number) => void
}

/** 惯性滑动的衰减时间常数（毫秒） */
const FLING_DECAY = 320
/** 惯性速度（像素每毫秒）高于它时，按下只是刹停，不算点按 */
const FLING_CATCH = 0.35

/** 滚动区：content 放在 rect 里，超出部分裁掉；拖动、滚轮、惯性都在这里 */
export class ScrollView {
  readonly content: Phaser.GameObjects.Container

  private readonly scene: Phaser.Scene
  private readonly axis: Axis
  private readonly onScroll?: (pos: number) => void
  private rect: Rect
  private pos: number
  private max = 0
  private extent = 0
  private readonly maskGfx: Phaser.GameObjects.Graphics
  private readonly mask?: Phaser.Filters.Mask
  private readonly bar?: Phaser.GameObjects.Graphics
  private dragId: number | null = null
  private dragFrom = 0
  private dragBase = 0
  private moved = false
  private velocity = 0
  private lastAt = 0
  private lastCoord = 0

  constructor(scene: Phaser.Scene, rect: Rect, opts: ScrollOptions = {}) {
    this.scene = scene
    this.rect = rect
    this.axis = opts.axis ?? 'y'
    this.onScroll = opts.onScroll
    this.pos = opts.initial ?? 0
    this.content = scene.add.container(rect.x, rect.y)
    this.maskGfx = scene.add.graphics().setVisible(false)
    this.mask = clipTo(this.content, this.maskGfx)
    if (opts.scrollbar !== false) this.bar = scene.add.graphics()
    this.applyRect()
    const input = scene.input
    input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this)
    input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this)
    input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this)
    input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this)
    input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this)
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.detach, this)
  }

  get scroll(): number {
    return this.pos
  }

  get viewport(): Rect {
    return this.rect
  }

  add(obj: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]): this {
    this.content.add(obj)
    return this
  }

  clear(): this {
    this.content.removeAll(true)
    this.extent = 0
    this.max = 0
    this.velocity = 0
    this.setPos(0)
    return this
  }

  /** 内容沿滚动方向的总长 */
  setContentSize(size: number): this {
    this.extent = Math.max(0, size)
    this.max = Math.max(0, this.extent - this.span())
    this.setPos(this.pos)
    return this
  }

  scrollTo(pos: number): this {
    this.velocity = 0
    this.setPos(pos)
    return this
  }

  /** 让 [start, start + len) 这一段露出来 */
  reveal(start: number, len: number): this {
    if (start < this.pos) return this.scrollTo(start)
    if (start + len > this.pos + this.span()) return this.scrollTo(start + len - this.span())
    return this
  }

  setViewport(rect: Rect): this {
    this.rect = rect
    this.applyRect()
    return this
  }

  setDepth(depth: number): this {
    this.content.setDepth(depth)
    this.bar?.setDepth(depth)
    return this
  }

  /** 连同输入监听一起撤掉：随开随关的面板每次都新建 */
  destroy(): void {
    this.detach()
    this.content.destroy()
    this.maskGfx.destroy()
    this.bar?.destroy()
  }

  private detach(): void {
    const input = this.scene.input
    input.off(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this)
    input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this)
    input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this)
    input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this)
    input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this)
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this)
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.detach, this)
  }

  private span(): number {
    return this.axis === 'y' ? this.rect.h : this.rect.w
  }

  private coord(p: Phaser.Input.Pointer): number {
    return this.axis === 'y' ? p.worldY : p.worldX
  }

  private applyRect(): void {
    const { x, y, w, h } = this.rect
    this.maskGfx.clear().fillStyle(0xffffff, 1).fillRect(x, y, w, h)
    markDirty(this.mask)
    setClip(this.content, this.rect)
    this.max = Math.max(0, this.extent - this.span())
    this.setPos(this.pos)
  }

  private contains(p: Phaser.Input.Pointer): boolean {
    const r = this.rect
    return p.worldX >= r.x && p.worldX <= r.x + r.w && p.worldY >= r.y && p.worldY <= r.y + r.h
  }

  private onWheel(p: Phaser.Input.Pointer, _over: unknown, dx: number, dy: number): void {
    if (this.max <= 0 || !this.contains(p) || !pressedOn(this.scene, p, this.content)) return
    const d = this.axis === 'y' ? dy : Math.abs(dx) > Math.abs(dy) ? dx : dy
    this.scrollTo(this.pos + d * 0.6)
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.dragId !== null || !this.contains(p) || !pressedOn(this.scene, p, this.content)) return
    if (Math.abs(this.velocity) >= FLING_CATCH) markDragged(this.scene, p)
    this.velocity = 0
    this.dragId = p.id
    this.moved = false
    this.dragFrom = this.lastCoord = this.coord(p)
    this.dragBase = this.pos
    this.lastAt = this.scene.time.now
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.dragId || !p.isDown) return
    const c = this.coord(p)
    if (!this.moved) {
      if (this.max <= 0 || Math.abs(c - this.dragFrom) <= TAP_SLOP) return
      this.moved = true
      markDragged(this.scene, p)
      this.dragFrom = c
      this.dragBase = this.pos
    }
    this.setPos(this.dragBase + this.dragFrom - c)
    const now = this.scene.time.now
    const dt = Math.max(1, now - this.lastAt)
    this.velocity = 0.5 * this.velocity + (0.5 * (this.lastCoord - c)) / dt
    this.lastCoord = c
    this.lastAt = now
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.dragId) return
    this.dragId = null
    if (!this.moved || this.scene.time.now - this.lastAt > 80) this.velocity = 0
  }

  private onUpdate(_time: number, delta: number): void {
    if (this.dragId !== null || this.velocity === 0) return
    const next = this.pos + this.velocity * delta
    this.setPos(next)
    this.velocity *= Math.exp(-delta / FLING_DECAY)
    if (Math.abs(this.velocity) < 0.03 || next <= 0 || next >= this.max) this.velocity = 0
  }

  private setPos(pos: number): void {
    this.pos = Math.max(0, Math.min(this.max, pos))
    if (this.axis === 'y') this.content.setPosition(this.rect.x, this.rect.y - this.pos)
    else this.content.setPosition(this.rect.x - this.pos, this.rect.y)
    this.drawBar()
    this.onScroll?.(this.pos)
  }

  private drawBar(): void {
    const bar = this.bar
    if (!bar) return
    bar.clear()
    if (this.max <= 0) return
    const span = this.span()
    const len = Math.max(28, (span / this.extent) * span)
    const at = (this.pos / this.max) * (span - len)
    const { x, y, w, h } = this.rect
    bar.fillStyle(INK.muted, 0.5)
    if (this.axis === 'y') bar.fillRoundedRect(x + w - 7, y + at, 5, len, 2.5)
    else bar.fillRoundedRect(x + at, y + h - 7, len, 5, 2.5)
  }
}
