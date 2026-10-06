import Phaser from 'phaser'
import { Pill } from './chip'
import { drawDisc } from './draw'
import { INK, SURFACE, TONE } from './theme'
import { Widget } from './widget'

const RING_W = 7

/**
 * 潜水钟盘：盘心一口吊在缆绳上的潜水钟，外圈一道倒计时——坐着时是离吊走还有多久，快吊走时整圈闪着橙光，吊走了是离落稳还有多久、钟变灰。
 * 盘下右对齐写着还有几秒
 */
export class BellDial extends Widget {
  private readonly ring: Phaser.GameObjects.Graphics
  private readonly glyph: Phaser.GameObjects.Graphics
  private readonly reading: Pill
  private readonly radius: number
  private shown = { phase: '', ratio: NaN, text: '', blink: false }

  constructor(scene: Phaser.Scene, x: number, y: number, radius: number) {
    super(scene, x, y)
    this.radius = radius - 6 - RING_W / 2 - 2
    const face = scene.add.graphics()
    drawDisc(face, 0, 0, radius, { face: SURFACE.bg, faceAlpha: 0.9, drop: 4 })
    face.fillStyle(SURFACE.sunken, 0.95).fillCircle(0, 0, radius - 6)
    face.lineStyle(RING_W, SURFACE.raised, 1).strokeCircle(0, 0, this.radius)
    this.ring = scene.add.graphics()
    this.glyph = scene.add.graphics()
    this.reading = new Pill(scene, radius, radius + 28, { text: '', originX: 1 })
    this.add([face, this.ring, this.glyph, this.reading])
  }

  /** phase 是坐着（down）、快吊走（warn）还是吊走了（away）；ratio 是这一段还剩多少，inSec 是还有几秒 */
  setBell(phase: 'down' | 'warn' | 'away', ratio: number, inSec: number, now: number): this {
    const s = this.shown
    const blink = phase === 'warn' && Math.floor(now / 250) % 2 === 0
    if (phase !== s.phase || Math.abs(ratio - s.ratio) > 0.004 || blink !== s.blink) {
      this.drawRing(phase, ratio, blink)
      if (phase !== s.phase) this.drawGlyph(phase)
      s.phase = phase
      s.ratio = ratio
      s.blink = blink
    }
    const sec = Math.max(0, Math.ceil(inSec))
    const text = phase === 'down' ? `${sec} 秒后吊走` : phase === 'warn' ? '潜水钟要吊走了' : `${sec} 秒后落稳`
    if (text !== s.text) {
      this.reading.setText(text).setInk(phase === 'down' ? 'ink' : 'warn')
      s.text = text
    }
    return this
  }

  private drawRing(phase: string, ratio: number, blink: boolean): void {
    const g = this.ring.clear()
    const color = phase === 'down' ? TONE.info.face : TONE.warn.face
    const left = Math.max(0, Math.min(1, ratio))
    if (phase === 'warn') {
      g.lineStyle(RING_W, color, blink ? 1 : 0.35).strokeCircle(0, 0, this.radius)
      return
    }
    if (left <= 0) return
    g.lineStyle(RING_W, color, 1)
    g.beginPath()
    g.arc(0, 0, this.radius, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2, false)
    g.strokePath()
  }

  /** 一口潜水钟的侧影：顶上一根缆绳挂着吊环，圆顶往下张开成喇叭口，钟口一道厚唇，钟身一扇圆窗，钟口那一侧开着一道口子；吊走时灰下去 */
  private drawGlyph(phase: string): void {
    const g = this.glyph.clear()
    const r = this.radius * 0.5
    const away = phase === 'away'
    const body = away ? INK.faint : TONE.accent.face
    const lip = away ? SURFACE.raisedHi : TONE.accent.lip
    g.lineStyle(3, SURFACE.outline, 1)
    g.lineBetween(0, -1.25 * r, 0, -0.78 * r)
    g.strokeCircle(0, -0.68 * r, 0.12 * r)
    const shape = [
      new Phaser.Math.Vector2(-0.9 * r, 0.6 * r),
      new Phaser.Math.Vector2(-0.68 * r, 0.3 * r),
      new Phaser.Math.Vector2(-0.6 * r, -0.12 * r),
      ...arc(-0.6 * r, 0.6 * r, -0.12 * r, 0.46 * r),
      new Phaser.Math.Vector2(0.6 * r, -0.12 * r),
      new Phaser.Math.Vector2(0.68 * r, 0.3 * r),
      new Phaser.Math.Vector2(0.9 * r, 0.6 * r),
    ]
    g.fillStyle(body, 1).fillPoints(shape, true)
    g.lineStyle(3, SURFACE.outline, 1).strokePoints(shape, true)
    g.fillStyle(lip, 1).fillRoundedRect(-0.98 * r, 0.52 * r, 1.96 * r, 0.2 * r, 0.08 * r)
    g.lineStyle(3, SURFACE.outline, 1).strokeRoundedRect(-0.98 * r, 0.52 * r, 1.96 * r, 0.2 * r, 0.08 * r)
    g.fillStyle(INK.ink, away ? 0.3 : 0.7).fillRoundedRect(0.28 * r, 0.12 * r, 0.34 * r, 0.42 * r, { tl: 0.14 * r, tr: 0.14 * r, bl: 0, br: 0 })
    g.fillStyle(INK.ink, away ? 0.25 : 0.55).fillCircle(-0.18 * r, -0.02 * r, 0.14 * r)
    g.lineStyle(2, SURFACE.outline, away ? 0.4 : 0.7).lineBetween(-0.66 * r, 0.24 * r, 0.66 * r, 0.24 * r)
  }
}

/** 钟顶的圆弧：从 (x0, y) 弧到 (x1, y)，往上拱 rise */
function arc(x0: number, x1: number, y: number, rise: number): Phaser.Math.Vector2[] {
  const out: Phaser.Math.Vector2[] = []
  const n = 16
  for (let i = 1; i < n; i++) {
    const a = Math.PI * (1 - i / n)
    out.push(new Phaser.Math.Vector2((x0 + x1) / 2 + (Math.cos(a) * (x1 - x0)) / 2, y - Math.sin(a) * rise))
  }
  return out
}
