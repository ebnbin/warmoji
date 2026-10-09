import Phaser from 'phaser'
import { drawBlock } from './draw'
import { pressable } from './gesture'
import { RichLabel } from './label'
import { SHAPE, SURFACE, TONE } from './theme'
import { Widget } from './widget'

export interface SegmentItem<K> {
  readonly key: K
  /** 可含 {emoji} 占位 */
  readonly label: string
}

export interface SegmentedOptions<K> {
  readonly width: number
  readonly items: readonly SegmentItem<K>[]
  readonly selected: K
  readonly onSelect: (key: K) => void
}

const H = 46
const INSET = 4

/** 分段选择：一条凹槽等分成几段，选中的一段凸起；(x, y) 是中心 */
export class Segmented<K> extends Widget {
  private readonly bg: Phaser.GameObjects.Graphics
  private readonly labels: RichLabel[]
  private readonly opts: SegmentedOptions<K>
  private readonly segW: number
  private chosen: K

  constructor(scene: Phaser.Scene, x: number, y: number, opts: SegmentedOptions<K>) {
    super(scene, x, y)
    this.opts = opts
    this.chosen = opts.selected
    this.segW = (opts.width - INSET * 2) / Math.max(1, opts.items.length)
    this.bg = scene.add.graphics()
    this.add(this.bg)
    this.labels = opts.items.map((item, i) => {
      const cx = this.segX(i)
      const label = new RichLabel(scene, cx, -1, item.label, { kind: 'label', bold: true, originX: 0.5, maxWidth: this.segW - 12 })
      const zone = new Widget(scene, cx, 0)
      pressable(zone, {
        shape: new Phaser.Geom.Rectangle(-this.segW / 2, -H / 2, this.segW, H),
        onTap: () => this.pick(item.key),
      })
      this.add([label, zone])
      return label
    })
    this.paint()
  }

  private segX(i: number): number {
    return -this.opts.width / 2 + INSET + this.segW * (i + 0.5)
  }

  private pick(key: K): void {
    if (key === this.chosen) return
    this.chosen = key
    this.paint()
    this.opts.onSelect(key)
  }

  private paint(): void {
    const w = this.opts.width
    const g = this.bg.clear()
    drawBlock(g, -w / 2, -H / 2, w, H, { face: SURFACE.sunken, radius: SHAPE.radius.sm + 2 })
    const at = this.opts.items.findIndex((it) => it.key === this.chosen)
    if (at >= 0) {
      const tone = TONE.accent
      drawBlock(g, this.segX(at) - this.segW / 2, -H / 2 + INSET, this.segW, H - INSET * 2 - 2, {
        face: tone.face,
        lip: tone.lip,
        lipH: 4,
        drop: 2,
        radius: SHAPE.radius.sm,
        gloss: 0.3,
      })
    }
    this.labels.forEach((l, i) => l.setInk(i === at ? TONE.accent.on : 'soft'))
  }
}
