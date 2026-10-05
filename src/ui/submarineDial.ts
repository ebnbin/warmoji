import Phaser from 'phaser'
import { Pill } from './chip'
import { drawDisc } from './draw'
import { INK, SURFACE, TONE } from './theme'
import { Widget } from './widget'

const RING_W = 7

/**
 * 潜艇盘：盘心一艘潜艇，外圈一道倒计时——停着时是离开走还有多久，快开走时整圈闪着橙光，开走了是离停稳还有多久、潜艇变灰。
 * 盘下右对齐写着还有几秒
 */
export class SubmarineDial extends Widget {
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

  /** phase 是停着（down）、快开走（warn）还是开走了（away）；ratio 是这一段还剩多少，inSec 是还有几秒 */
  setSubmarine(phase: 'down' | 'warn' | 'away', ratio: number, inSec: number, now: number): this {
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
    const text = phase === 'down' ? `${sec} 秒后开走` : phase === 'warn' ? '潜艇要开走了' : `${sec} 秒后停稳`
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

  /** 一艘潜艇的侧影：长圆的艇身、背上的指挥塔与潜望镜、艇尾收尖接着螺旋桨，艇身一排舷窗；开走时灰下去 */
  private drawGlyph(phase: string): void {
    const g = this.glyph.clear()
    const r = this.radius * 0.5
    const away = phase === 'away'
    const body = away ? INK.faint : TONE.accent.face
    const lip = away ? SURFACE.raisedHi : TONE.accent.lip
    const hull = (grow: number, color: number): void => {
      g.fillStyle(color, 1)
      g.fillRoundedRect(-0.9 * r - grow, -0.2 * r - grow, 1.75 * r + grow * 2, 0.64 * r + grow * 2, 0.32 * r + grow)
      g.fillTriangle(-0.82 * r, -0.17 * r - grow, -0.82 * r, 0.41 * r + grow, -1.22 * r - grow, 0.12 * r)
      g.fillRoundedRect(-0.18 * r - grow, -0.5 * r - grow, 0.5 * r + grow * 2, 0.36 * r + grow * 2, 0.08 * r + grow)
    }
    hull(2, SURFACE.outline)
    hull(0, body)
    g.lineStyle(3, SURFACE.outline, 1)
    g.lineBetween(0.2 * r, -0.5 * r, 0.2 * r, -0.78 * r)
    g.lineBetween(0.2 * r, -0.78 * r, 0.34 * r, -0.78 * r)
    g.fillStyle(lip, 1).fillRoundedRect(-1.36 * r, -0.1 * r, 0.14 * r, 0.44 * r, 0.05 * r)
    for (const x of [-0.42, 0, 0.42]) g.fillStyle(INK.ink, away ? 0.25 : 0.55).fillCircle(x * r, 0.12 * r, 0.09 * r)
  }
}
