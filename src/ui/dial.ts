import Phaser from 'phaser'
import type { OutlineKind } from '../emoji/svg'
import { drawDisc } from './draw'
import { CooldownPie, RingGauge } from './gauge'
import { pressable } from './gesture'
import { Icon } from './icon'
import { Label } from './label'
import { INK, SURFACE, TONE } from './theme'
import { Widget } from './widget'

export interface DialOptions {
  readonly radius: number
  readonly icon: string
  readonly outline?: OutlineKind
  readonly iconSize?: number
  readonly onTap?: () => void
  /** 按下时回调；返回 true 表示接管这次按压，之后的拖动与抬起交给 onDrag 与 onRelease，不再算点按 */
  readonly onHold?: (pointer: Phaser.Input.Pointer) => boolean
  readonly onDrag?: (dx: number, dy: number) => void
  readonly onRelease?: (dx: number, dy: number) => void
}

/** 弧形底带：一排技能钮沿它排开；(x, y) 是圆心，从 start 顺时针到 end（弧度） */
export class ArcTrack extends Widget {
  constructor(scene: Phaser.Scene, x: number, y: number, radius: number, thickness: number, start: number, end: number) {
    super(scene, x, y)
    const g = scene.add.graphics()
    for (const [w, color, alpha] of [
      [thickness + 6, SURFACE.outline, 0.3],
      [thickness, INK.ink, 0.08],
    ] as const) {
      g.lineStyle(w, color, alpha)
      g.beginPath()
      g.arc(0, 0, radius, start, end, false)
      g.strokePath()
    }
    this.add(g)
  }
}

/** idle 普通，leader 队长呼吸光，recast 连段可接的快闪，dead 阵亡 */
export type DialRim = 'idle' | 'leader' | 'recast' | 'dead'

/** 圆形技能钮：图标、血量环、冷却扇形、角标与读数；(x, y) 是圆心 */
export class DialButton extends Widget {
  private readonly radius: number
  private readonly base: Phaser.GameObjects.Graphics
  private readonly face: Icon
  private readonly ring: RingGauge
  private readonly pie: CooldownPie
  private readonly cdText: Label
  private readonly deadText: Label
  private readonly badge: Icon
  private readonly tired: Icon
  private readonly charges: Label
  private rim: DialRim = 'idle'
  private pulse = 1
  private dimmed = false
  private dead = false
  private holdId: number | null = null
  private holdX = 0
  private holdY = 0

  constructor(scene: Phaser.Scene, x: number, y: number, opts: DialOptions) {
    super(scene, x, y)
    const r = opts.radius
    this.radius = r
    this.base = scene.add.graphics()
    this.face = new Icon(scene, 0, 0, opts.icon, opts.iconSize ?? Math.round(r * 1.4), opts.outline)
    this.ring = new RingGauge(scene, 0, 0, r + 5, { tone: 'hp', thickness: 4 })
    this.pie = new CooldownPie(scene, 0, 0, r - 2)
    const small = { kind: 'label', bold: true, outline: true } as const
    this.cdText = new Label(scene, 0, 0, '', { ...small, color: 'accent' }).setOrigin(0.5).setVisible(false)
    this.deadText = new Label(scene, 0, 0, '', { ...small, color: 'bad' }).setOrigin(0.5).setVisible(false)
    const corner = r * 0.68
    this.badge = new Icon(scene, -corner, -corner, opts.icon, 20, opts.outline).setVisible(false)
    this.tired = new Icon(scene, corner, -corner, '1f4a6', 20, 'player').setVisible(false)
    this.charges = new Label(scene, corner, corner, '', { ...small, kind: 'caption', color: 'accent' }).setOrigin(0.5).setVisible(false)
    this.add([this.base, this.face, this.ring, this.pie, this.cdText, this.deadText, this.badge, this.tired, this.charges])
    this.paintBase()
    pressable(this, {
      shape: new Phaser.Geom.Circle(0, 0, r + 6),
      sfx: null,
      onDown: (p) => {
        if (opts.onHold?.(p)) this.beginHold(p, opts)
      },
      onTap: () => {
        if (this.holdId === null) opts.onTap?.()
      },
    })
  }

