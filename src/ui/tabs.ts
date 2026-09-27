import Phaser from 'phaser'
import type { OutlineKind } from '../emoji/svg'
import { drawBlock } from './draw'
import { pressable } from './gesture'
import { Icon } from './icon'
import { Label, RichLabel } from './label'
import { ScrollView } from './scrollView'
import { SHAPE, SURFACE, TONE } from './theme'
import type { TextKind } from './theme'
import { Widget } from './widget'

export interface TabItem<K> {
  readonly key: K
  /** 可含 {emoji} 占位；上下排的页签是图标下方的小字 */
  readonly label?: string
  /** 上下排的页签上方的大图标 */
  readonly icon?: string
  readonly outline?: OutlineKind
  /** 上下排的页签右上角的小图标 */
  readonly badge?: string
  readonly dim?: boolean
}

/** md、sm 是一行字；tall、tile 是图标在上、小字在下 */
export type TabsSize = 'md' | 'sm' | 'tall' | 'tile'

export interface TabsOptions<K> {
  readonly items: readonly TabItem<K>[]
  readonly selected: K
  readonly onSelect: (key: K) => void
  readonly size?: TabsSize
  /** 每个页签的固定宽度；不给就按内容 */
  readonly tabWidth?: number
  /** 排成若干列的网格，页签等宽铺满 row.w */
  readonly columns?: number
  readonly depth?: number
  /** 放进某个容器，row 用它的局部坐标；这时不横向滚动 */
  readonly parent?: Phaser.GameObjects.Container
  readonly align?: 'center' | 'left'
}

interface Dims {
  readonly h: number
  readonly kind: TextKind
  readonly pad: number
  readonly radius: number
  /** 上下排的图标尺寸 */
  readonly icon?: number
}

const DIMS: Readonly<Record<TabsSize, Dims>> = {
  md: { h: 52, kind: 'body', pad: 22, radius: 16 },
  sm: { h: 44, kind: 'label', pad: 18, radius: 12 },
  tall: { h: 96, kind: 'caption', pad: 12, radius: 16, icon: 44 },
  tile: { h: 70, kind: 'caption', pad: 10, radius: 12, icon: 32 },
}

const GAP = 10

class Tab<K> extends Widget {
  readonly key: K
  readonly tabW: number
  private readonly bg: Phaser.GameObjects.Graphics
  private readonly face: Widget
  private readonly text: Label | RichLabel
  private readonly dims: Dims
  private chosen = false

  constructor(scene: Phaser.Scene, item: TabItem<K>, dims: Dims, width: number | undefined, onTap: () => void) {
    super(scene)
    this.key = item.key
    this.dims = dims
    this.bg = scene.add.graphics()
    this.face = new Widget(scene)
    this.add([this.bg, this.face])
    const h = dims.h
    if (dims.icon !== undefined) {
      this.tabW = width ?? 150
      const icon = new Icon(scene, 0, -h / 2 + dims.icon / 2 + 8, item.icon ?? '2753', dims.icon, item.outline).setAlpha(item.dim ? 0.4 : 1)
      this.text = new Label(scene, 0, h / 2 - 16, item.label ?? '', { kind: dims.kind, bold: true }).setOrigin(0.5).fit(this.tabW - 12)
      this.face.add([icon, this.text])
      if (item.badge) this.face.add(new Icon(scene, this.tabW / 2 - 16, -h / 2 + 16, item.badge, 22))
    } else {
      this.text = new RichLabel(scene, 0, 0, item.label ?? '', { kind: dims.kind, bold: true, originX: 0.5 })
      this.tabW = width ?? Math.round(this.text.spanWidth + dims.pad * 2)
      if (width !== undefined) this.text.setScale(Math.min(1, (width - 16) / this.text.spanWidth))
      this.face.add(this.text)
    }
    this.paint()
    pressable(this, {
      shape: new Phaser.Geom.Rectangle(-this.tabW / 2, -h / 2, this.tabW, h + SHAPE.drop),
      onTap: () => {
        if (!this.chosen) onTap()
      },
    })
  }

