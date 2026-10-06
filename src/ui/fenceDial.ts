import Phaser from 'phaser'
import { Pill } from './chip'
import { drawDisc } from './draw'
import { INK, SURFACE } from './theme'
import { Widget } from './widget'
import type { FenceSnapshot } from '../run/hudHost'

const RING_W = 6
/** 盘里的围栏图占盘面的比例 */
const MAP_FILL = 0.74

/**
 * 围栏盘：盘里是前哨的围栏图，亮着的段按组上色、熄着的只剩一道灰线，过载的段一明一灭，控制台是同色的小点；
 * 外圈按院子分段，切过的组在它那个院子的方位上走一道倒计时，快复位时一明一灭。盘下右对齐写着最先复位的那组还有几秒
 */
export class FenceDial extends Widget {
  private readonly map: Phaser.GameObjects.Graphics
  private readonly ring: Phaser.GameObjects.Graphics
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
    this.map = scene.add.graphics()
    this.ring = scene.add.graphics()
    this.reading = new Pill(scene, radius, radius + 28, { text: '', originX: 1 })
    this.add([face, this.map, this.ring, this.reading])
  }

  setFences(f: FenceSnapshot, now: number): this {
    const blink = Math.floor(now / 220) % 2 === 0
    const key = [
      blink ? 1 : 0,
      f.segments.map((s) => (s.down ? 2 : s.live ? 1 : 0)).join(''),
      f.groups.map((g) => `${g.on ? 1 : 0}${g.phase}${Math.round(g.ratio * 200)}`).join(','),
    ].join('|')
    if (key !== this.shown.key) {
      this.shown.key = key
      this.drawMap(f, blink)
      this.drawRing(f, blink)
    }
    let soon = -1
    f.groups.forEach((g, k) => {
      if (g.phase !== 'idle' && (soon < 0 || g.inSec < f.groups[soon]!.inSec)) soon = k
    })
    const g = soon >= 0 ? f.groups[soon]! : null
    const text = g ? `${g.name}${g.on ? '亮' : '熄'}着，${Math.max(0, Math.ceil(g.inSec))} 秒后复位` : '围栏都是默认状态'
    if (text !== this.shown.text) {
      this.reading.setText(text).setInk(g && g.phase === 'warn' ? 'warn' : 'ink')
      this.shown.text = text
    }
    return this
  }

  private drawMap(f: FenceSnapshot, blink: boolean): void {
    const g = this.map.clear()
    const k = this.radius * MAP_FILL
    for (const s of f.segments) {
      if (s.live) continue
      const flicker = s.down && blink
      g.lineStyle(flicker ? 3 : 2, flicker ? f.groups[s.group]!.color : INK.faint, flicker ? 0.8 : 0.7)
      g.lineBetween(s.ax * k, s.ay * k, s.bx * k, s.by * k)
    }
    for (const s of f.segments) {
      if (!s.live) continue
      const c = f.groups[s.group]!.color
      g.lineStyle(7, c, 0.28).lineBetween(s.ax * k, s.ay * k, s.bx * k, s.by * k)
      g.lineStyle(3.5, c, 1).lineBetween(s.ax * k, s.ay * k, s.bx * k, s.by * k)
    }
    for (const c of f.consoles) {
      g.fillStyle(SURFACE.outline, 1).fillCircle(c.x * k, c.y * k, 4.5)
      g.fillStyle(f.groups[c.group]!.color, 1).fillCircle(c.x * k, c.y * k, 3)
    }
    g.fillStyle(INK.muted, 1).fillCircle(0, 0, 2.5)
  }

  private drawRing(f: FenceSnapshot, blink: boolean): void {
    const g = this.ring.clear()
    for (const y of f.yards) {
      const s = f.groups[y.group]!
      if (s.phase === 'idle') continue
      const span = (y.a1 - y.a0) * 0.86
      const a0 = y.a0 + (y.a1 - y.a0) * 0.07
      if (s.phase === 'warn' && !blink) continue
      g.lineStyle(RING_W, s.color, s.phase === 'warn' ? 1 : 0.9)
      g.beginPath()
      g.arc(0, 0, this.radius, a0, a0 + span * Math.max(0.02, Math.min(1, s.ratio)), false)
      g.strokePath()
    }
  }
}
