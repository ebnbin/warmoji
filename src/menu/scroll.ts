import Phaser from 'phaser'
import { TAP_SLOP } from '../core/units'

// 通用可滚动容器：几何遮罩裁像素 + 滚轮/拖动 + 内容高度钳位。
// 与 EmojiGrid 同源的手势逻辑，但装任意 GameObject（详情面板的变长文本/图标/交互控件），
// 用于「变长文案不该被固定面板截断」的所有场景。
// 关键坑：几何遮罩只裁像素、不裁「输入」——滚出视口的交互子项仍会在原世界位置拦截点击，
// 故每次滚动都按可视矩形逐子项开关 input；再配合外部按钮读 wasDragged 防拖动误触。

export interface ScrollRect {
  x: number
  y: number
  w: number
  h: number
}

/** 可滚动上限：内容比视口高多少就能滚多少（不足视口则为 0） */
export function maxScrollOf(contentHeight: number, viewH: number): number {
  return Math.max(0, contentHeight - viewH)
}

/** 把滚动量钳到 [0, max] */
export function clampScroll(y: number, max: number): number {
  return Math.max(0, Math.min(max, y))
}

/** 滚动条滑块几何：返回滑块顶端 y（绝对）与高度；max<=0 表示无需滚动条 */
export function thumbGeom(
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
  /** 内容容器：子项坐标以内容顶为原点（y=0 在内容顶），滚动即整体上移 */
  readonly content: Phaser.GameObjects.Container
  onScroll?: () => void

  private rect: ScrollRect
  private scroll = 0
  private max = 0
  private contentHeight = 0
  private maskGfx: Phaser.GameObjects.Graphics
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
      f.fillStyle(0x000000, 0.18)
      f.fillRoundedRect(rect.x - 8, rect.y - 8, rect.w + 16, rect.h + 16, 14)
    }

    this.content = scene.add.container(rect.x, rect.y - this.scroll)
    this.maskGfx = scene.add.graphics().setVisible(false)
    this.maskGfx.fillStyle(0xffffff, 1)
    this.maskGfx.fillRect(rect.x, rect.y, rect.w, rect.h)
    this.content.setMask(this.maskGfx.createGeometryMask())

    if (opts.scrollbar !== false) this.bar = scene.add.graphics()

    // 滚轮 + 拖动挂 scene.input（场景重启自动清理）；仅在本视口内响应。
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

  get scrollY(): number {
    return this.scroll
  }

  get maxScroll(): number {
    return this.max
  }

  /** 最近一次按下是否发生了拖动（视口内交互子项的 pointerup 用它防误触） */
  get wasDragged(): boolean {
    return this.dragMovedFlag
  }

  get viewport(): Readonly<ScrollRect> {
    return this.rect
  }

  /** 向内容容器追加子项（坐标相对内容顶） */
  add(obj: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]): this {
    this.content.add(obj)
    return this
  }

  /** 清空重填前调用：销毁全部子项、复位内容高度与滚动量 */
  clear(): this {
    this.content.removeAll(true)
    this.contentHeight = 0
    this.max = 0
    this.setScroll(0)
    return this
  }

  /** 填完子项后声明内容总高度：据此算可滚上限并重新钳位（顺带刷新输入裁剪/滚动条） */
  setContentHeight(h: number): void {
    this.contentHeight = Math.max(0, h)
    this.max = maxScrollOf(this.contentHeight, this.rect.h)
    this.setScroll(this.scroll)
  }

  scrollTo(y: number): void {
    this.setScroll(y)
  }

  /** 重设可视矩形（同一 ScrollView 复用于位置/尺寸会变的滚动区时用）：
   * 重画遮罩、复位内容原点并重新钳位 */
  setViewport(rect: ScrollRect): void {
    this.rect = rect
    this.maskGfx.clear()
    this.maskGfx.fillStyle(0xffffff, 1)
    this.maskGfx.fillRect(rect.x, rect.y, rect.w, rect.h)
    this.content.x = rect.x
    this.max = maxScrollOf(this.contentHeight, rect.h)
    this.setScroll(this.scroll)
  }

  /** 抬升内容与滚动条的绘制层级（HUD 上叠加时用） */
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
    this.onScroll?.()
  }

  // 几何遮罩不裁输入：滚出可视矩形的交互子项按世界 AABB 关掉 input，滚回来再开。
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
