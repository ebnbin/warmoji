import Phaser from 'phaser'
import { Pill } from './chip'
import { drawDisc } from './draw'
import { INK, SURFACE, TONE } from './theme'
import { Widget } from './widget'
import type { BridgeSnapshot } from '../run/hudHost'

const ARC_W = 7
/** 表盘的弧从左下转到右下：起点、转过的角度，弧度 */
const ARC_FROM = Math.PI * 0.75
const ARC_SWEEP = Math.PI * 1.5
/** 盘边代表上限的多少倍：压过上限的那一截也看得见 */
const FULL = 1.25
/** 快到上限：这么多以上指针变暖色 */
const NEAR = 0.8
/** 桥上有人时指针抖一抖的幅度（占弧的比例） */
const JITTER = 0.012

/** 木板的颜色：朽、旧、新 */
const PLANK = [0x8f877c, 0xa4744a, 0xd9a05b] as const

/**
 * 载重表：一杆秤一样的弧形表盘，指针是离队长最近的那座桥此刻压着多重，红线是它的上限，压过八成指针变暖色、压过上限变红；
 * 盘心画着那座桥的样子：绳越粗、木板越新越结实。桥断了，弧变成重新搭好的倒计时，盘心的桥断成两截；正在拉绳时整圈一闪一闪。
 * 盘下写着重量或还有几秒搭好
 */
export class LoadDial extends Widget {
  private readonly arc: Phaser.GameObjects.Graphics
  private readonly glyph: Phaser.GameObjects.Graphics
  private readonly reading: Pill
  private readonly radius: number
  private shown = { key: '', text: '' }

  constructor(scene: Phaser.Scene, x: number, y: number, radius: number) {
    super(scene, x, y)
    this.radius = radius - 6 - ARC_W / 2 - 2
    const face = scene.add.graphics()
    drawDisc(face, 0, 0, radius, { face: SURFACE.bg, faceAlpha: 0.9, drop: 4 })
    face.fillStyle(SURFACE.sunken, 0.95).fillCircle(0, 0, radius - 6)
    face.lineStyle(ARC_W, SURFACE.raised, 1)
    face.beginPath()
    face.arc(0, 0, this.radius, ARC_FROM, ARC_FROM + ARC_SWEEP, false)
    face.strokePath()
    for (let i = 0; i <= 10; i++) {
      const a = ARC_FROM + (ARC_SWEEP * i) / 10
      const r0 = this.radius - ARC_W / 2 - (i % 5 === 0 ? 7 : 4)
      face.lineStyle(i % 5 === 0 ? 2 : 1.5, INK.faint, 0.8)
      face.lineBetween(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * (this.radius - ARC_W / 2 - 1), Math.sin(a) * (this.radius - ARC_W / 2 - 1))
    }
    this.arc = scene.add.graphics()
    this.glyph = scene.add.graphics()
    this.reading = new Pill(scene, radius, radius + 28, { text: '', originX: 1 })
    this.add([face, this.glyph, this.arc, this.reading])
  }

  setLoad(b: BridgeSnapshot, now: number): this {
    const s = this.shown
    const blink = b.phase === 'rebuild' && Math.floor(now / 220) % 2 === 0
    const jitter = b.phase === 'up' && b.kg > 0 ? Math.sin(now / 37) * JITTER * Math.min(1.5, b.kg / b.cap) : 0
    const key = `${b.phase}|${b.grade}|${Math.round(b.kg)}|${b.cap}|${Math.round(b.ratio * 200)}|${blink}|${Math.round(jitter * 400)}`
    if (key !== s.key) {
      this.drawArc(b, blink, jitter)
      this.drawGlyph(b)
      s.key = key
    }
    const sec = Math.max(0, Math.ceil(b.inSec))
    const text = b.phase === 'up' ? `${b.name} ${Math.round(b.kg)}/${b.cap} 公斤` : b.phase === 'down' ? `桥断了 ${sec} 秒后搭好` : `正在搭桥 ${sec} 秒`
    if (text !== s.text) {
      const near = b.phase === 'up' && b.kg >= b.cap * NEAR
      this.reading.setText(text).setInk(b.phase === 'up' ? (b.kg > b.cap ? 'bad' : near ? 'warn' : 'ink') : 'warn')
      s.text = text
    }
    return this
  }

