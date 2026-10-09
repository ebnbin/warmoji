import Phaser from 'phaser'
import { playSfx } from '../audio/sfx'
import { emojiThumbKey, requestEmojiThumb } from '../emoji/thumbs'
import { clipTo } from '../util/mask'
import { TAP_SLOP } from '../util/units'
import { markDragged, pressable, pressedOn, setClip } from './gesture'
import type { Rect } from './gesture'
import { Panel } from './panel'
import { SURFACE, TONE } from './theme'
import { Widget } from './widget'

const CELL = 72
const ICON = 66
const FRAME = 10
const FLING_DECAY = 320
const FLING_CATCH = 0.35

interface Slot {
  readonly image: Phaser.GameObjects.Image
  boundIndex: number
}

export interface VirtualGridOptions {
  readonly initialScroll?: number
  /** 每个条目的不透明度，用来压暗未登场的 emoji */
  readonly alphaOf?: (cp: string) => number
}

/** 几千个 emoji 的网格：只为可见的几行建图，滚动时复用 */
export class VirtualEmojiGrid {
  onTap?: (cp: string) => void
  onScrolled?: () => void

  private readonly scene: Phaser.Scene
  private readonly rect: Rect
  private readonly cols: number
  private readonly left: number
  private readonly alphaOf: (cp: string) => number
  private readonly container: Phaser.GameObjects.Container
  private readonly ring: Phaser.GameObjects.Graphics
  private readonly hit: Widget
  private keys: readonly string[] = []
  private slots: Slot[] = []
  private poolSize = 0
  private scroll: number
  private max = 0
  private selected: string | null = null
  private dragId: number | null = null
  private moved = false
  private dragFrom = 0
  private dragBase = 0
  private velocity = 0
  private lastY = 0
  private lastAt = 0

