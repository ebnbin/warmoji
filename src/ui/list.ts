import Phaser from 'phaser'
import { drawBlock } from './draw'
import { pressable } from './gesture'
import { Icon } from './icon'
import { Label } from './label'
import { SHAPE, SURFACE } from './theme'
import { Widget } from './widget'

export interface ListItemOptions {
  readonly icon: string
  readonly title: string
  readonly desc?: string
  /** 放在右侧居中的控件，例如开关 */
  readonly trailing?: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject
  readonly trailingWidth?: number
  readonly onTap?: () => void
}

/** 列表行：左图标，标题与说明，右侧可挂一个控件；整行可点 */
export class ListItem extends Widget {
  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number, opts: ListItemOptions) {
    super(scene, x, y)
    const bg = scene.add.graphics()
    drawBlock(bg, 0, 0, width, height, { face: SURFACE.raised, radius: SHAPE.radius.md, drop: 4 })
    const trailW = opts.trailing ? (opts.trailingWidth ?? 84) + 24 : 0
    const textX = 96
    const title = new Label(scene, textX, opts.desc ? height / 2 - 18 : height / 2, opts.title, { kind: 'heading' }).setOrigin(0, 0.5)
    this.add([bg, new Icon(scene, 50, height / 2, opts.icon, 58), title])
    if (opts.desc) {
      this.add(new Label(scene, textX, height / 2 + 2, opts.desc, { kind: 'label', color: 'muted', wrap: width - textX - trailW - 20 }))
    }
    if (opts.trailing) {
      opts.trailing.setPosition(width - 24 - (opts.trailingWidth ?? 84) / 2, height / 2)
      this.add(opts.trailing)
    }
    if (opts.onTap) pressable(this, { shape: new Phaser.Geom.Rectangle(0, 0, width, height + 4), onTap: opts.onTap, sfx: null })
  }
}

export interface KeyValue {
  readonly key: string
  readonly value: string
  /** 与常驻值不同：数值高亮，旁边附上 note */
  readonly highlight?: boolean
  readonly note?: string
}

const ROW_H = 46

/** 键值表：斑马纹，一列或两列；(x, y) 是左上角 */
export class KeyValueList extends Widget {
  readonly listHeight: number

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, rows: readonly KeyValue[], columns: 1 | 2 = 1) {
    super(scene, x, y)
    const gap = 24
    const colW = (width - gap * (columns - 1)) / columns
    const perCol = Math.ceil(rows.length / columns)
    const zebra = scene.add.graphics()
    this.add(zebra)
    rows.forEach((r, i) => {
      const cx = Math.floor(i / perCol) * (colW + gap)
      const row = i % perCol
      const cy = row * ROW_H + ROW_H / 2
      if (row % 2 === 0) {
        zebra.fillStyle(SURFACE.raisedHi, 0.7)
        zebra.fillRoundedRect(cx, cy - ROW_H / 2, colW, ROW_H, SHAPE.radius.sm)
      }
      const value = new Label(scene, cx + colW - 14, cy, r.value, { kind: 'body', bold: true, color: r.highlight ? 'warn' : 'ink' }).setOrigin(1, 0.5)
      this.add([new Label(scene, cx + 14, cy, r.key, { kind: 'body', color: 'soft' }).setOrigin(0, 0.5), value])
      if (r.note) this.add(new Label(scene, value.x - value.width - 12, cy, r.note, { kind: 'caption', color: 'faint' }).setOrigin(1, 0.5))
    })
    this.listHeight = perCol * ROW_H
  }
}
