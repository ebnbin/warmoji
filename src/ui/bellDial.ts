import Phaser from 'phaser'
import { Pill } from './chip'
import { drawDisc } from './draw'
import { INK, SURFACE, TONE } from './theme'
import { Widget } from './widget'

const RING_W = 7

/**
 * 潜水钟盘：盘心一口钟，外圈一道倒计时——钟放着时是离吊走还有多久，快吊走时整圈闪着橙光，吊着挪的时候是离放下还有多久、钟变灰。
 * 盘下右对齐写着还有几秒
 */
export class BellDial extends Widget {
  private readonly ring: Phaser.GameObjects.Graphics
  private readonly bell: Phaser.GameObjects.Graphics
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
    this.bell = scene.add.graphics()
    this.reading = new Pill(scene, radius, radius + 28, { text: '', originX: 1 })
    this.add([face, this.ring, this.bell, this.reading])
  }

  /** phase 是钟放着（down）、快吊走（warn）还是吊着挪（away）；ratio 是这一段还剩多少，inSec 是还有几秒 */
  setBell(phase: 'down' | 'warn' | 'away', ratio: number, inSec: number, now: number): this {
    const s = this.shown
    const blink = phase === 'warn' && Math.floor(now / 250) % 2 === 0
    if (phase !== s.phase || Math.abs(ratio - s.ratio) > 0.004 || blink !== s.blink) {
      this.drawRing(phase, ratio, blink)
      if (phase !== s.phase) this.drawBell(phase)
      s.phase = phase
      s.ratio = ratio
      s.blink = blink
    }
    const sec = Math.max(0, Math.ceil(inSec))
    const text = phase === 'down' ? `${sec} 秒后吊走` : phase === 'warn' ? '钟要吊走了' : `${sec} 秒后放下`
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

  /** 一口钟的剪影：圆顶、钟口一道裙边、顶上吊环；吊走时灰下去 */
  private drawBell(phase: string): void {
    const g = this.bell.clear()
    const r = this.radius * 0.5
    const away = phase === 'away'
    const body = away ? INK.faint : TONE.accent.face
    const lip = away ? SURFACE.raisedHi : TONE.accent.lip
    g.fillStyle(SURFACE.outline, 1).fillCircle(0, -r * 0.05 + 2, r * 0.78)
    g.fillStyle(body, 1)
    g.beginPath()
    g.arc(0, r * 0.1, r * 0.72, Math.PI, 0, false)
    g.lineTo(r * 0.82, r * 0.55)
    g.lineTo(-r * 0.82, r * 0.55)
    g.closePath()
    g.fillPath()
    g.fillStyle(lip, 1).fillRect(-r * 0.92, r * 0.5, r * 1.84, r * 0.2)
    g.lineStyle(3, lip, 1).strokeCircle(0, -r * 0.74, r * 0.16)
    g.fillStyle(INK.ink, away ? 0.25 : 0.55).fillCircle(-r * 0.28, -r * 0.18, r * 0.14)
  }
}
