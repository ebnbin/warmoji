import Phaser from 'phaser'
import type { OutlineKind } from '../emoji/svg'
import { TAP_SLOP } from '../util/units'
import { emojiImage } from '../emoji/textures'
import { clipTo } from '../util/mask'
import { roundRect } from './shapes'

// 可滚动 emoji 网格：形象即含义，名字/数值留给详情面板。
// 队长/组队/商店/图鉴条目页共用——统一滚轮 + 拖动（拖过阈值不算点击）、
// 选中白圈高亮、可选右上角标（✅ / 上架道具）与底部血条。
// 列数按容器宽自适应，条目再多也只是变长可滚动。

export interface EmojiGridItem {
  key: string
  emoji: string
  outline?: OutlineKind
  /** 右上角标 emoji（如 ✅ 已选 / 当前上架道具） */
  badge?: string
  /** 底部血条比例 0..1（undefined 不显示） */
  hpRatio?: number
}

interface Cell {
  item: EmojiGridItem
  relX: number
  relY: number
  bg: Phaser.GameObjects.Graphics
}

// 网格间隙（逻辑 px）；命中反解时落在缝隙不算点中
const GAP = 10

export class EmojiGrid {
  onTap?: (key: string) => void
  onScroll?: () => void

  private scene: Phaser.Scene
  private rect: { x: number; y: number; w: number; h: number }
  private cell: number
  private readonly gap = GAP
  private cols: number
  private container: Phaser.GameObjects.Container
  private cells: Cell[] = []
  private selectedKey: string | null = null
  private scroll = 0
  private max = 0
  private contentHeight = 0
  private dragging = false
  private dragMovedFlag = false
  private dragStartY = 0
  private dragStartScroll = 0

  constructor(
    scene: Phaser.Scene,
    rect: { x: number; y: number; w: number; h: number },
    opts: { cellSize?: number; initialScroll?: number } = {},
  ) {
    this.scene = scene
    this.rect = rect
    this.cell = opts.cellSize ?? 96
    this.cols = Math.max(1, Math.floor((rect.w + this.gap) / (this.cell + this.gap)))
    this.scroll = opts.initialScroll ?? 0

    const frame = scene.add.graphics()
    roundRect(frame, rect.x - 8, rect.y - 8, rect.w + 16, rect.h + 16, 14, { fill: 0x000000, fillAlpha: 0.18 })

    this.container = scene.add.container(rect.x, rect.y)
    const mask = scene.add.graphics().setVisible(false)
    mask.fillStyle(0xffffff, 1)
    mask.fillRect(rect.x, rect.y, rect.w, rect.h)
    clipTo(this.container, mask)

    // 网格只有这一个命中区（与可视区域等大），格子从坐标反解。
    // 逐格 zone 会在遮罩外照常拦截输入（遮罩不裁点击），滚出视口的
    // 格子会盖住网格外侧控件、把那里的点击整块吃掉
    scene.add
      .zone(rect.x, rect.y, rect.w, rect.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', (p: Phaser.Input.Pointer) => {
        if (this.dragMovedFlag) return
        const pitch = this.cell + this.gap
        const lx = p.worldX - rect.x
        const ly = p.worldY - rect.y + this.scroll
        // 落在格间缝隙不算点中
        if (lx % pitch > this.cell || ly % pitch > this.cell) return
        const col = Math.floor(lx / pitch)
        if (col < 0 || col >= this.cols) return
        const item = this.cells[Math.floor(ly / pitch) * this.cols + col]?.item
        if (item) this.onTap?.(item.key)
      })

    // 滚轮 + 拖动；监听挂 scene.input，场景重启自动清理
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

  get contentH(): number {
    return this.contentHeight
  }

  /** 最近一次按下是否发生了拖动（外部按钮的 pointerup 用它防误触） */
  get wasDragged(): boolean {
    return this.dragMovedFlag
  }

  /** 重建全部格子（条目/角标/血条变化时调用；本页条目量级小，直接重建） */
  setItems(items: readonly EmojiGridItem[]): void {
    this.container.removeAll(true)
    this.cells = []
    const pitch = this.cell + this.gap
    items.forEach((item, i) => {
      const relX = (i % this.cols) * pitch
      const relY = Math.floor(i / this.cols) * pitch
      const bg = this.scene.add.graphics()
      const icon = emojiImage(
        this.scene,
        relX + this.cell / 2,
        relY + this.cell / 2 - (item.hpRatio !== undefined ? 5 : 0),
        item.emoji,
        this.cell - 8,
        item.outline,
      )
      this.container.add([bg, icon])
      if (item.badge) {
        const badge = emojiImage(this.scene, relX + this.cell - 17, relY + 17, item.badge, 32)
        this.container.add(badge)
      }
      if (item.hpRatio !== undefined) {
        const bar = this.scene.add.graphics()
        const bw = this.cell - 28
        bar.fillStyle(0x000000, 0.45)
        bar.fillRect(relX + 14, relY + this.cell - 16, bw, 7)
        const r = item.hpRatio
        bar.fillStyle(r > 0.5 ? 0x66bb6a : r > 0.3 ? 0xffdc5d : 0xef5350, 1)
        bar.fillRect(relX + 15, relY + this.cell - 15, (bw - 2) * r, 5)
        this.container.add(bar)
      }
      this.cells.push({ item, relX, relY, bg })
    })
    const rows = Math.ceil(items.length / this.cols)
    this.contentHeight = rows > 0 ? rows * pitch - this.gap : 0
    this.max = Math.max(0, this.contentHeight - this.rect.h)
    this.setScroll(this.scroll)
    this.redraw()
  }

  setSelected(key: string | null): void {
    this.selectedKey = key
    this.redraw()
  }

  /** 视口坐标下的格子命中矩形（e2e 调试上报用） */
  cellRects(): { key: string; x: number; y: number; w: number; h: number }[] {
    return this.cells.map((c) => ({
      key: c.item.key,
      x: this.rect.x + c.relX,
      y: this.rect.y + c.relY - this.scroll,
      w: this.cell,
      h: this.cell,
    }))
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
    this.scroll = Math.max(0, Math.min(this.max, y))
    this.container.y = this.rect.y - this.scroll
    this.onScroll?.()
  }

  private redraw(): void {
    for (const c of this.cells) {
      const focused = c.item.key === this.selectedKey
      c.bg.clear()
      c.bg.fillStyle(focused ? 0xffffff : 0x000000, focused ? 0.16 : 0.25)
      c.bg.fillRoundedRect(c.relX, c.relY, this.cell, this.cell, 16)
      c.bg.lineStyle(focused ? 2 : 1, 0xffffff, focused ? 0.9 : 0.1)
      c.bg.strokeRoundedRect(c.relX, c.relY, this.cell, this.cell, 16)
    }
  }
}