  private drawArc(b: BridgeSnapshot, blink: boolean, jitter: number): void {
    const g = this.arc.clear()
    const r = this.radius
    const at = (f: number): number => ARC_FROM + ARC_SWEEP * Math.max(0, Math.min(1, f))
    const stroke = (f0: number, f1: number, color: number, alpha: number, w = ARC_W): void => {
      if (f1 <= f0) return
      g.lineStyle(w, color, alpha)
      g.beginPath()
      g.arc(0, 0, r, at(f0), at(f1), false)
      g.strokePath()
    }
    if (b.phase !== 'up') {
      stroke(0, 1, TONE.warn.face, b.phase === 'rebuild' ? (blink ? 1 : 0.35) : 0.18)
      if (b.phase === 'down') stroke(0, 1 - b.ratio, TONE.info.face, 1)
      return
    }
    // 八成到上限是暖色的一段，上限往上是红的一段
    stroke(NEAR / FULL, 1 / FULL, TONE.warn.face, 0.45)
    stroke(1 / FULL, 1, TONE.bad.face, 0.45)
    const capA = at(1 / FULL)
    g.lineStyle(3, TONE.bad.face, 1).lineBetween(Math.cos(capA) * (r - ARC_W), Math.sin(capA) * (r - ARC_W), Math.cos(capA) * (r + ARC_W * 0.7), Math.sin(capA) * (r + ARC_W * 0.7))
    const f = b.kg / b.cap / FULL + jitter
    const color = b.kg > b.cap ? TONE.bad.face : b.kg >= b.cap * NEAR ? TONE.warn.face : TONE.good.face
    stroke(0, f, color, 1)
    const a = at(f)
    const tip = r - ARC_W * 0.2
    g.lineStyle(4, SURFACE.outline, 1).lineBetween(0, 0, Math.cos(a) * tip, Math.sin(a) * tip)
    g.lineStyle(2, INK.ink, 1).lineBetween(0, 0, Math.cos(a) * tip, Math.sin(a) * tip)
    g.fillStyle(SURFACE.outline, 1).fillCircle(0, 0, 5)
    g.fillStyle(INK.soft, 1).fillCircle(0, 0, 3)
  }

  /** 盘心那座桥：两根扶绳，绳越粗越结实，中间一排木板；断了就是从两头垂下去的两截 */
  private drawGlyph(b: BridgeSnapshot): void {
    const g = this.glyph.clear()
    const r = this.radius * 0.62
    const y0 = r * 0.42
    const rope = 1.2 + b.grade * 1.3
    const plank = PLANK[Math.min(PLANK.length - 1, b.grade)]!
    const sag = b.phase === 'up' ? r * (0.16 + 0.22 * Math.min(1.25, b.kg / b.cap)) : 0
    const pt = (t: number): { x: number; y: number } => ({ x: -r + 2 * r * t, y: y0 + sag * 4 * t * (1 - t) })
    const n = 9
    if (b.phase === 'up') {
      for (let i = 0; i < n; i++) {
        const p = pt((i + 0.5) / n)
        g.fillStyle(SURFACE.outline, 1).fillRect(p.x - 3.5, p.y - 2, 7, 6)
        g.fillStyle(plank, 1).fillRect(p.x - 2.5, p.y - 1, 5, 4)
      }
      g.lineStyle(rope + 2, SURFACE.outline, 1)
      g.beginPath()
      for (let i = 0; i <= 16; i++) {
        const p = pt(i / 16)
        if (i === 0) g.moveTo(p.x, p.y - 7)
        else g.lineTo(p.x, p.y - 7)
      }
      g.strokePath()
      g.lineStyle(rope, 0xd8c39a, 1)
      g.beginPath()
      for (let i = 0; i <= 16; i++) {
        const p = pt(i / 16)
        if (i === 0) g.moveTo(p.x, p.y - 7)
        else g.lineTo(p.x, p.y - 7)
      }
      g.strokePath()
    } else {
      for (const side of [-1, 1]) {
        const x = side * r
        for (let i = 0; i < 4; i++) {
          const y = y0 - 4 + i * 6
          g.fillStyle(SURFACE.outline, 1).fillRect(x - side * 3 - 3.5, y, 7, 5)
          g.fillStyle(plank, 0.8).fillRect(x - side * 3 - 2.5, y + 1, 5, 3)
        }
        g.lineStyle(rope, 0xd8c39a, 0.9).lineBetween(x - side * 3, y0 - 8, x - side * 3, y0 + 18)
      }
    }
    for (const side of [-1, 1]) {
      g.fillStyle(SURFACE.outline, 1).fillRect(side * r - 3, y0 - 14, 6, 16)
      g.fillStyle(0x9b6b40, 1).fillRect(side * r - 2, y0 - 13, 4, 14)
    }
  }
}
