import Phaser from 'phaser'
import type { OutlineKind } from '../emoji/outline'
import { drawBlock } from './draw'
import { pressable } from './gesture'
import { Icon } from './icon'
import { Label } from './label'
import { SHAPE, SURFACE, TONE } from './theme'
import { Widget } from './widget'

export interface TreeRowOptions {
  /** 第几层，从 0 算；每深一层往右缩进 */
  readonly depth: number
  readonly title: string
  readonly icon?: string
  readonly outline?: OutlineKind
  /** 标题后面的淡色说明 */
  readonly meta?: string
  readonly selected?: boolean
  /** 右端的小图标，例如这一项有问题 */
  readonly badge?: string
  readonly onTap: () => void
}

const INDENT = 26
const ICON = 32

/** 树形列表的一行：按层级缩进，图标、标题与淡色说明，选中的一行描边高亮；(x, y) 是左上角 */
export class TreeRow extends Widget {
  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number, opts: TreeRowOptions) {
    super(scene, x, y)
    const bg = scene.add.graphics()
    drawBlock(bg, 0, 0, width, height, {
      face: opts.selected ? SURFACE.raisedHi : SURFACE.raised,
      line: opts.selected ? TONE.accent.face : undefined,
      lineW: opts.selected ? 3 : 2,
      drop: opts.selected ? 3 : 2,
      radius: SHAPE.radius.sm + 2,
    })
    this.add(bg)
    const mid = height / 2
    let left = 12 + opts.depth * INDENT
    if (opts.icon) {
      this.add(new Icon(scene, left + ICON / 2, mid, opts.icon, ICON, opts.outline))
      left += ICON + 10
    }
    const right = width - (opts.badge ? ICON + 18 : 12)
    const title = new Label(scene, left, mid, opts.title, { kind: 'label', bold: true, color: opts.selected ? 'accent' : 'ink' }).setOrigin(0, 0.5).fit(right - left)
    this.add(title)
    const metaX = left + title.displayWidth + 10
    if (opts.meta && metaX < right - 24) {
      this.add(new Label(scene, metaX, mid, opts.meta, { kind: 'caption', color: 'muted' }).setOrigin(0, 0.5).fit(right - metaX))
    }
    if (opts.badge) this.add(new Icon(scene, width - 10 - ICON / 2, mid, opts.badge, ICON - 4))
    pressable(this, { shape: new Phaser.Geom.Rectangle(0, 0, width, height + 2), onTap: opts.onTap })
  }
}
