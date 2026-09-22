import Phaser from 'phaser'
import { TAP_SLOP } from '../util/units'
import { emojiThumbKey, requestEmojiThumb } from '../emoji/thumbs'
import { clipTo } from '../util/mask'

// 环形缓冲复用固定数量 Image：slot = index % poolSize。
// 惯性驱动挂场景 UPDATE，SHUTDOWN 时自摘：scene.events 不随 restart 清空

const CELL = 72
const ICON = 70

interface Slot {
  image: Phaser.GameObjects.Image
  boundIndex: number
}

export class VirtualEmojiGrid {
  onTap?: (cp: string) => void
  /** settled = 终态；中途高频，消费方自行节流 */
  onScrolled?: (settled: boolean) => void
  /** 150ms 至多一次 */
  onThumbsProgress?: () => void

  private scene: Phaser.Scene
  private rect: { x: number; y: number; w: number; h: number }
  private readonly cols: number
  private keys: readonly string[] = []
  private alphaOf: (cp: string) => number
  private container: Phaser.GameObjects.Container
  private ring: Phaser.GameObjects.Graphics
  private slots: Slot[] = []
  private poolSize = 0
  private scroll = 0
  private max = 0
  private selected: string | null = null
  private dragging = false
  private dragMoved = false
  private pressIn = false
  /** 按下时正在惯性滚动：只截停，不算点击 */
  private stopPress = false
  private dragStartY = 0
  private dragStartScroll = 0
  // px/ms
  private flingV = 0
  private lastMoveY = 0
  private lastMoveT = 0
  private progressPending = false
  private settleTimer?: Phaser.Time.TimerEvent

  constructor(
    scene: Phaser.Scene,
    rect: { x: number; y: number; w: number; h: number },
    opts: { initialScroll?: number; alphaOf?: (cp: string) => number } = {},
  ) {
    this.scene = scene
    this.rect = rect
    this.cols = Math.max(1, Math.floor(rect.w / CELL))
    this.scroll = opts.initialScroll ?? 0
    this.alphaOf = opts.alphaOf ?? ((): number => 1)

    const mask = scene.add.graphics().setVisible(false)
    mask.fillStyle(0xffffff, 1)
    mask.fillRect(rect.x, rect.y, rect.w, rect.h)
    this.container = scene.add.container(rect.x, rect.y)
    clipTo(this.container, mask)
    this.ring = scene.add.graphics()
    this.container.add(this.ring)

    scene.add
      .zone(rect.x, rect.y, rect.w, rect.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', (p: Phaser.Input.Pointer) => {
        if (this.dragMoved || !this.pressIn || this.stopPress) return
        const col = Math.floor((p.worldX - rect.x) / CELL)
        const index = Math.floor((p.worldY - rect.y + this.scroll) / CELL) * this.cols + col
        const cp = this.keys[index]
        if (col < 0 || col >= this.cols || cp === undefined) return
        this.onTap?.(cp)
      })

