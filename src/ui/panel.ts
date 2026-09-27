import Phaser from 'phaser'
import { viewport } from '../util/apply'
import { drawBlock } from './draw'
import { pressable } from './gesture'
import { SCRIM_ALPHA, SHAPE, SURFACE, TONE } from './theme'
import type { Tone } from './theme'
import { Widget } from './widget'

/** card 是凸起的卡片，well 是凹下去的列表底，dialog 是弹窗 */
export type PanelVariant = 'card' | 'well' | 'dialog'

export interface PanelOptions {
  readonly variant?: PanelVariant
  /** 描边改用某个色调，例如稀有度 */
  readonly tone?: Tone | null
  readonly radius?: number
}

/** 面板；(x, y) 是左上角，子对象用面板内的局部坐标 */
export class Panel extends Widget {
  private readonly bg: Phaser.GameObjects.Graphics
  private readonly boxW: number
  private readonly boxH: number
  private readonly opts: PanelOptions
  private tone: Tone | null

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number, opts: PanelOptions = {}) {
    super(scene, x, y)
    this.boxW = width
    this.boxH = height
    this.opts = opts
    this.tone = opts.tone ?? null
    this.bg = scene.add.graphics()
    this.add(this.bg)
    this.paint()
  }

  get panelWidth(): number {
    return this.boxW
  }

  get panelHeight(): number {
    return this.boxH
  }

  setTone(tone: Tone | null): this {
    this.tone = tone
    this.paint()
    return this
  }

  private paint(): void {
    const g = this.bg.clear()
    const { boxW: w, boxH: h } = this
    const variant = this.opts.variant ?? 'card'
    const line = this.tone ? TONE[this.tone].face : SURFACE.outline
    if (variant === 'well') {
      const r = this.opts.radius ?? SHAPE.radius.md
      drawBlock(g, 0, 0, w, h, { face: SURFACE.sunken, radius: r, line: null })
      g.fillStyle(0x000000, 0.22)
      g.fillRoundedRect(0, 0, w, Math.min(8, h / 2), { tl: r, tr: r, bl: 0, br: 0 })
      g.lineStyle(SHAPE.line - 1, line, 1)
      g.strokeRoundedRect(0, 0, w, h, r)
      return
    }
    const r = this.opts.radius ?? (variant === 'dialog' ? SHAPE.radius.lg : SHAPE.radius.md + 2)
    drawBlock(g, 0, 0, w, h, { face: SURFACE.raised, radius: r, drop: variant === 'dialog' ? 8 : SHAPE.drop, line })
    g.lineStyle(2, 0xffffff, 0.07)
    g.lineBetween(r, 4, w - r, 4)
  }
}

/** 分隔线；(x, y) 是起点 */
export class Divider extends Widget {
  constructor(scene: Phaser.Scene, x: number, y: number, length: number, vertical = false) {
    super(scene, x, y)
    const g = scene.add.graphics()
    g.lineStyle(2, SURFACE.outline, 1)
    if (vertical) g.lineBetween(0, 0, 0, length)
    else g.lineBetween(0, 0, length, 0)
    g.lineStyle(1, 0xffffff, 0.06)
    if (vertical) g.lineBetween(2, 0, 2, length)
    else g.lineBetween(0, 2, length, 2)
    this.add(g)
  }
}

/** 色块：显示数据里的任意颜色；(x, y) 是中心 */
export class Swatch extends Widget {
  constructor(scene: Phaser.Scene, x: number, y: number, size: number, color: number) {
    super(scene, x, y)
    const g = scene.add.graphics()
    drawBlock(g, -size / 2, -size / 2, size, size, { face: color, radius: 5, lineW: 2 })
    this.add(g)
  }
}

export interface ScrimOptions {
  readonly depth: number
  readonly alpha?: number
  /** 点遮罩的回调；不给就只拦截输入 */
  readonly onTap?: () => void
  /** 为假时只压暗不拦输入：下层场景已经停住，遮罩上的滚动区照常拖动 */
  readonly block?: boolean
}

/** 全屏压暗，默认拦住下层输入 */
export class Scrim extends Widget {
  constructor(scene: Phaser.Scene, opts: ScrimOptions) {
    super(scene, viewport.logicalWidth / 2, viewport.logicalHeight / 2)
    const size = 6000
    const rect = scene.add.rectangle(0, 0, size, size, SURFACE.outline, opts.alpha ?? SCRIM_ALPHA)
    this.add(rect)
    this.setDepth(opts.depth)
    if (opts.block === false) return
    const onTap = opts.onTap
    pressable(this, {
      shape: new Phaser.Geom.Rectangle(-size / 2, -size / 2, size, size),
      onTap: () => onTap?.(),
      sfx: null,
    })
    this.input!.cursor = onTap ? 'pointer' : 'default'
  }
}
