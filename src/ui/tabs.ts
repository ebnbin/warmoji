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
  /** 可含 {emoji} 占位 */
  readonly label?: string
  /** tall 页签上方的大图标 */
  readonly icon?: string
  readonly outline?: OutlineKind
  /** tall 页签右上角的小图标 */
  readonly badge?: string
  readonly dim?: boolean
}

export type TabsSize = 'md' | 'sm' | 'tall'

export interface TabsOptions<K> {
  readonly items: readonly TabItem<K>[]
  readonly selected: K
  readonly onSelect: (key: K) => void
  readonly size?: TabsSize
  /** 每个页签的固定宽度；不给就按内容 */
  readonly tabWidth?: number
  readonly depth?: number
}

const DIMS: Readonly<Record<TabsSize, { readonly h: number; readonly kind: TextKind; readonly pad: number; readonly radius: number }>> = {
  md: { h: 52, kind: 'body', pad: 22, radius: 16 },
  sm: { h: 44, kind: 'label', pad: 18, radius: 12 },
  tall: { h: 96, kind: 'caption', pad: 12, radius: 16 },
}

const GAP = 10

class Tab<K> extends Widget {
  readonly key: K
  readonly tabW: number
  private readonly bg: Phaser.GameObjects.Graphics
  private readonly text: Label | RichLabel
  private readonly size: TabsSize
  private chosen = false

  constructor(scene: Phaser.Scene, item: TabItem<K>, size: TabsSize, width: number | undefined, onTap: () => void) {
    super(scene)
    const d = DIMS[size]
    this.key = item.key
    this.size = size
    this.bg = scene.add.graphics()
    this.add(this.bg)
    if (size === 'tall') {
      const icon = new Icon(scene, 0, 34 - d.h / 2 + 4, item.icon ?? '2753', 44, item.outline).setAlpha(item.dim ? 0.4 : 1)
      this.text = new Label(scene, 0, d.h / 2 - 20, item.label ?? '', { kind: d.kind, bold: true }).setOrigin(0.5)
      this.tabW = width ?? 150
      this.text.fit(this.tabW - 12)
      this.add([icon, this.text])
      if (item.badge) this.add(new Icon(scene, this.tabW / 2 - 18, -d.h / 2 + 18, item.badge, 24))
    } else {
      this.text = new RichLabel(scene, 0, 0, item.label ?? '', { kind: d.kind, bold: true, originX: 0.5 })
      this.tabW = width ?? Math.round(this.text.spanWidth + d.pad * 2)
      if (width !== undefined) this.text.setScale(Math.min(1, (width - 16) / this.text.spanWidth))
      this.add(this.text)
    }
    this.paint()
    pressable(this, {
      shape: new Phaser.Geom.Rectangle(-this.tabW / 2, -d.h / 2, this.tabW, d.h + SHAPE.drop),
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
    const d = DIMS[this.size]
    const lift = this.chosen ? 0 : 2
    const tone = TONE.accent
    drawBlock(this.bg.clear(), -this.tabW / 2, -d.h / 2 + lift, this.tabW, d.h, {
      face: this.chosen ? tone.face : SURFACE.raisedHi,
      lip: this.chosen ? tone.lip : undefined,
      lipH: 4,
      drop: this.chosen ? SHAPE.drop - 1 : 2,
      radius: d.radius,
      gloss: this.chosen ? 0.35 : 0,
    })
    this.text.setInk(this.chosen ? tone.on : 'soft')
    this.text.setY((this.size === 'tall' ? d.h / 2 - 20 : this.chosen ? -2 : 0) + lift)
  }
}

/** 一排页签；row 给出整排的左端、中线与宽度，放不下时横向滚动 */
export class Tabs<K> {
  private readonly tabs: Tab<K>[] = []
  private readonly holder: Widget
  private readonly scroller?: ScrollView
  private readonly onSelect: (key: K) => void

  constructor(scene: Phaser.Scene, row: { readonly x: number; readonly y: number; readonly w: number }, opts: TabsOptions<K>) {
    this.onSelect = opts.onSelect
    const size = opts.size ?? 'md'
    const h = DIMS[size].h
    this.holder = new Widget(scene)
    for (const item of opts.items) {
      const tab: Tab<K> = new Tab(scene, item, size, opts.tabWidth, () => this.pick(tab.key))
      this.tabs.push(tab)
    }
    const total = this.tabs.reduce((s, t) => s + t.tabW, 0) + GAP * Math.max(0, this.tabs.length - 1)
    const pad = 6
    if (total > row.w) {
      const scroller = new ScrollView(scene, { x: row.x, y: row.y - h / 2 - pad, w: row.w, h: h + SHAPE.drop + pad * 2 }, { axis: 'x', scrollbar: false })
      let x = pad
      for (const t of this.tabs) {
        t.setPosition(x + t.tabW / 2, h / 2 + pad)
        x += t.tabW + GAP
      }
      scroller.add(this.tabs).setContentSize(x - GAP + pad)
      this.scroller = scroller
      if (opts.depth !== undefined) scroller.setDepth(opts.depth)
    } else {
      let x = row.x + (row.w - total) / 2
      for (const t of this.tabs) {
        t.setPosition(x + t.tabW / 2, row.y)
        x += t.tabW + GAP
      }
      this.holder.add(this.tabs)
      if (opts.depth !== undefined) this.holder.setDepth(opts.depth)
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