  /** frame 是凹底框的外沿 */
  constructor(scene: Phaser.Scene, frame: Rect, opts: VirtualGridOptions = {}) {
    this.scene = scene
    const rect = { x: frame.x + FRAME, y: frame.y + FRAME, w: frame.w - FRAME * 2, h: frame.h - FRAME * 2 }
    this.rect = rect
    this.cols = Math.max(1, Math.floor(rect.w / CELL))
    this.left = (rect.w - this.cols * CELL) / 2
    this.scroll = opts.initialScroll ?? 0
    this.alphaOf = opts.alphaOf ?? ((): number => 1)

    new Panel(scene, frame.x, frame.y, frame.w, frame.h, { variant: 'well' })
    const mask = scene.add.graphics().setVisible(false)
    mask.fillStyle(0xffffff, 1).fillRect(rect.x, rect.y, rect.w, rect.h)
    this.container = scene.add.container(rect.x, rect.y)
    clipTo(this.container, mask)
    setClip(this.container, rect)
    this.ring = scene.add.graphics()
    this.container.add(this.ring)

    this.hit = new Widget(scene, rect.x, rect.y)
    pressable(this.hit, {
      shape: new Phaser.Geom.Rectangle(0, 0, rect.w, rect.h),
      onTap: (p) => {
        if (p) this.tapAt(p)
      },
      sfx: null,
    })

    const input = scene.input
    input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this)
    input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this)
    input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this)
    input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this)
    input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this)
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this)
    })
  }

  get scrollY(): number {
    return this.scroll
  }

  setItems(keys: readonly string[]): void {
    this.keys = keys
    const rows = Math.ceil(keys.length / this.cols)
    this.max = Math.max(0, rows * CELL - this.rect.h)
    this.poolSize = (Math.ceil(this.rect.h / CELL) + 2) * this.cols
    if (this.slots.length !== this.poolSize) {
      for (const s of this.slots) s.image.destroy()
      this.slots = []
      for (let i = 0; i < this.poolSize; i++) {
        const image = this.scene.add.image(0, 0, '__DEFAULT').setVisible(false)
        this.container.add(image)
        this.slots.push({ image, boundIndex: -1 })
      }
    } else {
      for (const s of this.slots) {
        s.boundIndex = -1
        s.image.setVisible(false)
      }
    }
    this.drawRing()
    this.scrollTo(this.scroll)
  }

  setSelected(cp: string | null): void {
    this.selected = cp
    this.drawRing()
  }

  /** 选中项不在视野里就把它滚到中间 */
  ensureVisible(): void {
    const index = this.selected ? this.keys.indexOf(this.selected) : -1
    if (index < 0) return
    const top = Math.floor(index / this.cols) * CELL
    if (top >= this.scroll && top + CELL <= this.scroll + this.rect.h) return
    this.scrollTo(top - (this.rect.h - CELL) / 2)
  }

  scrollTo(y: number): void {
    this.scroll = Math.max(0, Math.min(this.max, y))
    this.container.y = this.rect.y - this.scroll
    this.updateWindow()
    this.onScrolled?.()
  }

  private tapAt(p: Phaser.Input.Pointer): void {
    const col = Math.floor((p.worldX - this.rect.x - this.left) / CELL)
    const index = Math.floor((p.worldY - this.rect.y + this.scroll) / CELL) * this.cols + col
    const cp = this.keys[index]
    if (col < 0 || col >= this.cols || cp === undefined) return
    playSfx('click')
    this.onTap?.(cp)
  }

  private contains(p: Phaser.Input.Pointer): boolean {
    const r = this.rect
    return p.worldX >= r.x && p.worldX <= r.x + r.w && p.worldY >= r.y && p.worldY <= r.y + r.h
  }

  private onWheel(p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    if (!this.contains(p) || !pressedOn(this.scene, p, this.hit)) return
    this.velocity = 0
    this.scrollTo(this.scroll + dy * 0.6)
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.dragId !== null || !this.contains(p) || !pressedOn(this.scene, p, this.hit)) return
    if (Math.abs(this.velocity) >= FLING_CATCH) markDragged(this.scene, p)
    this.velocity = 0
    this.dragId = p.id
    this.moved = false
    this.dragFrom = this.lastY = p.worldY
    this.dragBase = this.scroll
    this.lastAt = this.scene.time.now
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.dragId || !p.isDown) return
    if (!this.moved) {
      if (this.max <= 0 || Math.abs(p.worldY - this.dragFrom) <= TAP_SLOP) return
      this.moved = true
      markDragged(this.scene, p)
      this.dragFrom = p.worldY
      this.dragBase = this.scroll
    }
    this.scrollTo(this.dragBase + this.dragFrom - p.worldY)
    const now = this.scene.time.now
    this.velocity = 0.5 * this.velocity + (0.5 * (this.lastY - p.worldY)) / Math.max(1, now - this.lastAt)
    this.lastY = p.worldY
    this.lastAt = now
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.dragId) return
    this.dragId = null
    if (!this.moved || this.scene.time.now - this.lastAt > 80) this.velocity = 0
  }

  private onUpdate(_time: number, delta: number): void {
    if (this.dragId !== null || this.velocity === 0) return
    const next = this.scroll + this.velocity * delta
    this.scrollTo(next)
    this.velocity *= Math.exp(-delta / FLING_DECAY)
    if (Math.abs(this.velocity) < 0.03 || next <= 0 || next >= this.max) this.velocity = 0
  }

  private updateWindow(): void {
    if (this.slots.length === 0 || this.keys.length === 0) return
    const first = Math.floor(this.scroll / CELL) * this.cols
    const last = Math.min(first + this.poolSize - 1, this.keys.length - 1)
    for (let index = first; index <= last; index++) {
      const slot = this.slots[index % this.poolSize]!
      if (slot.boundIndex !== index) this.bind(slot, index)
    }
  }

  private bind(slot: Slot, index: number): void {
    slot.boundIndex = index
    const cp = this.keys[index]!
    const cx = this.left + (index % this.cols) * CELL + CELL / 2
    const cy = Math.floor(index / this.cols) * CELL + CELL / 2
    const alpha = this.alphaOf(cp)
    const show = (key: string): void => {
      slot.image.setPosition(cx, cy).setTexture(key).setDisplaySize(ICON, ICON).setAlpha(alpha).setVisible(true)
    }
    const hit = emojiThumbKey(cp)
    if (hit) {
      show(hit)
      return
    }
    slot.image.setVisible(false)
    void requestEmojiThumb(this.scene, cp).then((key) => {
      if (!key || slot.boundIndex !== index || this.keys[index] !== cp || !this.scene.sys.isActive()) return
      show(key)
    })
  }

  private drawRing(): void {
    const g = this.ring.clear()
    const index = this.selected ? this.keys.indexOf(this.selected) : -1
    if (index < 0) return
    const x = this.left + (index % this.cols) * CELL
    const y = Math.floor(index / this.cols) * CELL
    g.lineStyle(7, SURFACE.outline, 1)
    g.strokeRoundedRect(x + 4, y + 4, CELL - 8, CELL - 8, 14)
    g.lineStyle(4, TONE.accent.face, 1)
    g.strokeRoundedRect(x + 4, y + 4, CELL - 8, CELL - 8, 14)
  }
}
