import Phaser from 'phaser'
import { Pill } from './chip'
import { drawDisc } from './draw'
import { INK, SURFACE, TONE } from './theme'
import { Widget } from './widget'

const RING_W = 7
const TICKS = 12

/**
 * 怀表：盘面一圈十二个刻度，表针转一圈就是一轮茶点，走到正上方就端上来；表冠在顶上。
 * 队长变了体型时外圈一道倒计时（变大暖橙、变小天蓝，快没了就闪），表心画着吃下去的蛋糕或药水，原样时是一只茶杯。
 * 盘下右对齐写着队长的体型还剩几秒，原样时写离下一轮茶点还有几秒
 */
export class TeaWatch extends Widget {
  private readonly ring: Phaser.GameObjects.Graphics
  private readonly hand: Phaser.GameObjects.Graphics
  private readonly glyph: Phaser.GameObjects.Graphics
  private readonly reading: Pill
  private readonly radius: number
  private readonly face: number
  private shown = { turn: NaN, size: NaN, ratio: NaN, blink: false, text: '' }

  constructor(scene: Phaser.Scene, x: number, y: number, radius: number) {
    super(scene, x, y)
    this.radius = radius - 6 - RING_W / 2 - 2
    this.face = this.radius - RING_W / 2 - 3
    const g = scene.add.graphics()
    g.fillStyle(TONE.accent.lip, 1).fillRoundedRect(-7, -radius - 9, 14, 12, 4)
    g.fillStyle(TONE.accent.face, 1).fillRoundedRect(-5, -radius - 7, 10, 8, 3)
    drawDisc(g, 0, 0, radius, { face: SURFACE.bg, faceAlpha: 0.9, drop: 4 })
    g.fillStyle(SURFACE.sunken, 0.95).fillCircle(0, 0, radius - 6)
    g.lineStyle(RING_W, SURFACE.raised, 1).strokeCircle(0, 0, this.radius)
    g.fillStyle(INK.dark, 0.9).fillCircle(0, 0, this.face)
    for (let k = 0; k < TICKS; k++) {
      const a = (k / TICKS) * Math.PI * 2 - Math.PI / 2
      const r0 = this.face - (k % 3 === 0 ? 7 : 4)
      g.lineStyle(k === 0 ? 3 : 2, k === 0 ? TONE.accent.face : INK.muted, 1)
      g.lineBetween(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * (this.face - 1), Math.sin(a) * (this.face - 1))
    }
    this.ring = scene.add.graphics()
    this.glyph = scene.add.graphics()
    this.hand = scene.add.graphics()
    this.reading = new Pill(scene, radius, radius + 28, { text: '', originX: 1 })
    this.add([g, this.ring, this.glyph, this.hand, this.reading])
  }

  /**
   * serveIn 是离下一轮茶点还有几秒，turn 是这一轮走了多少（0 到 1）；size 是队长的体型（-1 变小、0 原样、1 变大），
   * ratio 是体型还剩的比例、sizeSec 还剩几秒，warn 为真时快变回去了
   */
  setWatch(serveIn: number, turn: number, size: number, ratio: number, sizeSec: number, warn: boolean, now: number): this {
    const s = this.shown
    const blink = warn && Math.floor(now / 250) % 2 === 0
    if (Math.abs(turn - s.turn) > 0.003) {
      this.drawHand(turn)
      s.turn = turn
    }
    if (size !== s.size || Math.abs(ratio - s.ratio) > 0.004 || blink !== s.blink) {
      this.drawRing(size, ratio, blink)
      if (size !== s.size) this.drawGlyph(size)
      s.size = size
      s.ratio = ratio
      s.blink = blink
    }
    const sec = (v: number): number => Math.max(0, Math.ceil(v))
    const text = size > 0 ? `变大还剩 ${sec(sizeSec)} 秒` : size < 0 ? `变小还剩 ${sec(sizeSec)} 秒` : serveIn <= 0 ? '茶点端上来了' : `${sec(serveIn)} 秒后上茶点`
    if (text !== s.text) {
      this.reading.setText(text).setInk(size !== 0 && warn ? 'warn' : 'ink')
      s.text = text
    }
    return this
  }

  private drawHand(turn: number): void {
    const g = this.hand.clear()
    const a = turn * Math.PI * 2 - Math.PI / 2
    const len = this.face - 6
    g.lineStyle(4, SURFACE.outline, 1).lineBetween(0, 0, Math.cos(a) * len, Math.sin(a) * len)
    g.lineStyle(2.5, TONE.accent.face, 1).lineBetween(0, 0, Math.cos(a) * len, Math.sin(a) * len)
    g.fillStyle(TONE.accent.lip, 1).fillCircle(0, 0, 3.5)
  }

  private drawRing(size: number, ratio: number, blink: boolean): void {
    const g = this.ring.clear()
    if (size === 0) return
    const left = Math.max(0, Math.min(1, ratio))
    if (left <= 0) return
    g.lineStyle(RING_W, size > 0 ? TONE.warn.face : TONE.info.face, blink ? 0.35 : 1)
    g.beginPath()
    g.arc(0, 0, this.radius, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2, false)
    g.strokePath()
  }

  /** 表心：变大是一块插着樱桃的蛋糕，变小是一只圆肚的药水瓶，原样是一只茶杯 */
  private drawGlyph(size: number): void {
    const g = this.glyph.clear()
    const r = this.face * 0.42
    const y = this.face * 0.38
    if (size > 0) {
      g.fillStyle(SURFACE.outline, 1).fillRoundedRect(-r - 2, y - r * 0.9 - 2, r * 2 + 4, r * 1.1 + 4, 4)
      g.fillStyle(TONE.warn.lip, 1).fillRoundedRect(-r, y - r * 0.9, r * 2, r * 1.1, 3)
      g.fillStyle(0xf4abba, 1).fillRoundedRect(-r, y - r * 0.9, r * 2, r * 0.42, 3)
      g.fillStyle(TONE.bad.face, 1).fillCircle(0, y - r * 1.05, r * 0.3)
      return
    }
    if (size < 0) {
      g.fillStyle(SURFACE.outline, 1).fillCircle(0, y - r * 0.15, r * 0.8 + 2)
      g.fillStyle(TONE.info.face, 1).fillCircle(0, y - r * 0.15, r * 0.8)
      g.fillStyle(INK.ink, 0.7).fillRect(-r * 0.25, y - r * 1.25, r * 0.5, r * 0.45)
      g.fillStyle(0xc1694f, 1).fillRect(-r * 0.3, y - r * 1.45, r * 0.6, r * 0.25)
      return
    }
    g.fillStyle(SURFACE.outline, 1).fillRoundedRect(-r * 0.8 - 2, y - r * 0.7 - 2, r * 1.6 + 4, r * 1.1 + 4, 5)
    g.fillStyle(INK.soft, 1).fillRoundedRect(-r * 0.8, y - r * 0.7, r * 1.6, r * 1.1, 4)
    g.lineStyle(3, INK.soft, 1).strokeCircle(r * 0.95, y - r * 0.2, r * 0.3)
    g.fillStyle(INK.faint, 1).fillRect(-r * 1.1, y + r * 0.42, r * 2.2, 3)
  }
}