  setIcon(id: string, outline?: OutlineKind): this {
    this.face.setEmoji(id, outline)
    return this
  }

  /** 左上角小图标 */
  setBadge(id: string | null, outline?: OutlineKind): this {
    if (id === null) return this.hideObj(this.badge)
    this.badge.setEmoji(id, outline).setVisible(true)
    return this
  }

  setTired(tired: boolean): this {
    this.tired.setVisible(tired)
    return this
  }

  setHp(ratio: number | null): this {
    if (ratio === null) return this.hideObj(this.ring)
    this.ring.setVisible(true).setValue(ratio)
    return this
  }

  /** ratio 是剩余比例；seconds 为 null 时隐去读数 */
  setCooldown(ratio: number, seconds: number | null): this {
    this.pie.setValue(ratio)
    this.cdText.setVisible(seconds !== null)
    if (seconds !== null && this.cdText.text !== String(seconds)) this.cdText.setText(String(seconds))
    return this
  }

  /** 阵亡时 dead 为真并给出复活倒计时，不会自己复活时倒计时为 null */
  setDead(dead: boolean, seconds: number | null): this {
    this.deadText.setVisible(dead && seconds !== null)
    if (dead && seconds !== null && this.deadText.text !== String(seconds)) this.deadText.setText(String(seconds))
    if (dead === this.dead) return this
    this.dead = dead
    this.face.setAlpha(dead ? 0.25 : this.dimmed ? 0.55 : 1)
    if (dead) this.face.setTint(INK.faint)
    else this.face.clearTint()
    this.paintBase()
    return this
  }

  setCharges(n: number | null): this {
    this.charges.setVisible(n !== null)
    if (n !== null && this.charges.text !== String(n)) this.charges.setText(String(n))
    return this
  }

  setDim(dim: boolean): this {
    if (dim === this.dimmed) return this
    this.dimmed = dim
    this.setAlpha(dim ? 0.55 : 1)
    return this
  }

  /** pulse 在 0 到 1 之间，调制描边的亮度 */
  setRim(rim: DialRim, pulse = 1): this {
    if (rim === this.rim && Math.abs(pulse - this.pulse) < 0.02) return this
    this.rim = rim
    this.pulse = pulse
    this.paintBase()
    return this
  }

  private hideObj(obj: Phaser.GameObjects.Components.Visible): this {
    obj.setVisible(false)
    return this
  }

  private paintBase(): void {
    const rim = this.dead ? 'dead' : this.rim
    const color = rim === 'leader' ? TONE.accent.face : rim === 'recast' ? TONE.info.face : rim === 'dead' ? TONE.bad.face : SURFACE.outline
    const width = rim === 'recast' ? 5 : rim === 'idle' ? 3 : 4
    const alpha = rim === 'idle' || rim === 'dead' ? 1 : 0.55 + 0.45 * this.pulse
    drawDisc(this.base.clear(), 0, 0, this.radius, {
      face: this.dead ? TONE.bad.lip : SURFACE.bg,
      faceAlpha: this.dead ? 0.7 : 0.88,
      drop: 3,
    })
    this.base.lineStyle(width, color, alpha)
    this.base.strokeCircle(0, 0, this.radius)
  }

  private beginHold(p: Phaser.Input.Pointer, opts: DialOptions): void {
    const input = this.scene.input
    this.holdId = p.id
    this.holdX = p.worldX
    this.holdY = p.worldY
    const move = (q: Phaser.Input.Pointer): void => {
      if (q.id === this.holdId) opts.onDrag?.(q.worldX - this.holdX, q.worldY - this.holdY)
    }
    const up = (q: Phaser.Input.Pointer): void => {
      if (q.id !== this.holdId) return
      this.holdId = null
      input.off(Phaser.Input.Events.POINTER_MOVE, move)
      input.off(Phaser.Input.Events.POINTER_UP, up)
      input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, up)
      opts.onRelease?.(q.worldX - this.holdX, q.worldY - this.holdY)
    }
    input.on(Phaser.Input.Events.POINTER_MOVE, move)
    input.on(Phaser.Input.Events.POINTER_UP, up)
    input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, up)
  }
}
