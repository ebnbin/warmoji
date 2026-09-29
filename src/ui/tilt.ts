import Phaser from 'phaser'
import { Pill } from './chip'
import { drawDisc } from './draw'
import { INK, SURFACE, TONE } from './theme'
import { Widget } from './widget'
import type { Point } from '../util/vec'

/** 盘边代表的倾角，度：再倾也压在盘边上 */
const FULL_DEG = 10
const BALL_R = 7
/** 盘沿的刻度数，第一道对着船头 */
const TICKS = 12

/**
 * 倾斜仪：圆盘里一个与屏幕上的船同朝向的船形轮廓，一颗小球从盘心滚向低的一侧——东西就往那边滑，
 * 离盘心越远倾得越厉害；暖色的一圈是站不稳的门槛，小球滚出这圈就变成暖色。盘下的数字是此刻的倾角
 */
export class TiltDial extends Widget {
  private readonly ball: Phaser.GameObjects.Graphics
  private readonly reading: Pill
  private readonly reach: number
  private readonly slipDeg: number
  private shown = { x: Infinity, y: Infinity, slip: false, deg: -1 }

  /** radius 是盘的半径；bow 是船头在屏幕上的朝向；slipDeg 是站着会滑的倾角 */
  constructor(scene: Phaser.Scene, x: number, y: number, radius: number, bow: Point, slipDeg: number) {
    super(scene, x, y)
    this.slipDeg = slipDeg
    const well = radius - 6
    this.reach = well - BALL_R - 2
    const face = scene.add.graphics()
    drawDisc(face, 0, 0, radius, { face: SURFACE.bg, faceAlpha: 0.9, drop: 4 })
    face.fillStyle(SURFACE.sunken, 0.95).fillCircle(0, 0, well)
    face.lineStyle(1.5, INK.faint, 0.45).strokeCircle(0, 0, this.reach)
    const bowAt = Math.atan2(bow.y, bow.x)
    for (let i = 0; i < TICKS; i++) {
      const a = bowAt + (i * 2 * Math.PI) / TICKS
      const inner = well - (i === 0 ? 6 : 3.5)
      face.lineStyle(i === 0 ? 2 : 1.5, i === 0 ? INK.soft : INK.faint, i === 0 ? 0.9 : 0.7)
      face.lineBetween(Math.cos(a) * inner, Math.sin(a) * inner, Math.cos(a) * (well - 1), Math.sin(a) * (well - 1))
    }
    const hull = hullOutline(this.reach * 1.5, this.reach * 0.5, bow)
    face.fillStyle(SURFACE.raised, 0.7).fillPoints(hull, true)
    face.lineStyle(2, INK.muted, 0.85).strokePoints(hull, true)
    face.lineStyle(2, TONE.warn.face, 0.75).strokeCircle(0, 0, (this.reach * Math.min(slipDeg, FULL_DEG)) / FULL_DEG)
    this.ball = scene.add.graphics()
    this.reading = new Pill(scene, 0, radius + 28, { text: '0°' })
    this.add([face, this.ball, this.reading])
  }

  /** down 是沿甲板往下的方向（屏幕上的单位向量），deg 是此刻的倾角 */
  setTilt(down: Point, deg: number): this {
    const k = (this.reach * Math.min(deg, FULL_DEG)) / FULL_DEG
    const x = down.x * k
    const y = down.y * k
    const slip = deg > this.slipDeg
    const s = this.shown
    if (Math.abs(x - s.x) > 0.3 || Math.abs(y - s.y) > 0.3 || slip !== s.slip) {
      const g = this.ball.clear()
      if (k > 2) g.lineStyle(2, INK.soft, 0.45).lineBetween(0, 0, x, y)
      g.fillStyle(INK.faint, 0.9).fillCircle(0, 0, 2.5)
      g.fillStyle(SURFACE.outline, 1).fillCircle(x, y + 2, BALL_R)
      g.fillStyle(slip ? TONE.warn.face : INK.ink, 1).fillCircle(x, y, BALL_R)
      g.lineStyle(2, SURFACE.outline, 1).strokeCircle(x, y, BALL_R)
      g.fillStyle(INK.ink, 0.55).fillCircle(x - BALL_R * 0.3, y - BALL_R * 0.35, BALL_R * 0.3)
      this.shown = { x, y, slip, deg: s.deg }
    }
    const shownDeg = Math.round(deg)
    if (shownDeg !== s.deg || slip !== s.slip) {
      this.reading.setText(`${shownDeg}°`).setInk(slip ? 'warn' : 'ink')
      this.shown.deg = shownDeg
    }
    return this
  }
}

/** 从上往下看的船形：船尾平、船头尖，len 沿 bow 方向，右舷在 bow 顺时针转 90° 那侧 */
function hullOutline(len: number, beam: number, bow: Point): Phaser.Math.Vector2[] {
  const side = { x: -bow.y, y: bow.x }
  const at = (u: number, v: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(bow.x * u + side.x * v, bow.y * u + side.y * v)
  const half = beam / 2
  const taper = len * 0.42
  const shoulder = len / 2 - taper
  const star = [at(-len / 2, half * 0.62), at(-len / 2 + len * 0.1, half)]
  for (let k = 0; k <= 8; k++) {
    const u = shoulder + (taper * k) / 8
    star.push(at(u, half * Math.cos((Math.PI / 2) * (k / 8))))
  }
  const port = star.slice(0, -1).reverse().map((p) => {
    const u = p.x * bow.x + p.y * bow.y
    const v = p.x * side.x + p.y * side.y
    return at(u, -v)
  })
  return [...star, ...port]
}
