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
 * 换幕盘：盘心一座小舞台，外圈一道倒计时——演着时是离下一次换幕还有多久，快换幕时整圈闪着橙光、红幕往里收，
 * 换幕时白光打在台上、布景吊在半空。盘下右对齐写着还有几秒；新一幕刚开演的那几秒写着这一幕叫什么
 */
export class StageDial extends Widget {
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

  /** phase 是演着（stand）、快换幕（warn）还是正在换（turn）；ratio 是离下一次换幕还剩多少；title 不为空时写幕名 */
  setStage(phase: 'stand' | 'warn' | 'turn', ratio: number, inSec: number, title: string | null, now: number): this {
    const s = this.shown
    const blink = phase === 'warn' && Math.floor(now / 250) % 2 === 0
    if (phase !== s.phase || Math.abs(ratio - s.ratio) > 0.004 || blink !== s.blink) {
      this.drawRing(phase, ratio, blink)
      if (phase !== s.phase || phase !== 'stand') this.drawGlyph(phase, now)
      s.phase = phase
      s.ratio = ratio
      s.blink = blink
    }
    const sec = Math.max(0, Math.ceil(inSec))
    const text = title ?? (phase === 'stand' ? `${sec} 秒后换幕` : phase === 'warn' ? '要换幕了' : '换幕中')
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

  /**
   * 一座小舞台：台面、两边红幕，台上立着一棵小树、一座小塔；快换幕时红幕一闪一闪地往里收，
   * 换幕时一束白光打在台上，小塔挂着两根吊绳升在半空
   */
  private drawGlyph(phase: string, now: number): void {
    const g = this.glyph.clear()
    const r = this.radius * 0.62
    const lit = phase === 'turn'
    // 台后的墙与台面
    g.fillStyle(SURFACE.outline, 1).fillRoundedRect(-r * 1.08, -r * 0.72, r * 2.16, r * 1.44, r * 0.1)
    g.fillStyle(0x3a2a40, 1).fillRect(-r * 1.0, -r * 0.64, r * 2.0, r * 0.7)
    g.fillStyle(0xc9925a, 1)
    fill4(g, [{ x: -r * 1.0, y: r * 0.06 }, { x: r * 1.0, y: r * 0.06 }, { x: r * 1.0, y: r * 0.64 }, { x: -r * 1.0, y: r * 0.64 }])
    if (lit) {
      g.fillStyle(0xffffff, 0.45)
      fill4(g, [{ x: -r * 0.12, y: -r * 0.64 }, { x: r * 0.12, y: -r * 0.64 }, { x: r * 0.36, y: r * 0.5 }, { x: -r * 0.36, y: r * 0.5 }])
      g.fillStyle(0xffffff, 0.6).fillEllipse(0, r * 0.42, r * 0.9, r * 0.26)
    }
    // 台上的布景：小树一直立着；小塔换幕时吊在半空
    g.fillStyle(SURFACE.outline, 1).fillTriangle(-r * 0.62, r * 0.32, -r * 0.4, -r * 0.36, -r * 0.18, r * 0.32)
    g.fillStyle(TONE.good.face, 1).fillTriangle(-r * 0.57, r * 0.28, -r * 0.4, -r * 0.26, -r * 0.23, r * 0.28)
    const up = lit ? r * (0.32 + 0.06 * Math.sin(now / 200)) : 0
    if (lit) {
      g.lineStyle(1.5, INK.faint, 1)
      g.lineBetween(r * 0.26, -r * 0.26 - up, r * 0.26, -r * 0.72)
      g.lineBetween(r * 0.56, -r * 0.26 - up, r * 0.56, -r * 0.72)
    }
    g.fillStyle(SURFACE.outline, 1).fillRect(r * 0.24, -r * 0.26 - up, r * 0.34, r * 0.6)
    g.fillStyle(TONE.bad.face, 1).fillRect(r * 0.28, -r * 0.22 - up, r * 0.26, r * 0.52)
    g.fillStyle(SURFACE.outline, 1).fillTriangle(r * 0.2, -r * 0.24 - up, r * 0.41, -r * 0.58 - up, r * 0.62, -r * 0.24 - up)
    g.fillStyle(TONE.accent.face, 1).fillTriangle(r * 0.26, -r * 0.27 - up, r * 0.41, -r * 0.5 - up, r * 0.56, -r * 0.27 - up)
    // 两边的红幕：快换幕时往里收一点、一闪一闪
    const close = phase === 'warn' ? r * (0.12 + 0.08 * Math.sin(now / 90)) : 0
    for (const side of [-1, 1]) {
      const x0 = side * r * 1.0
      const x1 = side * (r * 0.66 - close)
      g.fillStyle(SURFACE.outline, 1)
      fill4(g, [{ x: x0, y: -r * 0.66 }, { x: x1 + side * 2, y: -r * 0.66 }, { x: side * (r * 0.8 - close) + side * 2, y: r * 0.66 }, { x: x0, y: r * 0.66 }])
      g.fillStyle(TONE.bad.lip, 1)
      fill4(g, [{ x: x0, y: -r * 0.64 }, { x: x1, y: -r * 0.64 }, { x: side * (r * 0.8 - close), y: r * 0.64 }, { x: x0, y: r * 0.64 }])
    }
    g.fillStyle(TONE.accent.face, 1).fillRect(-r * 1.0, -r * 0.72, r * 2.0, r * 0.1)
  }
}