    scene.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.contains(p)) this.scrollTo(this.scroll + dy * 0.6)
    })
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragMoved = false
      // 阈值 0.35 ≈ 每帧 6px：衰减尾巴的余速不能吃掉点击
      this.stopPress = Math.abs(this.flingV) >= 0.35
      this.flingV = 0
      this.pressIn = this.contains(p)
      // 恒赋值：异常结束的上一轮手势不能把 dragging 卡在 true
      this.dragging = this.pressIn
      if (this.pressIn) {
        this.dragStartY = p.worldY
        this.dragStartScroll = this.scroll
        this.lastMoveY = p.worldY
        this.lastMoveT = scene.time.now
      }
    })
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !p.isDown) return
      const dy = this.dragStartY - p.worldY
      // 不可滚动时不判拖
      if (this.max > 0 && Math.abs(dy) > TAP_SLOP) this.dragMoved = true
      if (this.dragMoved) {
        this.scrollTo(this.dragStartScroll + dy)
        const dt = Math.max(1, scene.time.now - this.lastMoveT)
        this.flingV = 0.5 * this.flingV + 0.5 * ((this.lastMoveY - p.worldY) / dt)
        this.lastMoveY = p.worldY
        this.lastMoveT = scene.time.now
      }
    })
    // pointerupoutside 与 touchcancel 都不发 pointerup；dragging 不清会让之后每次按下都被判截停
    scene.input.on('pointerup', this.release, this)
    scene.input.on('pointerupoutside', this.release, this)

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this)
    })
  }

  get scrollY(): number {
    return this.scroll
  }

  get maxScroll(): number {
    return this.max
  }

  get wasDragged(): boolean {
    return this.dragMoved
  }

  setItems(keys: readonly string[]): void {
    this.keys = keys
    const totalRows = Math.ceil(keys.length / this.cols)
    this.max = Math.max(0, totalRows * CELL - this.rect.h)
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

  ensureVisible(): void {
    const index = this.selected ? this.keys.indexOf(this.selected) : -1
    if (index < 0) return
    const top = Math.floor(index / this.cols) * CELL
    if (top >= this.scroll && top + CELL <= this.scroll + this.rect.h) return
    this.scrollTo(top - (this.rect.h - CELL) / 2)
  }

  /** 视口坐标；只含完整可见的格子（半行点不到） */
  cellRects(): { key: string; x: number; y: number; w: number; h: number }[] {
    return this.slots
      .filter((s) => s.boundIndex >= 0 && this.keys[s.boundIndex] !== undefined)
      .sort((a, b) => a.boundIndex - b.boundIndex)
      .map((s) => ({
        key: this.keys[s.boundIndex]!,
        x: this.rect.x + (s.boundIndex % this.cols) * CELL,
        y: this.rect.y + Math.floor(s.boundIndex / this.cols) * CELL - this.scroll,
        w: CELL,
        h: CELL,
      }))
      .filter((r) => r.y >= this.rect.y && r.y + r.h <= this.rect.y + this.rect.h)
  }

  scrollTo(y: number): void {
    this.scroll = Math.max(0, Math.min(this.max, y))
    this.container.y = this.rect.y - this.scroll
    this.updateWindow()
    this.onScrolled?.(false)
    // 滚轮没有松手事件：去抖后补一发终态
    this.settleTimer?.remove()
    this.settleTimer = this.scene.time.delayedCall(160, () => {
      this.settleTimer = undefined
      if (this.scene.sys.isActive()) this.onScrolled?.(true)
    })
  }

  private release(): void {
    this.dragging = false
    if (!this.dragMoved || Math.abs(this.flingV) < 0.05) {
      this.flingV = 0
      this.onScrolled?.(true)
    }
  }

  private onUpdate(_time: number, delta: number): void {
    // touchcancel 不发 up 事件：按指针实况解除拖动
    if (this.dragging && !this.scene.input.activePointer.isDown) this.release()
    if (this.flingV === 0 || this.dragging) return
    const next = this.scroll + this.flingV * delta
    this.scrollTo(next)
    this.flingV *= Math.exp(-delta / 320)
    // 0.05 ≈ 每帧 1px
    if (Math.abs(this.flingV) < 0.05 || next <= 0 || next >= this.max) {
      this.flingV = 0
      this.onScrolled?.(true)
    }
  }

  private contains(p: Phaser.Input.Pointer): boolean {
    const r = this.rect
    return p.worldX >= r.x && p.worldX <= r.x + r.w && p.worldY >= r.y && p.worldY <= r.y + r.h
  }

  private updateWindow(): void {
    if (this.slots.length === 0 || this.keys.length === 0) return
    const first = Math.floor(this.scroll / CELL) * this.cols
    const last = Math.min(first + this.poolSize - 1, this.keys.length - 1)
    for (let index = first; index <= last; index++) {
      const slot = this.slots[index % this.poolSize]!
      if (slot.boundIndex === index) continue
      this.bind(slot, index)
    }
  }

  private bind(slot: Slot, index: number): void {
    slot.boundIndex = index
    const cp = this.keys[index]!
    const cx = (index % this.cols) * CELL + CELL / 2
    const cy = Math.floor(index / this.cols) * CELL + CELL / 2
    const alpha = this.alphaOf(cp)
    const hit = emojiThumbKey(cp)
    if (hit) {
      slot.image.setPosition(cx, cy).setTexture(hit).setDisplaySize(ICON, ICON).setAlpha(alpha).setVisible(true)
      return
    }
    // 异步回填前校验格子仍绑着同一条目且清单未换
    slot.image.setVisible(false)
    void requestEmojiThumb(this.scene, cp).then((key) => {
      if (!key || slot.boundIndex !== index || this.keys[index] !== cp || !this.scene.sys.isActive()) return
      slot.image.setPosition(cx, cy).setTexture(key).setDisplaySize(ICON, ICON).setAlpha(alpha).setVisible(true)
      this.reportProgress()
    })
  }

  /** 最后一批必有通知 */
  private reportProgress(): void {
    if (this.progressPending) return
    this.progressPending = true
    this.scene.time.delayedCall(150, () => {
      this.progressPending = false
      if (this.scene.sys.isActive()) this.onThumbsProgress?.()
    })
  }

  private drawRing(): void {
    this.ring.clear()
    const index = this.selected ? this.keys.indexOf(this.selected) : -1
    if (index < 0) return
    const x = (index % this.cols) * CELL
    const y = Math.floor(index / this.cols) * CELL
    this.ring.lineStyle(3, 0xffdc5d, 0.95)
    this.ring.strokeRoundedRect(x + 4, y + 4, CELL - 8, CELL - 8, 12)
  }
}
