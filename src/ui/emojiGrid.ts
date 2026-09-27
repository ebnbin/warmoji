import Phaser from 'phaser'
import type { OutlineKind } from '../emoji/svg'
import { drawBlock } from './draw'
import { pressable } from './gesture'
import type { Rect } from './gesture'
import { ProgressBar } from './gauge'
import { Icon } from './icon'
import { Panel } from './panel'
import { ScrollView } from './scrollView'
import { SHAPE, SURFACE, TONE } from './theme'
import { Widget } from './widget'

export interface GridItem<K> {
  readonly key: K
  readonly emoji: string
  readonly outline?: OutlineKind
  /** 右上角的小图标 */
  readonly badge?: string
  /** 0 到 1 的血量条 */
  readonly hp?: number
  readonly dim?: boolean
}

export interface GridOptions {
  readonly cell?: number
  readonly initialScroll?: number
  readonly onScroll?: (pos: number) => void
}

const GAP = 12
/** 选中的格子抬起、描边外扩，内容四周留出这点余量免得被裁掉 */
const INSET = 6
const FRAME = 10

class Cell<K> extends Widget {
  readonly key: K
  private readonly bg: Phaser.GameObjects.Graphics
  private readonly face: Widget
  private readonly side: number
  private chosen = false

  constructor(scene: Phaser.Scene, item: GridItem<K>, side: number, onTap: () => void) {
    super(scene)
    this.key = item.key
    this.side = side
    this.bg = scene.add.graphics()
    this.face = new Widget(scene)
    const iconY = side / 2 - (item.hp !== undefined ? 5 : 0)
    this.face.add(new Icon(scene, side / 2, iconY, item.emoji, side - 14, item.outline).setAlpha(item.dim ? 0.45 : 1))
    if (item.badge) this.face.add(new Icon(scene, side - 18, 18, item.badge, 32))
    if (item.hp !== undefined) this.face.add(new ProgressBar(scene, 12, side - 20, side - 24, 10, { tone: 'hp', value: item.hp }))
    this.add([this.bg, this.face])
    this.paint()
    pressable(this, { shape: new Phaser.Geom.Rectangle(0, 0, side, side + 3), onTap })
  }

  setChosen(chosen: boolean): void {
    if (chosen === this.chosen) return
    this.chosen = chosen
    this.paint()
  }

  private paint(): void {
    const lift = this.chosen ? -2 : 0
    drawBlock(this.bg.clear(), 0, lift, this.side, this.side, {
      face: this.chosen ? SURFACE.raisedHi : SURFACE.raised,
      line: this.chosen ? TONE.accent.face : undefined,
      lineW: this.chosen ? 4 : SHAPE.line,
      drop: this.chosen ? SHAPE.drop : 3,
      radius: SHAPE.radius.md,
    })
    this.face.setY(lift)
  }
}

/** emoji 网格：凹底框里一格一个条目，放不下就纵向滚动 */
export class EmojiGrid<K> {
  onTap?: (key: K) => void

  private readonly scene: Phaser.Scene
  private readonly view: ScrollView
  private readonly side: number
  private readonly cols: number
  private readonly left: number
  private cells: Cell<K>[] = []
  private selected: K | null = null

  /** rect 是凹底框的外沿 */
  constructor(scene: Phaser.Scene, rect: Rect, opts: GridOptions = {}) {
    this.scene = scene
    new Panel(scene, rect.x, rect.y, rect.w, rect.h, { variant: 'well' })
    const inner = { x: rect.x + FRAME, y: rect.y + FRAME, w: rect.w - FRAME * 2, h: rect.h - FRAME * 2 }
    this.side = opts.cell ?? 96
    const usable = inner.w - INSET * 2
    this.cols = Math.max(1, Math.floor((usable + GAP) / (this.side + GAP)))
    this.left = INSET + (usable - (this.cols * (this.side + GAP) - GAP)) / 2
    this.view = new ScrollView(scene, inner, { initial: opts.initialScroll, onScroll: opts.onScroll })
  }

  get scrollY(): number {
    return this.view.scroll
  }

  setItems(items: readonly GridItem<K>[]): void {
    const keep = this.view.scroll
    this.view.clear()
    const pitch = this.side + GAP
    this.cells = items.map((item, i) => {
      const cell: Cell<K> = new Cell(this.scene, item, this.side, () => this.onTap?.(cell.key))
      cell.setPosition(this.left + (i % this.cols) * pitch, INSET + Math.floor(i / this.cols) * pitch)
      cell.setChosen(item.key === this.selected)
      return cell
    })
    this.view.add(this.cells)
    const rows = Math.ceil(items.length / this.cols)
    this.view.setContentSize(rows > 0 ? INSET * 2 + rows * pitch - GAP + SHAPE.drop : 0)
    this.view.scrollTo(keep)
  }

  setSelected(key: K | null): void {
    this.selected = key
    for (const c of this.cells) c.setChosen(c.key === key)
  }
}
