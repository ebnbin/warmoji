import Phaser from 'phaser'
import { drawBlock, drawDisc } from './draw'
import { grabPointer, pressable } from './gesture'
import { INK, SHAPE, SURFACE, TONE } from './theme'
import { Widget } from './widget'

export interface SliderOptions {
  readonly width: number
  readonly min: number
  readonly max: number
  /** 取值的最小间隔；不给就连续取值 */
  readonly step?: number
  readonly value: number
  /** 拖动中值变了 */
  readonly onInput?: (value: number) => void
  /** 松手时值和按下前不一样 */
  readonly onChange: (value: number) => void
}

const TRACK_H = 12
const KNOB = 17

/** 小数位数：按步长取整后去掉浮点误差 */
function decimals(step: number): number {
  return (String(step).split('.')[1] ?? '').length
}

/** 滑杆：按住拖动或点在杆上取值，拖动时外面的滚动区不跟着滚；(x, y) 是滑杆中心 */
export class Slider extends Widget {
  private readonly track: Phaser.GameObjects.Graphics
  private readonly knob: Phaser.GameObjects.Graphics
  private readonly opts: SliderOptions
  /** 滑块圆心能走的长度 */
  private readonly span: number
  private current: number
  private release?: () => void

  constructor(scene: Phaser.Scene, x: number, y: number, opts: SliderOptions) {
    super(scene, x, y)
    this.opts = opts
    this.span = opts.width - KNOB * 2
    this.current = this.snap(opts.value)
    this.track = scene.add.graphics()
    this.knob = scene.add.graphics()
    drawDisc(this.knob, 0, 0, KNOB, { face: INK.ink, drop: 2, gloss: 0.2 })
    this.add([this.track, this.knob])
    this.paint()
    const h = KNOB * 2 + 16
    pressable(this, {
      shape: new Phaser.Geom.Rectangle(-opts.width / 2, -h / 2, opts.width, h),
      sfx: null,
      onTap: () => undefined,
      onDown: (p) => this.hold(p),
    })
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.release?.())
  }

  get value(): number {
    return this.current
  }

  setValue(value: number): this {
    this.current = this.snap(value)
    this.paint()
    return this
  }

  private snap(v: number): number {
    const { min, max, step } = this.opts
    const stepped = step ? Number((min + Math.round((v - min) / step) * step).toFixed(decimals(step))) : v
    return Math.min(max, Math.max(min, stepped))
  }

  /** 按下就跳到按的位置，之后跟着这根指针走，松手时报一次 */
  private hold(p: Phaser.Input.Pointer): void {
    this.release?.()
    grabPointer(this.scene, p)
    const input = this.scene.input
    const start = this.current
    const follow = (q: Phaser.Input.Pointer): void => {
      if (q.id === p.id) this.follow(q)
    }
    const up = (q: Phaser.Input.Pointer): void => {
      if (q.id !== p.id) return
      this.release?.()
      if (this.current !== start) this.opts.onChange(this.current)
    }
    this.release = (): void => {
      this.release = undefined
      input.off(Phaser.Input.Events.POINTER_MOVE, follow)
      input.off(Phaser.Input.Events.POINTER_UP, up)
      input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, up)
    }
    input.on(Phaser.Input.Events.POINTER_MOVE, follow)
    input.on(Phaser.Input.Events.POINTER_UP, up)
    input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, up)
    this.follow(p)
  }

  private follow(p: Phaser.Input.Pointer): void {
    const { min, max } = this.opts
    const local = this.getWorldTransformMatrix().applyInverse(p.worldX, p.worldY)
    const ratio = Phaser.Math.Clamp((local.x + this.span / 2) / this.span, 0, 1)
    const v = this.snap(min + ratio * (max - min))
    if (v === this.current) return
    this.current = v
    this.paint()
    this.opts.onInput?.(v)
  }

  private paint(): void {
    const { min, max, width } = this.opts
    const ratio = max > min ? (this.current - min) / (max - min) : 0
    const kx = -this.span / 2 + ratio * this.span
    const left = -width / 2 + KNOB / 2
    const g = this.track.clear()
    drawBlock(g, left, -TRACK_H / 2, width - KNOB, TRACK_H, { face: SURFACE.sunken, radius: TRACK_H / 2, line: null })
    if (kx > left) drawBlock(g, left, -TRACK_H / 2, kx - left, TRACK_H, { face: TONE.accent.face, radius: TRACK_H / 2, line: null })
    g.lineStyle(SHAPE.line - 1, SURFACE.outline, 1)
    g.strokeRoundedRect(left, -TRACK_H / 2, width - KNOB, TRACK_H, TRACK_H / 2)
    this.knob.setX(kx)
  }
}
