import Phaser from 'phaser'
import type { OutlineKind } from '../emoji/outline'
import { drawDisc } from './draw'
import { CooldownPie, RingGauge } from './gauge'
import { pressable } from './gesture'
import { Icon } from './icon'
import { Label } from './label'
import { INK, MOTION, SURFACE, TONE } from './theme'
import type { Tone } from './theme'
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

/** idle 普通，leader 队长呼吸光，recast 连段可接的快闪，dead 阵亡 */
export type DialRim = 'idle' | 'leader' | 'recast' | 'dead'

/** 圆形技能钮：图标、血量环、贴着边缘内侧的体力环、冷却扇形、角标与读数；(x, y) 是圆心 */
export class DialButton extends Widget {
  private readonly radius: number
  /** 按下时整体缩放的一层；外层的缩放留给布局 */
  private readonly content: Widget
  private readonly base: Phaser.GameObjects.Graphics
  private readonly face: Icon
  private readonly ring: RingGauge
  private readonly stamina: RingGauge
  private readonly pie: CooldownPie
  private readonly cdText: Label
  private readonly badge: Icon
  private readonly tired: Icon
  private readonly charges: Label
  private rim: DialRim = 'idle'
  private pulse = 1
  private dimmed = false
  private dead = false
  private pressed = false
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
    // 画在圆盘边缘内侧：排成弧的相邻圆盘之间放不下第二道外环
    this.stamina = new RingGauge(scene, 0, 0, r - 4, { tone: 'info', thickness: 3 }).setVisible(false)
    const small = { kind: 'label', bold: true, outline: true } as const
    this.cdText = new Label(scene, 0, 0, '', { ...small, color: 'accent' }).setOrigin(0.5).setVisible(false)
    const corner = r * 0.68
    this.badge = new Icon(scene, -corner, -corner, opts.icon, 20, opts.outline).setVisible(false)
    this.tired = new Icon(scene, corner, -corner, '1f4a6', 20, 'player').setVisible(false)
    this.charges = new Label(scene, corner, corner, '', { ...small, kind: 'caption', color: 'accent' }).setOrigin(0.5).setVisible(false)
    this.content = new Widget(scene)
    this.content.add([this.base, this.face, this.ring, this.pie, this.stamina, this.cdText, this.badge, this.tired, this.charges])
    this.add(this.content)
    this.paintBase()
    pressable(this, {
      shape: new Phaser.Geom.Circle(0, 0, r + 6),
      sfx: null,
      onDown: (p) => {
        if (opts.onHold?.(p)) this.beginHold(p, opts)
      },
      onPress: (down) => this.press(down),
      onTap: () => {
        if (this.holdId !== null) return
        this.ripple()
        opts.onTap?.()
      },
    })
    this.once(Phaser.GameObjects.Events.DESTROY, () => scene.tweens.killTweensOf(this.content))
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

  /** 体力环：满了或给 null 时收起 */
  setStamina(ratio: number | null, tone: Tone): this {
    if (ratio === null || ratio >= 1) return this.hideObj(this.stamina)
    this.stamina.setVisible(true).setTone(tone).setValue(ratio)
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
  setDead(dead: boolean): this {
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
    const rimColor = rim === 'leader' ? TONE.accent.face : rim === 'recast' ? TONE.info.face : rim === 'dead' ? TONE.bad.face : SURFACE.outline
    const color = this.pressed ? INK.soft : rimColor
    const width = rim === 'recast' ? 5 : rim === 'idle' ? 3 : 4
    const alpha = this.pressed || rim === 'idle' || rim === 'dead' ? 1 : 0.55 + 0.45 * this.pulse
    drawDisc(this.base.clear(), 0, 0, this.radius, {
      face: this.dead ? TONE.bad.lip : this.pressed ? SURFACE.raisedHi : SURFACE.bg,
      faceAlpha: this.pressed ? 0.75 : this.dead ? 0.55 : 0.45,
    })
    this.base.lineStyle(width, color, alpha)
    this.base.strokeCircle(0, 0, this.radius)
  }

  /** 按下时缩一点、底盘与描边提亮，松开时带一点回弹复原 */
  private press(down: boolean): void {
    this.pressed = down
    this.paintBase()
    this.scene.tweens.killTweensOf(this.content)
    this.scene.tweens.add({
      targets: this.content,
      scale: down ? 0.9 : 1,
      duration: down ? MOTION.press : MOTION.pop,
      ease: down ? 'Quad.easeOut' : 'Back.easeOut',
    })
  }

  /** 技能放出去了：底盘染上 color 闪一下，钮边扩出一圈同色的粗环 */
  flare(color: number): void {
    const glow = this.scene.add.circle(0, 0, this.radius, color, 0.45)
    const ring = this.scene.add.circle(0, 0, this.radius).setStrokeStyle(6, color, 0.95)
    this.add([glow, ring])
    this.scene.tweens.add({ targets: glow, alpha: 0, duration: MOTION.flare, ease: 'Quad.easeOut', onComplete: () => glow.destroy() })
    this.scene.tweens.add({
      targets: ring,
      scale: (this.radius + 22) / this.radius,
      alpha: 0,
      duration: MOTION.flare,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    })
  }

  /** 点按生效：从钮边扩出一圈淡出的细环 */
  private ripple(): void {
    const ring = this.scene.add.circle(0, 0, this.radius).setStrokeStyle(3, INK.ink, 0.7)
    this.add(ring)
    this.scene.tweens.add({
      targets: ring,
      scale: (this.radius + 10) / this.radius,
      alpha: 0,
      duration: MOTION.pop,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    })
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
