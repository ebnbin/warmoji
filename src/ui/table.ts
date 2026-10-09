import type Phaser from 'phaser'
import type { OutlineKind } from '../emoji/outline'
import type { Rect } from './gesture'
import { Icon } from './icon'
import { Label, RichLabel } from './label'
import { Panel } from './panel'
import { ScrollView } from './scrollView'
import { SURFACE } from './theme'
import type { TextColor } from './theme'

export interface TableColumn {
  readonly label: string
  /** 列中心在表宽里的比例 */
  readonly at: number
}

export type TableCell =
  | string
  | { readonly text: string; readonly color?: TextColor; readonly bold?: boolean }
  | { readonly icons: readonly { readonly id: string; readonly count?: number }[]; readonly more?: number }

export interface TableRow {
  readonly icon?: string
  readonly outline?: OutlineKind
  readonly name: string
  readonly nameColor?: TextColor
  readonly cells: readonly TableCell[]
}

export interface TableOptions {
  /** 可含 {emoji} 占位 */
  readonly title?: string
  /** 标题行右侧的附注，可含 {emoji} 占位 */
  readonly aside?: string
  readonly asideColor?: TextColor
  readonly columns: readonly TableColumn[]
  readonly rows: readonly TableRow[]
  readonly rowH?: number
  readonly nameBold?: boolean
  /** 没有行时居中显示 */
  readonly empty?: string
}

/** 卡片里的数据表：可选标题行，列头，行可滚动；第一列是图标加名字 */
export class Table {
  constructor(scene: Phaser.Scene, rect: Rect, opts: TableOptions) {
    const { x, y, w, h } = rect
    new Panel(scene, x, y, w, h)
    let top = y + 12
    if (opts.title) {
      new RichLabel(scene, x + 22, y + 34, opts.title, { kind: 'heading', originX: 0 })
      if (opts.aside) new RichLabel(scene, x + w - 22, y + 34, opts.aside, { kind: 'label', color: opts.asideColor ?? 'accent', originX: 1 })
      top = y + 58
    }
    if (opts.rows.length === 0) {
      new Label(scene, x + w / 2, (top + y + h) / 2, opts.empty ?? '—', { kind: 'heading', color: 'faint' }).setOrigin(0.5)
      return
    }
    for (const c of opts.columns) {
      new Label(scene, x + w * c.at, top + 18, c.label, { kind: 'label', color: 'muted' }).setOrigin(0.5)
    }
    const rowH = opts.rowH ?? 56
    const bodyTop = top + 40
    const view = new ScrollView(scene, { x: x + 6, y: bodyTop, w: w - 12, h: y + h - bodyTop - 12 })
    const zebra = scene.add.graphics()
    view.add(zebra)
    opts.rows.forEach((row, i) => {
      const cy = i * rowH + rowH / 2
      if (i % 2 === 0) {
        zebra.fillStyle(SURFACE.raisedHi, 0.55)
        zebra.fillRoundedRect(4, i * rowH + 2, w - 20, rowH - 4, 10)
      }
      if (row.icon) view.add(new Icon(scene, 38, cy, row.icon, Math.min(52, rowH - 8), row.outline))
      view.add(
        new Label(scene, row.icon ? 72 : 20, cy, row.name, { kind: 'label', bold: opts.nameBold ?? false, color: row.nameColor ?? 'ink' })
          .setOrigin(0, 0.5)
          .fit(w * (opts.columns[0]?.at ?? 0.5) - 110),
      )
      row.cells.forEach((cell, c) => {
        const col = opts.columns[c]
        if (!col) return
        const cx = w * col.at - 6
        if (typeof cell === 'string') {
          view.add(new Label(scene, cx, cy, cell, { kind: 'body' }).setOrigin(0.5))
        } else if ('text' in cell) {
          view.add(new Label(scene, cx, cy, cell.text, { kind: 'body', color: cell.color, bold: cell.bold }).setOrigin(0.5))
        } else {
          const shown = cell.icons
          shown.forEach((ic, k) => {
            const ix = cx - ((shown.length - 1) / 2 - k) * 38
            view.add(new Icon(scene, ix, cy, ic.id, 34))
            if (ic.count !== undefined && ic.count > 1) {
              view.add(new Label(scene, ix + 13, cy + 11, `${ic.count}`, { kind: 'caption', bold: true, color: 'accent', outline: true }).setOrigin(0.5))
            }
          })
          if (cell.more) view.add(new Label(scene, cx + shown.length * 19 + 18, cy, `+${cell.more}`, { kind: 'caption', color: 'muted' }).setOrigin(0, 0.5))
        }
      })
    })
    view.setContentSize(opts.rows.length * rowH)
  }
}
