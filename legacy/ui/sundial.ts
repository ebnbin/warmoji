import Phaser from 'phaser'
import { Pill } from './chip'
import { drawDisc } from './draw'
import { INK, SURFACE, TONE } from './theme'
import { Widget } from './widget'

const SUN_R = 7
const MOON_R = 6.5

/**
 * 时辰盘：盘面是天，水平线以上是白天的天空、以下是地平线下；太阳与月亮沿一圈转，正午在顶、午夜在底，
 * 日出在左、日落在右（和地图上光的来向一致）；月亮按月相画出亮的那一侧朝着太阳。盘下右对齐写着离天黑或天亮还有几秒
 */
export class Sundial extends Widget {
  private readonly bodies: Phaser.GameObjects.Graphics
  private readonly reading: Pill
  private readonly orbit: number
  private shown = { sun: NaN, moon: NaN, phase: NaN, text: '' }

  constructor(scene: Phaser.Scene, x: number, y: number, radius: number) {
    super(scene, x, y)
    const well = radius - 6
    this.orbit = well - SUN_R - 3
    const face = scene.add.graphics()
    drawDisc(face, 0, 0, radius, { face: SURFACE.bg, faceAlpha: 0.9, drop: 4 })
    face.fillStyle(SURFACE.sunken, 0.95).fillCircle(0, 0, well)
    face.fillStyle(TONE.accent.face, 0.1).slice(0, 0, well, Math.PI, Math.PI * 2, false).fillPath()
    face.fillStyle(TONE.info.face, 0.1).slice(0, 0, well, 0, Math.PI, false).fillPath()
    face.lineStyle(1.5, INK.faint, 0.45).strokeCircle(0, 0, this.orbit)
    face.lineStyle(2, INK.muted, 0.8).lineBetween(-well + 2, 0, well - 2, 0)
    this.bodies = scene.add.graphics()
    this.reading = new Pill(scene, radius, radius + 28, { text: '', originX: 1 })
    this.add([face, this.bodies, this.reading])
  }

  /** sun、moon 是太阳与月亮的时角（弧度，正午为 0、往西为正）；phase 是月龄占朔望月的比例；night 为真时下一件事是天亮，inSec 是还有几秒 */
  setSky(sun: number, moon: number, phase: number, night: boolean, inSec: number): this {
    const s = this.shown
    if (Math.abs(sun - s.sun) > 0.004 || Math.abs(moon - s.moon) > 0.004 || Math.abs(phase - s.phase) > 0.002) {
      this.drawBodies(sun, moon, phase)
      s.sun = sun
      s.moon = moon
      s.phase = phase
    }
    const text = `${Math.max(0, Math.ceil(inSec))} 秒后${night ? '天亮' : '天黑'}`
    if (text !== s.text) {
      this.reading.setText(text).setInk(night ? 'muted' : 'ink')
      s.text = text
    }
    return this
  }

  private drawBodies(sun: number, moon: number, phase: number): void {
    const g = this.bodies.clear()
    const at = (h: number): { x: number; y: number } => ({ x: Math.sin(h) * this.orbit, y: -Math.cos(h) * this.orbit })
    const su = at(sun)
    const mo = at(moon)
    // 月亮：暗面是底，亮面朝着太阳；月相角按月龄算，满月整个亮、朔整个暗
    const toward = Math.atan2(su.y - mo.y, su.x - mo.x)
    const lit = (1 - Math.cos(phase * Math.PI * 2)) / 2
    g.fillStyle(SURFACE.outline, 1).fillCircle(mo.x, mo.y + 2, MOON_R)
    g.fillStyle(SURFACE.raised, 1).fillCircle(mo.x, mo.y, MOON_R)
    if (lit > 0.02) {
      const pts: Phaser.Math.Vector2[] = []
      const k = 1 - 2 * lit
      for (let i = 0; i <= 24; i++) {
        const a = -Math.PI / 2 + (i / 24) * Math.PI
        pts.push(new Phaser.Math.Vector2(Math.cos(a) * MOON_R, Math.sin(a) * MOON_R))
      }
      for (let i = 24; i >= 0; i--) {
        const a = -Math.PI / 2 + (i / 24) * Math.PI
        pts.push(new Phaser.Math.Vector2(Math.cos(a) * MOON_R * k, Math.sin(a) * MOON_R))
      }
      const c = Math.cos(toward)
      const sn = Math.sin(toward)
      g.fillStyle(INK.ink, 0.95).fillPoints(
        pts.map((p) => new Phaser.Math.Vector2(mo.x + p.x * c - p.y * sn, mo.y + p.x * sn + p.y * c)),
        true,
      )
    }
    g.lineStyle(1.5, SURFACE.outline, 1).strokeCircle(mo.x, mo.y, MOON_R)
    // 太阳：地平线下的淡一些
    const up = su.y < 0
    g.fillStyle(SURFACE.outline, 1).fillCircle(su.x, su.y + 2, SUN_R)
    g.fillStyle(TONE.accent.face, up ? 1 : 0.55).fillCircle(su.x, su.y, SUN_R)
    g.lineStyle(2, TONE.accent.lip, up ? 1 : 0.55).strokeCircle(su.x, su.y, SUN_R)
  }
}
