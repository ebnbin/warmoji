import Phaser from 'phaser'
import { drawBlock } from './draw'
import { pressable } from './gesture'
import { RichLabel } from './label'
import { SURFACE, TONE } from './theme'
import type { Tone } from './theme'
import { Widget } from './widget'

export interface TagChipOptions {
  /** 可含 {emoji} 占位 */
  readonly label: string
  readonly tone: Tone
  /** 亮着填上色调，灭着是深底配色调字 */
  readonly on?: boolean
  readonly size?: 'sm' | 'md'
  /** 横向锚点：0 左、0.5 中、1 右；纵向以 y 为中线 */
  readonly originX?: number
  /** 给了就是能点的开关 */
  readonly onTap?: () => void
}

const SIZES = {
  sm: { h: 30, kind: 'caption', icon: 22, pad: 12 },
  md: { h: 44, kind: 'label', icon: 28, pad: 16 },
} as const

/** 按下时胶囊下沉的距离 */
const SINK = 2

/** 标签胶囊：可以只是展示，也可以是筛选开关；压暗时只能关、不能开 */
export class TagChip extends Widget {
  readonly chipWidth: number
  private readonly bg: Phaser.GameObjects.Graphics
  private readonly caption: RichLabel
  private readonly dims: (typeof SIZES)[keyof typeof SIZES]
  private readonly tone: Tone
  private readonly left: number
  private lit: boolean
  private dim = false
  private down = false

  constructor(scene: Phaser.Scene, x: number, y: number, opts: TagChipOptions) {
    super(scene, x, y)
    this.dims = SIZES[opts.size ?? 'md']
    this.tone = opts.tone
    this.lit = opts.on ?? false
    this.bg = scene.add.graphics()
    this.caption = new RichLabel(scene, 0, 0, opts.label, { kind: this.dims.kind, bold: true, iconSize: this.dims.icon, gap: 4, originX: 0.5 })
    this.chipWidth = Math.round(this.caption.spanWidth + this.dims.pad * 2)
    this.left = -this.chipWidth * (opts.originX ?? 0.5)
    this.caption.setX(this.left + this.chipWidth / 2)
    this.add([this.bg, this.caption])
    this.paint()
    const onTap = opts.onTap
    if (!onTap) return
    const h = this.dims.h
    pressable(this, {
      shape: new Phaser.Geom.Rectangle(this.left, -h / 2, this.chipWidth, h + 3),
      onTap,
      onPress: (down) => {
        this.down = down
        this.paint()
      },
      enabled: () => this.lit || !this.dim,
    })
  }

  setOn(on: boolean): this {
    if (on === this.lit) return this
    this.lit = on
    this.paint()
    return this
  }

  setDim(dim: boolean): this {
    if (dim === this.dim) return this
    this.dim = dim
    this.paint()
    return this
  }

  private paint(): void {
    const { h } = this.dims
    const spec = TONE[this.tone]
    const sink = this.down ? SINK : 0
    const y = -h / 2 + sink
    const g = this.bg.clear()
    if (this.lit) drawBlock(g, this.left, y, this.chipWidth, h, { face: spec.face, lip: spec.lip, lipH: 4, drop: 3 - sink, radius: h / 2, lineW: 2 })
    else drawBlock(g, this.left, y, this.chipWidth, h, { face: SURFACE.raised, drop: 3 - sink, radius: h / 2, lineW: 2 })
    this.caption.setY(sink - (this.lit ? 2 : 0)).setInk(this.lit ? spec.on : this.tone)
    this.setAlpha(this.dim && !this.lit ? 0.35 : 1)
  }
}
