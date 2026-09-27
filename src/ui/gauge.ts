import type Phaser from 'phaser'
import { strokeArc } from './draw'
import { SURFACE, TONE } from './theme'
import type { Tone } from './theme'
import { Widget } from './widget'

/** hp 按比例在绿、橙、红之间取色 */
export type GaugeTone = Tone | 'hp'

function toneFace(tone: GaugeTone, value: number): number {
  if (tone !== 'hp') return TONE[tone].face
  return TONE[value > 0.5 ? 'good' : value > 0.25 ? 'warn' : 'bad'].face
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

export interface GaugeOptions {
  readonly tone: GaugeTone
  readonly value?: number
}

/** 进度条；(x, y) 是左上角 */
export class ProgressBar extends Widget {
  private readonly g: Phaser.GameObjects.Graphics
  private readonly barW: number
  private readonly barH: number
  private tone: GaugeTone
  private shown = -1

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number, opts: GaugeOptions) {
    super(scene, x, y)
    this.barW = width
    this.barH = height
    this.tone = opts.tone
    this.g = scene.add.graphics()
    this.add(this.g)
    this.setValue(opts.value ?? 0)
  }

  setValue(value: number): this {
    const v = clamp01(value)
    if (Math.abs(v - this.shown) < 0.002) return this
    this.shown = v
    const { barW: w, barH: h } = this
    const g = this.g.clear()
    g.fillStyle(SURFACE.outline, 1)
    g.fillRoundedRect(0, 0, w, h, h / 2)
    if (v <= 0) return this
    const inset = Math.max(2, Math.round(h * 0.18))
    const ih = h - inset * 2
    const fw = Math.max(ih, (w - inset * 2) * v)
    g.fillStyle(toneFace(this.tone, v), 1)
    g.fillRoundedRect(inset, inset, fw, ih, ih / 2)
    if (ih >= 6) {
      g.fillStyle(0xffffff, 0.3)
      g.fillRoundedRect(inset + ih / 3, inset + 1, Math.max(0, fw - (ih * 2) / 3), Math.max(2, ih * 0.3), 1)
    }
    return this
  }

  setTone(tone: GaugeTone): this {
    if (tone === this.tone) return this
    this.tone = tone
    const v = this.shown
    this.shown = -1
    return this.setValue(v)
  }
}

export interface RingOptions extends GaugeOptions {
  readonly thickness?: number
}

/** 环形表：从十二点顺时针；(x, y) 是圆心 */
export class RingGauge extends Widget {
  private readonly g: Phaser.GameObjects.Graphics
  private readonly radius: number
  private readonly thickness: number
  private readonly tone: GaugeTone
  private shown = -1

  constructor(scene: Phaser.Scene, x: number, y: number, radius: number, opts: RingOptions) {
    super(scene, x, y)
    this.radius = radius
    this.thickness = opts.thickness ?? 5
    this.tone = opts.tone
    this.g = scene.add.graphics()
    this.add(this.g)
    this.setValue(opts.value ?? 0)
  }

  setValue(value: number): this {
    const v = clamp01(value)
    if (Math.abs(v - this.shown) < 0.004) return this
    this.shown = v
    const g = this.g.clear()
    g.lineStyle(this.thickness + 3, SURFACE.outline, 0.75)
    g.strokeCircle(0, 0, this.radius)
    g.lineStyle(this.thickness, toneFace(this.tone, v), 1)
    strokeArc(g, 0, 0, this.radius, v)
    return this
  }
}

/** 冷却扇形：剩余部分压暗，从十二点顺时针收拢；(x, y) 是圆心 */
export class CooldownPie extends Widget {
  private readonly g: Phaser.GameObjects.Graphics
  private readonly radius: number

  constructor(scene: Phaser.Scene, x: number, y: number, radius: number) {
    super(scene, x, y)
    this.radius = radius
    this.g = scene.add.graphics()
    this.add(this.g)
  }

  setValue(ratio: number): this {
    const g = this.g.clear()
    const v = clamp01(ratio)
    if (v <= 0) return this
    g.fillStyle(SURFACE.outline, 0.62)
    g.slice(0, 0, this.radius, -Math.PI / 2, -Math.PI / 2 + v * Math.PI * 2, false)
    g.fillPath()
    return this
  }
}
