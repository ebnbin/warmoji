import Phaser from 'phaser'
import { TAP_SLOP } from '../util/units'
import { clipTo, markDirty } from '../util/mask'
import { roundRect } from './shapes'

// 几何遮罩只裁像素不裁输入：滚出视口的交互子项仍会拦截点击，故每次滚动按可视矩形逐子项开关 input

export interface ScrollRect {
  x: number
  y: number
  w: number
  h: number
}

function maxScrollOf(contentHeight: number, viewH: number): number {
  return Math.max(0, contentHeight - viewH)
}

function clampScroll(y: number, max: number): number {
  return Math.max(0, Math.min(max, y))
}

/** max <= 0 表示无需滚动条 */
function thumbGeom(
  rect: ScrollRect,
  contentHeight: number,
  scroll: number,
): { y: number; h: number } | null {
  const max = maxScrollOf(contentHeight, rect.h)
  if (max <= 0) return null
  const h = Math.max(24, (rect.h / contentHeight) * rect.h)
  const y = rect.y + (scroll / max) * (rect.h - h)
  return { y, h }
}

export class ScrollView {
  /** 子项坐标以内容顶为原点 */
  readonly content: Phaser.GameObjects.Container

  private rect: ScrollRect
  private scroll = 0
  private max = 0
  private contentHeight = 0
  private maskGfx: Phaser.GameObjects.Graphics
  /** 改了矩形要 markDirty */
  private mask?: Phaser.Filters.Mask
  private bar?: Phaser.GameObjects.Graphics
  private dragging = false
  private dragMovedFlag = false
  private dragStartY = 0
  private dragStartScroll = 0

  constructor(
    scene: Phaser.Scene,
    rect: ScrollRect,
    opts: { frame?: boolean; scrollbar?: boolean; initialScroll?: number } = {},
  ) {
    this.rect = rect
    this.scroll = opts.initialScroll ?? 0

    if (opts.frame) {
      const f = scene.add.graphics()
      roundRect(f, rect.x - 8, rect.y - 8, rect.w + 16, rect.h + 16, 14, { fill: 0x000000, fillAlpha: 0.18 })
    }

    this.content = scene.add.container(rect.x, rect.y - this.scroll)
    this.maskGfx = scene.add.graphics().setVisible(false)
    this.maskGfx.fillStyle(0xffffff, 1)
    this.maskGfx.fillRect(rect.x, rect.y, rect.w, rect.h)
    this.mask = clipTo(this.content, this.maskGfx)

    if (opts.scrollbar !== false) this.bar = scene.add.graphics()

    scene.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.contains(p)) this.setScroll(this.scroll + dy * 0.6)
    })
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragMovedFlag = false
      // 恒赋值：上一轮手势异常结束（出画布/系统打断）不能把拖动态卡住
      this.dragging = this.contains(p)
      if (this.dragging) {
        this.dragStartY = p.worldY
        this.dragStartScroll = this.scroll
      }
    })
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !p.isDown) return
      const dy = this.dragStartY - p.worldY
      if (this.max > 0 && Math.abs(dy) > TAP_SLOP) this.dragMovedFlag = true
      if (this.dragMovedFlag) this.setScroll(this.dragStartScroll + dy)
    })
    const release = (): void => {
      this.dragging = false
    }
    scene.input.on('pointerup', release)
    scene.input.on('pointerupoutside', release)
  }

  get wasDragged(): boolean {
    return this.dragMovedFlag
  }

  get viewport(): Readonly<ScrollRect> {
    return this.rect
  }

  add(obj: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]): this {
    this.content.add(obj)
    return this
  }

  clear(): this {
    this.content.removeAll(true)
    this.contentHeight = 0
    this.max = 0
    this.setScroll(0)
    return this
  }

  /** 填完子项后调用 */
  setContentHeight(h: number): void {
    this.contentHeight = Math.max(0, h)
    this.max = maxScrollOf(this.contentHeight, this.rect.h)
    this.setScroll(this.scroll)
  }

  scrollTo(y: number): void {
    this.setScroll(y)
  }

  setViewport(rect: ScrollRect): void {
    this.rect = rect
    this.maskGfx.clear()
    this.maskGfx.fillStyle(0xffffff, 1)
    this.maskGfx.fillRect(rect.x, rect.y, rect.w, rect.h)
    markDirty(this.mask)
    this.content.x = rect.x
    this.max = maxScrollOf(this.contentHeight, rect.h)
    this.setScroll(this.scroll)
  }

  setDepth(depth: number): this {
    this.content.setDepth(depth)
    this.bar?.setDepth(depth)
    return this
  }

  destroy(): void {
    this.content.destroy()
    this.bar?.destroy()
  }

  private contains(p: Phaser.Input.Pointer): boolean {
    return (
      p.worldX >= this.rect.x &&
      p.worldX <= this.rect.x + this.rect.w &&
      p.worldY >= this.rect.y &&
      p.worldY <= this.rect.y + this.rect.h
    )
  }

  private setScroll(y: number): void {
    this.scroll = clampScroll(y, this.max)
    this.content.y = this.rect.y - this.scroll
    this.clipInput()
    this.drawBar()
  }

  private clipInput(): void {
    const { x, y, w, h } = this.rect
    for (const c of this.content.list) {
      const go = c as Phaser.GameObjects.GameObject & {
        input?: Phaser.Types.Input.InteractiveObject | null
        getBounds?: () => Phaser.Geom.Rectangle
      }
      if (!go.input || typeof go.getBounds !== 'function') continue
      const b = go.getBounds()
      go.input.enabled = !(b.bottom < y || b.top > y + h || b.right < x || b.left > x + w)
    }
  }

  private drawBar(): void {
    if (!this.bar) return
    this.bar.clear()
    const t = thumbGeom(this.rect, this.contentHeight, this.scroll)
    if (!t) return
    this.bar.fillStyle(0xffffff, 0.22)
    this.bar.fillRoundedRect(this.rect.x + this.rect.w - 6, t.y, 4, t.h, 2)
  }
}