  setChosen(chosen: boolean): void {
    if (chosen === this.chosen) return
    this.chosen = chosen
    this.paint()
  }

  private paint(): void {
    const { h, radius } = this.dims
    const lift = this.chosen ? 0 : 2
    const tone = TONE.accent
    drawBlock(this.bg.clear(), -this.tabW / 2, -h / 2 + lift, this.tabW, h, {
      face: this.chosen ? tone.face : SURFACE.raisedHi,
      lip: this.chosen ? tone.lip : undefined,
      lipH: 4,
      drop: this.chosen ? SHAPE.drop - 1 : 2,
      radius,
      gloss: this.chosen ? 0.35 : 0,
    })
    this.text.setInk(this.chosen ? tone.on : 'soft')
    this.face.setY(lift - (this.chosen ? 2 : 0))
  }
}

/** 一组互斥的页签；row 给出左端、首行中线与宽度。单行放不下时横向滚动，给了 columns 就排成网格 */
export class Tabs<K> {
  /** 整组占用的高度（含投影） */
  readonly height: number
  private readonly tabs: Tab<K>[] = []
  private readonly holder: Widget
  private readonly scroller?: ScrollView
  private readonly onSelect: (key: K) => void

  constructor(scene: Phaser.Scene, row: { readonly x: number; readonly y: number; readonly w: number }, opts: TabsOptions<K>) {
    this.onSelect = opts.onSelect
    const dims = DIMS[opts.size ?? 'md']
    const h = dims.h
    const columns = opts.columns
    const width = columns ? (row.w - GAP * (columns - 1)) / columns : opts.tabWidth
    this.holder = new Widget(scene)
    opts.parent?.add(this.holder)
    for (const item of opts.items) {
      const tab: Tab<K> = new Tab(scene, item, dims, width, () => this.pick(tab.key))
      this.tabs.push(tab)
    }
    if (opts.depth !== undefined) this.holder.setDepth(opts.depth)

    if (columns) {
      this.tabs.forEach((t, i) => {
        t.setPosition(row.x + (i % columns) * (t.tabW + GAP) + t.tabW / 2, row.y + Math.floor(i / columns) * (h + GAP + SHAPE.drop))
      })
      this.holder.add(this.tabs)
      const rows = Math.ceil(this.tabs.length / columns)
      this.height = rows * (h + GAP + SHAPE.drop) - GAP
    } else {
      this.height = h + SHAPE.drop
      const total = this.tabs.reduce((s, t) => s + t.tabW, 0) + GAP * Math.max(0, this.tabs.length - 1)
      if (total > row.w && !opts.parent) {
        const pad = 6
        const scroller = new ScrollView(scene, { x: row.x, y: row.y - h / 2 - pad, w: row.w, h: h + SHAPE.drop + pad * 2 }, { axis: 'x', scrollbar: false })
        let x = pad
        for (const t of this.tabs) {
          t.setPosition(x + t.tabW / 2, h / 2 + pad)
          x += t.tabW + GAP
        }
        scroller.add(this.tabs).setContentSize(x - GAP + pad)
        if (opts.depth !== undefined) scroller.setDepth(opts.depth)
        this.scroller = scroller
      } else {
        let x = opts.align === 'left' ? row.x : row.x + (row.w - total) / 2
        for (const t of this.tabs) {
          t.setPosition(x + t.tabW / 2, row.y)
          x += t.tabW + GAP
        }
        this.holder.add(this.tabs)
      }
    }
    this.setSelected(opts.selected)
  }

  setSelected(key: K): void {
    for (const t of this.tabs) t.setChosen(t.key === key)
    const tab = this.tabs.find((t) => t.key === key)
    if (tab && this.scroller) this.scroller.reveal(tab.x - tab.tabW / 2 - 6, tab.tabW + 12)
  }

  destroy(): void {
    this.scroller?.destroy()
    this.holder.destroy()
  }

  private pick(key: K): void {
    this.setSelected(key)
    this.onSelect(key)
  }
}
