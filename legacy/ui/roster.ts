import Phaser from 'phaser'
import type { OutlineKind } from '../emoji/outline'
import { drawBlock } from './draw'
import { ProgressBar } from './gauge'
import { pressable } from './gesture'
import type { Rect } from './gesture'
import { Icon } from './icon'
import { Label } from './label'
import { Panel } from './panel'
import { ScrollView } from './scrollView'
import { SHAPE, SURFACE, TONE } from './theme'
import type { TextColor } from './theme'
import { Widget } from './widget'

export interface RosterItem<K> {
  readonly key: K
  readonly emoji: string
  readonly outline?: OutlineKind
  /** 头像右上角的小图标 */
  readonly badge?: string
  readonly title: string
  /** 标题行右端的短字 */
  readonly aside?: string
  readonly asideColor?: TextColor
  /** 0 到 1 的血量条；不给就不画 */
  readonly hp?: number
  readonly dim?: boolean
}

const ROW_H = 78
const GAP = 8
/** 一行至少这么宽，放得下就并排成多列 */
const MIN_ROW_W = 300
/** 选中的行抬起、描边外扩，内容四周留出这点余量免得被裁掉 */
const INSET = 6
const FRAME = 10
const AVATAR = 56
const TEXT_X = 84

class RosterRow<K> extends Widget {
  readonly key: K
  private readonly bg: Phaser.GameObjects.Graphics
  private readonly face: Widget
  private readonly rowW: number
  private chosen = false

  constructor(scene: Phaser.Scene, item: RosterItem<K>, width: number, onTap: () => void) {
    super(scene)
    this.key = item.key
    this.rowW = width
    this.bg = scene.add.graphics()
    this.face = new Widget(scene)
    const midY = item.hp === undefined ? ROW_H / 2 : 27
    this.face.add(new Icon(scene, 12 + AVATAR / 2, ROW_H / 2, item.emoji, AVATAR, item.outline).setAlpha(item.dim ? 0.45 : 1))
    if (item.badge) this.face.add(new Icon(scene, 12 + AVATAR - 2, 16, item.badge, 26))
    let room = width - TEXT_X - 14
    if (item.aside) {
      const aside = new Label(scene, width - 14, midY, item.aside, { kind: 'label', bold: true, color: item.asideColor ?? 'soft' }).setOrigin(1, 0.5)
      this.face.add(aside)
      room -= aside.width + 10
    }
    this.face.add(new Label(scene, TEXT_X, midY, item.title, { kind: 'body', bold: true, color: item.dim ? 'muted' : 'ink' }).setOrigin(0, 0.5).fit(room))
    if (item.hp !== undefined) this.face.add(new ProgressBar(scene, TEXT_X, 48, width - TEXT_X - 14, 12, { tone: 'hp', value: item.hp }))
    this.add([this.bg, this.face])
    this.paint()
    pressable(this, { shape: new Phaser.Geom.Rectangle(0, 0, width, ROW_H + 3), onTap })
  }

  setChosen(chosen: boolean): void {
    if (chosen === this.chosen) return
    this.chosen = chosen
    this.paint()
  }

  private paint(): void {
    const lift = this.chosen ? -2 : 0
    drawBlock(this.bg.clear(), 0, lift, this.rowW, ROW_H, {
      face: this.chosen ? SURFACE.raisedHi : SURFACE.raised,
      line: this.chosen ? TONE.accent.face : undefined,
      lineW: this.chosen ? 4 : SHAPE.line,
      drop: this.chosen ? SHAPE.drop : 3,
      radius: SHAPE.radius.md,
    })
    this.face.setY(lift)
  }
}

/** 名单：凹底框里一行一名成员，头像、名字、右端短字与血量条；框够宽就排成多列，放不下纵向滚动 */
export class RosterList<K> {
  onTap?: (key: K) => void

  private readonly scene: Phaser.Scene
  private readonly view: ScrollView
  private readonly cols: number
  private readonly rowW: number
  private rows: RosterRow<K>[] = []
  private selected: K | null = null

  /** rect 是凹底框的外沿 */
  constructor(scene: Phaser.Scene, rect: Rect) {
    this.scene = scene
    new Panel(scene, rect.x, rect.y, rect.w, rect.h, { variant: 'well' })
    const inner = { x: rect.x + FRAME, y: rect.y + FRAME, w: rect.w - FRAME * 2, h: rect.h - FRAME * 2 }
    const usable = inner.w - INSET * 2
    this.cols = Math.max(1, Math.floor((usable + GAP) / (MIN_ROW_W + GAP)))
    this.rowW = (usable - GAP * (this.cols - 1)) / this.cols
    this.view = new ScrollView(scene, inner)
  }

  setItems(items: readonly RosterItem<K>[]): void {
    this.view.clear()
    this.rows = items.map((item, i) => {
      const row: RosterRow<K> = new RosterRow(this.scene, item, this.rowW, () => this.onTap?.(row.key))
      row.setPosition(INSET + (i % this.cols) * (this.rowW + GAP), INSET + Math.floor(i / this.cols) * (ROW_H + GAP))
      row.setChosen(item.key === this.selected)
      return row
    })
    this.view.add(this.rows)
    const lines = Math.ceil(items.length / this.cols)
    this.view.setContentSize(lines > 0 ? INSET * 2 + lines * (ROW_H + GAP) - GAP + SHAPE.drop : 0)
  }

  setSelected(key: K | null): void {
    this.selected = key
    for (const r of this.rows) r.setChosen(r.key === key)
  }
}
