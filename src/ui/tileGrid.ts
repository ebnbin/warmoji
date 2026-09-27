import Phaser from 'phaser'
import type { OutlineKind } from '../emoji/svg'
import { drawBlock } from './draw'
import { pressable } from './gesture'
import type { Rect } from './gesture'
import { Icon } from './icon'
import { Label } from './label'
import { Panel } from './panel'
import { ScrollView } from './scrollView'
import { SHAPE, SURFACE, TONE } from './theme'
import { Widget } from './widget'

export interface TileItem<K> {
  readonly key: K
  readonly emoji: string
  readonly outline?: OutlineKind
  readonly title: string
  /** 名字下面的一排小图标 */
  readonly icons?: readonly string[]
  /** 右上角的小图标 */
  readonly badge?: string
  readonly dim?: boolean
}

export interface TileGridOptions {
  /** 每格至少这么宽，放得下就多排几列，余量均分 */
  readonly minWidth?: number
  readonly height?: number
  readonly initialScroll?: number
  readonly onScroll?: (pos: number) => void
}

const GAP = 10
/** 选中的格子抬起、描边外扩，内容四周留出这点余量免得被裁掉 */
const INSET = 6
const FRAME = 10
const ICON = 20

class Tile<K> extends Widget {
  readonly key: K
  private readonly bg: Phaser.GameObjects.Graphics
  private readonly face: Widget
  private readonly tileW: number
  private readonly tileH: number
  private chosen = false

  constructor(scene: Phaser.Scene, item: TileItem<K>, w: number, h: number, onTap: () => void) {
    super(scene)
    this.key = item.key
    this.tileW = w
    this.tileH = h
    this.bg = scene.add.graphics()
    this.face = new Widget(scene)
    const avatar = Math.min(64, h - 76)
    const alpha = item.dim ? 0.45 : 1
    this.face.add(new Icon(scene, w / 2, 12 + avatar / 2, item.emoji, avatar, item.outline).setAlpha(alpha))
    if (item.badge) this.face.add(new Icon(scene, w - 18, 18, item.badge, 28))
    this.face.add(new Label(scene, w / 2, 12 + avatar + 18, item.title, { kind: 'label', bold: true, color: item.dim ? 'muted' : 'ink' }).setOrigin(0.5).fit(w - 12))
    const icons = item.icons ?? []
    const span = icons.length * ICON + Math.max(0, icons.length - 1) * 2
    icons.forEach((id, i) => this.face.add(new Icon(scene, (w - span) / 2 + ICON / 2 + i * (ICON + 2), h - 20, id, ICON).setAlpha(alpha)))
    this.add([this.bg, this.face])
    this.paint()
    pressable(this, { shape: new Phaser.Geom.Rectangle(0, 0, w, h + 3), onTap })
  }

  setChosen(chosen: boolean): void {
    if (chosen === this.chosen) return
    this.chosen = chosen
    this.paint()
  }

  private paint(): void {
    const lift = this.chosen ? -2 : 0
    drawBlock(this.bg.clear(), 0, lift, this.tileW, this.tileH, {
      face: this.chosen ? SURFACE.raisedHi : SURFACE.raised,
      line: this.chosen ? TONE.accent.face : undefined,
      lineW: this.chosen ? 4 : SHAPE.line,
      drop: this.chosen ? SHAPE.drop : 3,
      radius: SHAPE.radius.md,
    })
    this.face.setY(lift)
  }
}

/** 图块网格：凹底框里一格一个条目，大图标、名字与一排小图标；放不下就纵向滚动 */
export class TileGrid<K> {
  onTap?: (key: K) => void

  private readonly scene: Phaser.Scene
  private readonly view: ScrollView
  private readonly cols: number
  private readonly tileW: number
  private readonly tileH: number
  private tiles: Tile<K>[] = []
  private selected: K | null = null

  /** rect 是凹底框的外沿 */
  constructor(scene: Phaser.Scene, rect: Rect, opts: TileGridOptions = {}) {
    this.scene = scene
    new Panel(scene, rect.x, rect.y, rect.w, rect.h, { variant: 'well' })
    const inner = { x: rect.x + FRAME, y: rect.y + FRAME, w: rect.w - FRAME * 2, h: rect.h - FRAME * 2 }
    const usable = inner.w - INSET * 2
    const minW = opts.minWidth ?? 120
    this.cols = Math.max(1, Math.floor((usable + GAP) / (minW + GAP)))
    this.tileW = (usable - GAP * (this.cols - 1)) / this.cols
    this.tileH = opts.height ?? 140
    this.view = new ScrollView(scene, inner, { initial: opts.initialScroll, onScroll: opts.onScroll })
  }

  get scrollY(): number {
    return this.view.scroll
  }

  setItems(items: readonly TileItem<K>[]): void {
    const keep = this.view.scroll
    this.view.clear()
    this.tiles = items.map((item, i) => {
      const tile: Tile<K> = new Tile(this.scene, item, this.tileW, this.tileH, () => this.onTap?.(tile.key))
      tile.setPosition(INSET + (i % this.cols) * (this.tileW + GAP), INSET + Math.floor(i / this.cols) * (this.tileH + GAP))
      tile.setChosen(item.key === this.selected)
      return tile
    })
    this.view.add(this.tiles)
    const rows = Math.ceil(items.length / this.cols)
    this.view.setContentSize(rows > 0 ? INSET * 2 + rows * (this.tileH + GAP) - GAP + SHAPE.drop : 0)
    this.view.scrollTo(keep)
  }

  setSelected(key: K | null): void {
    this.selected = key
    for (const t of this.tiles) t.setChosen(t.key === key)
  }

  scrollTo(pos: number): void {
    this.view.scrollTo(pos)
  }

  /** 让这一格整格露出来 */
  reveal(key: K): void {
    const i = this.tiles.findIndex((t) => t.key === key)
    if (i < 0) return
    this.view.reveal(Math.floor(i / this.cols) * (this.tileH + GAP), this.tileH + INSET * 2)
  }
}
