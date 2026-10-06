import Phaser from 'phaser'
import { Pill } from './chip'
import { drawDisc } from './draw'
import { Icon } from './icon'
import { INK, SURFACE, TONE } from './theme'
import { Widget } from './widget'
import type { Point } from '../util/vec'

const RING_W = 7
/** 惊慌涨到这么多就算不安、惊恐，盘边换色 */
const UNEASY = 0.35
const SCARED = 0.7

/**
 * 兽群盘：盘心一头大象，外圈是兽群此刻的惊慌——平时涨多少画多少，越满越红；快要狂奔时整圈闪着红光，狂奔时是还要跑多久，慢下来时变淡。
 * 盘边一个小箭头指着兽群要是这会儿受惊会往哪边跑（惊扰在哪的反方向），预警与狂奔时指着它们真跑的方向。盘下右对齐写着此刻怎样
 */
export class HerdDial extends Widget {
  private readonly ring: Phaser.GameObjects.Graphics
  private readonly arrow: Phaser.GameObjects.Graphics
  private readonly glyph: Icon
  private readonly reading: Pill
  private readonly radius: number
  private readonly outer: number
  private shown = { phase: '', fear: NaN, blink: false, ax: NaN, ay: NaN, text: '' }

  constructor(scene: Phaser.Scene, x: number, y: number, radius: number, emoji: string) {
    super(scene, x, y)
    this.outer = radius
    this.radius = radius - 6 - RING_W / 2 - 2
    const face = scene.add.graphics()
    drawDisc(face, 0, 0, radius, { face: SURFACE.bg, faceAlpha: 0.9, drop: 4 })
    face.fillStyle(SURFACE.sunken, 0.95).fillCircle(0, 0, radius - 6)
    face.lineStyle(RING_W, SURFACE.raised, 1).strokeCircle(0, 0, this.radius)
    this.ring = scene.add.graphics()
    this.glyph = new Icon(scene, 0, 2, emoji, Math.round(this.radius * 1.35), 'player')
    this.arrow = scene.add.graphics()
    this.reading = new Pill(scene, radius, radius + 28, { text: '', originX: 1 })
    this.add([face, this.ring, this.glyph, this.arrow, this.reading])
  }

  /** phase 是兽群此刻哪一段；fear 是惊慌（0 到 1）；ratio 是这一段走了多少；dir 是要跑或正在跑的方向，没有为 null */
  setHerd(phase: 'calm' | 'alarm' | 'run' | 'slow', fear: number, ratio: number, dir: Point | null, now: number): this {
    const s = this.shown
    const blink = phase === 'alarm' && Math.floor(now / 160) % 2 === 0
    const value = phase === 'calm' ? fear : phase === 'alarm' ? 1 : 1 - ratio
    if (phase !== s.phase || Math.abs(value - s.fear) > 0.005 || blink !== s.blink) {
      this.drawRing(phase, value, blink)
      s.phase = phase
      s.fear = value
      s.blink = blink
    }
    const ax = dir?.x ?? NaN
    const ay = dir?.y ?? NaN
    if (Math.abs(ax - s.ax) > 0.01 || Math.abs(ay - s.ay) > 0.01 || Number.isNaN(ax) !== Number.isNaN(s.ax)) {
      this.drawArrow(dir, phase)
      s.ax = ax
      s.ay = ay
    }
    this.glyph.setAngle(phase === 'alarm' ? Math.sin(now / 40) * 9 : phase === 'run' ? Math.sin(now / 70) * 5 : 0)
    const text = phase === 'alarm' ? '兽群要狂奔了' : phase === 'run' ? '兽群狂奔中' : phase === 'slow' ? '兽群慢下来了' : fear >= SCARED ? `兽群惊恐 ${Math.round(fear * 100)}%` : fear >= UNEASY ? `兽群不安 ${Math.round(fear * 100)}%` : '兽群安静'
    if (text !== s.text) {
      this.reading.setText(text).setInk(phase === 'calm' && fear < UNEASY ? 'ink' : 'warn')
      s.text = text
    }
    return this
  }

  private drawRing(phase: string, value: number, blink: boolean): void {
    const g = this.ring.clear()
    if (phase === 'alarm') {
      g.lineStyle(RING_W, TONE.bad.face, blink ? 1 : 0.35).strokeCircle(0, 0, this.radius)
      return
    }
    const left = Math.max(0, Math.min(1, value))
    if (left <= 0) return
    const color = phase !== 'calm' ? TONE.bad.face : left >= SCARED ? TONE.bad.face : left >= UNEASY ? TONE.warn.face : TONE.good.face
    g.lineStyle(RING_W, color, phase === 'slow' ? 0.5 : 1)
    g.beginPath()
    g.arc(0, 0, this.radius, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2, false)
    g.strokePath()
  }

  /** 盘边朝外的一个小三角：往哪边跑 */
  private drawArrow(dir: Point | null, phase: string): void {
    const g = this.arrow.clear()
    if (!dir) return
    const a = Math.atan2(dir.y, dir.x)
    const r = this.outer - 1
    const tip = { x: Math.cos(a) * (r + 9), y: Math.sin(a) * (r + 9) }
    const side = 7
    const bx = Math.cos(a) * (r - 2)
    const by = Math.sin(a) * (r - 2)
    const nx = -Math.sin(a) * side
    const ny = Math.cos(a) * side
    const draw = (grow: number, color: number, alpha: number): void => {
      g.fillStyle(color, alpha)
      g.fillTriangle(tip.x + Math.cos(a) * grow, tip.y + Math.sin(a) * grow, bx + nx * (1 + grow / side) - Math.cos(a) * grow, by + ny * (1 + grow / side) - Math.sin(a) * grow, bx - nx * (1 + grow / side) - Math.cos(a) * grow, by - ny * (1 + grow / side) - Math.sin(a) * grow)
    }
    draw(2, SURFACE.outline, 1)
    draw(0, phase === 'calm' ? INK.muted : TONE.bad.face, 1)
  }
}
