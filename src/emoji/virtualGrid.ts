import Phaser from 'phaser'
import { TAP_SLOP } from '../core/units'
import { emojiThumbKey, requestEmojiThumb } from './thumbs'

// 全量 emoji 虚拟网格（feed 流）：环形缓冲复用固定数量 Image——
// slot = index % poolSize，只有窗口边缘换入的格子才重绑；格子滚入视口
// 按需光栅化自己的缩略图（emojiThumbs 页级缓存，滚回零等待）。
// 滚轮 + 拖动 + 惯性滑动，点选画选中框。图鉴「全部」页与 Studio 素材区共用。
// 输入监听挂 scene.input（场景重启自动清理）；惯性驱动挂场景 UPDATE，
// SHUTDOWN 时自摘（scene.events 不随 restart 清空，不摘会跨局叠加）。

const CELL = 72
const ICON = 70

interface Slot {
  image: Phaser.GameObjects.Image
  boundIndex: number
}

export class VirtualEmojiGrid {
  /** 点选格子（拖动不算；key 为码点） */
  onTap?: (cp: string) => void
  /** 滚动回调；settled = 拖动结束/惯性停止的终态（中途高频，消费方自行节流） */
  onScrolled?: (settled: boolean) => void
  /** 缩略图落地的拖尾节流回调（150ms 至多一次），调试上报进度用 */
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
  /** 本次按下是否落在网格内（防止跨面板拖过来松手触发误选） */
  private pressIn = false
  /** 本次按下发生在惯性滚动中 = 截停滚动，不算点击（移动端惯例） */
  private stopPress = false
  private dragStartY = 0
  private dragStartScroll = 0
  // 惯性滚动：拖动时采样速度（px/ms），松手后指数衰减
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
    this.container.setMask(mask.createGeometryMask())
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
      // 只有列表在明显滑动中（≥ 每帧约 6px）按下才算截停；衰减尾巴的
      // 不可见余速不能吃掉点击（0.05 阈值实测把"甩完即点"大量误杀）
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
      // 不可滚动时拖动无意义，不判拖——轻点永不被误杀
      if (this.max > 0 && Math.abs(dy) > TAP_SLOP) this.dragMoved = true
      if (this.dragMoved) {
        this.scrollTo(this.dragStartScroll + dy)
        const dt = Math.max(1, scene.time.now - this.lastMoveT)
        this.flingV = 0.5 * this.flingV + 0.5 * ((this.lastMoveY - p.worldY) / dt)
        this.lastMoveY = p.worldY
        this.lastMoveT = scene.time.now
      }
    })
    // 画布外松手（pointerupoutside）与正常松手同路；系统手势打断（touchcancel）
    // 两者都不发 pointerup——不清 dragging 会冻结惯性速度，之后每次按下都被
    // 误判截停、点击全灭（用户实报的"点击经常没反应"）
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

  /** 最近一次按下是否发生了拖动（外部按钮的 pointerup 用它防误触） */
  get wasDragged(): boolean {
    return this.dragMoved
  }

  /** 换清单（进场/切 tab）：滑窗全量重绑，滚动位置钳制进新范围 */
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

  /** 选中格不在视口内时滚动到使其居中（切 tab/进场对齐用） */
  ensureVisible(): void {
    const index = this.selected ? this.keys.indexOf(this.selected) : -1
    if (index < 0) return
    const top = Math.floor(index / this.cols) * CELL
    if (top >= this.scroll && top + CELL <= this.scroll + this.rect.h) return
    this.scrollTo(top - (this.rect.h - CELL) / 2)
  }

  /** 视口坐标下完整可见格子的命中矩形（e2e 调试上报用，按清单序）；
   * 被上下边缘裁剪的半行不报——报了也点不到（命中区只覆盖列表矩形） */
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
    // 滚轮没有「松手」事件：拖尾去抖一发终态，消费方的节流上报才能收敛到最终位置
    this.settleTimer?.remove()
    this.settleTimer = this.scene.time.delayedCall(160, () => {
      this.settleTimer = undefined
      if (this.scene.sys.isActive()) this.onScrolled?.(true)
    })
  }

  /** 松手/出画布松手共用；释放拖动态并决定是否进入惯性 */
  private release(): void {
    this.dragging = false
    // 松手：速度足够则进入惯性滑动，否则立即定格并通知终态
    if (!this.dragMoved || Math.abs(this.flingV) < 0.05) {
      this.flingV = 0
      this.onScrolled?.(true)
    }
  }

  private onUpdate(_time: number, delta: number): void {
    // 兜底：手势被系统打断（touchcancel 等不发任何 up 事件）时按指针实况解除拖动
    if (this.dragging && !this.scene.input.activePointer.isDown) this.release()
    if (this.flingV === 0 || this.dragging) return
    const next = this.scroll + this.flingV * delta
    this.scrollTo(next)
    this.flingV *= Math.exp(-delta / 320)
    // 低于每帧约 1px 就定格——指数衰减的尾巴又长又不可见，拖着只会挡点击
    if (Math.abs(this.flingV) < 0.05 || next <= 0 || next >= this.max) {
      this.flingV = 0
      this.onScrolled?.(true)
    }
  }

  private contains(p: Phaser.Input.Pointer): boolean {
    const r = this.rect
    return p.worldX >= r.x && p.worldX <= r.x + r.w && p.worldY >= r.y && p.worldY <= r.y + r.h
  }

  /** 虚拟滚动核心：只有窗口边缘换入的格子才重绑 */
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
    // 缓存未命中：先空格，渲染完成且格子仍绑着同一条目（清单也没换）时浮现
    slot.image.setVisible(false)
    void requestEmojiThumb(this.scene, cp).then((key) => {
      if (!key || slot.boundIndex !== index || this.keys[index] !== cp || !this.scene.sys.isActive()) return
      slot.image.setPosition(cx, cy).setTexture(key).setDisplaySize(ICON, ICON).setAlpha(alpha).setVisible(true)
      this.reportProgress()
    })
  }

  /** 缩略图落地的拖尾节流：150ms 至多通知一次，且最后一批必有通知 */
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
    this.ring.lineStyle(3, 0xffd54f, 0.95)
    this.ring.strokeRoundedRect(x + 4, y + 4, CELL - 8, CELL - 8, 12)
  }
}
