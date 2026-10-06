import Phaser from 'phaser'
import { Pill } from './chip'
import { drawDisc } from './draw'
import { INK, SURFACE, TONE } from './theme'
import { Widget } from './widget'

const RING_W = 7

/** 填一个多边形 */
function fill4(g: Phaser.GameObjects.Graphics, pts: readonly { x: number; y: number }[]): void {
  g.beginPath()
  g.moveTo(pts[0]!.x, pts[0]!.y)
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y)
  g.closePath()
  g.fillPath()
}

/**
 * 书页盘：盘心一本摊开的立体书，外圈一道倒计时——立着时是离下一次翻页还有多久，快翻页时整圈闪着橙光、页角翘起来，
 * 翻页时一页书立在半空。盘下右对齐写着还有几秒；新一页刚立起来的那几秒写着这一章叫什么
 */
export class BookDial extends Widget {
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

  /** phase 是立着（stand）、快翻页（warn）还是正在翻（turn）；ratio 是离下一次翻页还剩多少；title 不为空时写章名 */
  setBook(phase: 'stand' | 'warn' | 'turn', ratio: number, inSec: number, title: string | null, now: number): this {
    const s = this.shown
    const blink = phase === 'warn' && Math.floor(now / 250) % 2 === 0
    if (phase !== s.phase || Math.abs(ratio - s.ratio) > 0.004 || blink !== s.blink) {
      this.drawRing(phase, ratio, blink)
      if (phase !== s.phase || phase === 'warn') this.drawGlyph(phase, now)
      s.phase = phase
      s.ratio = ratio
      s.blink = blink
    }
    const sec = Math.max(0, Math.ceil(inSec))
    const text = title ?? (phase === 'stand' ? `${sec} 秒后翻页` : phase === 'warn' ? '要翻页了' : '翻页中')
    if (text !== s.text) {
      this.reading.setText(text).setInk(phase === 'stand' ? 'ink' : 'warn')
      s.text = text
    }
    return this
  }

  private drawRing(phase: string, ratio: number, blink: boolean): void {
    const g = this.ring.clear()
    const color = phase === 'stand' ? TONE.good.face : TONE.warn.face
    const left = Math.max(0, Math.min(1, ratio))
    if (phase !== 'stand') {
      g.lineStyle(RING_W, color, phase === 'turn' ? 0.6 : blink ? 1 : 0.35).strokeCircle(0, 0, this.radius)
      return
    }
    if (left <= 0) return
    g.lineStyle(RING_W, color, 1)
    g.beginPath()
    g.arc(0, 0, this.radius, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2, false)
    g.strokePath()
  }

  /** 一本摊开的书：封面垫底，两页微微往书脊弯，书脊上立着一棵剪纸小树；快翻页时右下角翘起来，翻页时一页立在半空 */
  private drawGlyph(phase: string, now: number): void {
    const g = this.glyph.clear()
    const r = this.radius * 0.62
    const cover = TONE.info.lip
    g.fillStyle(SURFACE.outline, 1).fillRoundedRect(-r * 1.08, -r * 0.68, r * 2.16, r * 1.36, r * 0.1)
    g.fillStyle(cover, 1).fillRoundedRect(-r * 1.02, -r * 0.62, r * 2.04, r * 1.24, r * 0.08)
    const page = (side: number, lift: number): void => {
      const x0 = side * r * 0.04
      const x1 = side * r * 0.94
      g.fillStyle(SURFACE.outline, 1)
      fill4(g, [{ x: x0, y: -r * 0.5 - 2 }, { x: x1, y: -r * 0.56 - lift - 2 }, { x: x1, y: r * 0.5 - lift + 2 }, { x: x0, y: r * 0.56 + 2 }])
      g.fillStyle(INK.ink, 1)
      fill4(g, [{ x: x0, y: -r * 0.5 }, { x: x1, y: -r * 0.56 - lift }, { x: x1, y: r * 0.5 - lift }, { x: x0, y: r * 0.56 }])
    }
    page(-1, 0)
    if (phase === 'turn') {
      page(1, 0)
      g.fillStyle(SURFACE.outline, 1)
      fill4(g, [{ x: 0, y: -r * 0.5 }, { x: r * 0.2, y: -r * 1.05 }, { x: r * 0.2, y: r * 0.05 }, { x: 0, y: r * 0.56 }])
      g.fillStyle(INK.soft, 1)
      fill4(g, [{ x: 2, y: -r * 0.46 }, { x: r * 0.2 - 2, y: -r * 0.98 }, { x: r * 0.2 - 2, y: r * 0.02 }, { x: 2, y: r * 0.5 }])
      return
    }
    page(1, 0)
    g.lineStyle(2, INK.faint, 1).lineBetween(0, -r * 0.5, 0, r * 0.56)
    if (phase === 'warn') {
      const s = r * (0.36 + 0.06 * Math.sin(now / 80))
      const cx = r * 0.94
      const cy = r * 0.5
      g.fillStyle(cover, 1).fillTriangle(cx - s, cy, cx, cy - s, cx, cy)
      g.fillStyle(INK.soft, 1).fillTriangle(cx - s, cy, cx, cy - s, cx - s, cy - s)
      g.lineStyle(2, SURFACE.outline, 1).strokeTriangle(cx - s, cy, cx, cy - s, cx - s, cy - s)
    }
    // 书脊两边各立着一件剪纸：一棵树，一座小塔
    g.fillStyle(SURFACE.outline, 1).fillTriangle(-r * 0.62, r * 0.18, -r * 0.4, -r * 0.5, -r * 0.18, r * 0.18)
    g.fillStyle(TONE.good.face, 1).fillTriangle(-r * 0.57, r * 0.14, -r * 0.4, -r * 0.4, -r * 0.23, r * 0.14)
    g.fillStyle(SURFACE.outline, 1).fillRect(r * 0.24, -r * 0.4, r * 0.34, r * 0.6)
    g.fillStyle(TONE.bad.face, 1).fillRect(r * 0.28, -r * 0.36, r * 0.26, r * 0.52)
    g.fillStyle(SURFACE.outline, 1).fillTriangle(r * 0.2, -r * 0.38, r * 0.41, -r * 0.72, r * 0.62, -r * 0.38)
    g.fillStyle(TONE.accent.face, 1).fillTriangle(r * 0.26, -r * 0.41, r * 0.41, -r * 0.64, r * 0.56, -r * 0.41)
  }
}
