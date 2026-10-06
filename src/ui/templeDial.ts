import Phaser from 'phaser'
import { Pill } from './chip'
import { drawDisc } from './draw'
import { INK, SURFACE, TONE } from './theme'
import { Widget } from './widget'
import type { TempleSnapshot } from '../run/hudHost'

const RING_W = 7
/** 相邻两格之间空出的角度，弧度 */
const GAP = 0.09

type Kind = TempleSnapshot['traps'][number]['kind']

/**
 * 机关盘：一块石头的历法盘，外圈一格一处机关，格里刻着那种机关的符号（和地上压板刻的一样）。复位好的格金黄；踩下去、正在发动的格闪着橙光；
 * 复位中的格暗着，外圈按复位的进度一点点亮回来。盘下右对齐写着几处就绪
 */
export class TempleDial extends Widget {
  private readonly ring: Phaser.GameObjects.Graphics
  private readonly glyphs: Phaser.GameObjects.Graphics
  private readonly reading: Pill
  private readonly radius: number
  private shown = { key: '', text: '' }

  constructor(scene: Phaser.Scene, x: number, y: number, radius: number) {
    super(scene, x, y)
    this.radius = radius - 6 - RING_W / 2 - 2
    const face = scene.add.graphics()
    drawDisc(face, 0, 0, radius, { face: SURFACE.bg, faceAlpha: 0.9, drop: 4 })
    face.fillStyle(SURFACE.sunken, 0.95).fillCircle(0, 0, radius - 6)
    face.lineStyle(RING_W, SURFACE.raised, 1).strokeCircle(0, 0, this.radius)
    face.lineStyle(1.5, INK.faint, 0.5).strokeCircle(0, 0, this.radius * 0.3)
    this.ring = scene.add.graphics()
    this.glyphs = scene.add.graphics()
    this.reading = new Pill(scene, radius, radius + 28, { text: '', originX: 1 })
    this.add([face, this.ring, this.glyphs, this.reading])
  }

  setTraps(s: TempleSnapshot, now: number): this {
    const blink = Math.floor(now / 160) % 2 === 0
    const key = s.traps.map((t) => `${t.phase}${t.phase === 'rearm' ? Math.round(t.ratio * 60) : ''}`).join(',') + (blink ? '!' : '')
    if (key !== this.shown.key) {
      this.draw(s, blink)
      this.shown.key = key
    }
    const ready = s.traps.filter((t) => t.phase === 'armed').length
    const live = s.traps.some((t) => t.phase === 'primed' || t.phase === 'firing')
    const text = live ? '机关发动了' : `${ready}/${s.traps.length} 处机关就绪`
    if (text !== this.shown.text) {
      this.reading.setText(text).setInk(live ? 'warn' : ready === s.traps.length ? 'ink' : 'muted')
      this.shown.text = text
    }
    return this
  }

  private draw(s: TempleSnapshot, blink: boolean): void {
    const g = this.ring.clear()
    const gl = this.glyphs.clear()
    const n = s.traps.length
    if (n === 0) return
    const span = (Math.PI * 2) / n
    s.traps.forEach((t, i) => {
      const a0 = -Math.PI / 2 + i * span + GAP / 2
      const a1 = a0 + span - GAP
      const arc = (from: number, to: number, color: number, alpha: number): void => {
        if (to <= from) return
        g.lineStyle(RING_W, color, alpha)
        g.beginPath()
        g.arc(0, 0, this.radius, from, to, false)
        g.strokePath()
      }
      const live = t.phase === 'primed' || t.phase === 'firing'
      if (t.phase === 'armed') arc(a0, a1, TONE.accent.face, 1)
      else if (live) arc(a0, a1, TONE.warn.face, blink ? 1 : 0.35)
      else arc(a0, a0 + (a1 - a0) * Math.max(0, Math.min(1, t.ratio)), TONE.info.face, 0.8)
      const mid = (a0 + a1) / 2
      const r = this.radius * (n > 6 ? 0.66 : 0.62)
      const size = Math.min(this.radius * 0.24, ((span * r) / 2) * 0.62)
      const color = t.phase === 'armed' ? TONE.accent.face : live ? TONE.warn.face : INK.faint
      glyph(gl, t.kind, Math.cos(mid) * r, Math.sin(mid) * r, size, color, live && !blink ? 0.5 : 1)
    })
  }
}

/** 一种机关的符号，画在 (x, y)、半宽 s：兽面、三根刺、螺旋的圆石、套着的方框 */
function glyph(g: Phaser.GameObjects.Graphics, kind: Kind, x: number, y: number, s: number, color: number, alpha: number): void {
  const w = Math.max(1.5, s * 0.22)
  g.lineStyle(w, color, alpha)
  switch (kind) {
    case 'darts':
      g.strokeCircle(x, y, s * 0.85)
      g.fillStyle(color, alpha)
      g.fillCircle(x - s * 0.33, y - s * 0.18, s * 0.17)
      g.fillCircle(x + s * 0.33, y - s * 0.18, s * 0.17)
      g.lineBetween(x - s * 0.4, y + s * 0.32, x + s * 0.4, y + s * 0.32)
      return
    case 'spikes':
      g.beginPath()
      g.moveTo(x - s * 0.85, y + s * 0.65)
      g.lineTo(x - s * 0.45, y - s * 0.4)
      g.lineTo(x - s * 0.15, y + s * 0.65)
      g.lineTo(x, y - s * 0.8)
      g.lineTo(x + s * 0.15, y + s * 0.65)
      g.lineTo(x + s * 0.45, y - s * 0.4)
      g.lineTo(x + s * 0.85, y + s * 0.65)
      g.strokePath()
      return
    case 'boulder': {
      g.strokeCircle(x, y, s * 0.85)
      g.beginPath()
      for (let i = 0; i <= 24; i++) {
        const t = i / 24
        const ang = t * Math.PI * 3
        const r = s * 0.6 * t
        if (i === 0) g.moveTo(x, y)
        else g.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r)
      }
      g.strokePath()
      return
    }
    case 'pit':
      g.strokeRect(x - s * 0.8, y - s * 0.8, s * 1.6, s * 1.6)
      g.strokeRect(x - s * 0.42, y - s * 0.42, s * 0.84, s * 0.84)
      g.fillStyle(color, alpha)
      g.fillCircle(x, y, s * 0.13)
      return
  }
}
