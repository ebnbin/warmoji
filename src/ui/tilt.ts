import Phaser from 'phaser'
import { Pill } from './chip'
import { drawDisc } from './draw'
import { INK, SURFACE, TONE } from './theme'
import { Widget } from './widget'
import type { Point } from '../util/vec'
import type { TiltSnapshot } from '../run/hudHost'

const BALL_R = 7
/** 盘沿的刻度数，第一道对着船头或台子的第一条边 */
const TICKS = 12
/** 预警的那条边一明一暗的半周期，毫秒 */
const BLINK_MS = 160

/**
 * 倾斜仪：圆盘里一个与屏幕上的船或台子同朝向的轮廓，一颗小球从盘心滚向低的一侧——东西就往那边滑，离盘心越远倾得越厉害，
 * 滚到盘边就是倾到底；暖色的一圈是站不稳的门槛，小球滚出这圈就变成暖色。盘下的数字是此刻的倾角。
 * 台子的轮廓上，预警里要倾向的那条边一闪一闪，入口开着的那条边亮绿
 */
export class TiltDial extends Widget {
  private readonly ball: Phaser.GameObjects.Graphics
  private readonly edges: Phaser.GameObjects.Graphics
  private readonly reading: Pill
  private readonly reach: number
  private readonly slipDeg: number
  private readonly fullDeg: number
  private readonly corners: readonly Phaser.Math.Vector2[]
  private shown = { x: Infinity, y: Infinity, slip: false, deg: -1, warm: false, next: -2, open: -2, blink: false }

  /** radius 是盘的半径；t 定下轮廓、盘边代表的倾角与站着会滑的门槛 */
  constructor(scene: Phaser.Scene, x: number, y: number, radius: number, t: TiltSnapshot) {
    super(scene, x, y)
    this.slipDeg = t.slipDeg
    this.fullDeg = t.fullDeg
    const well = radius - 6
    this.reach = well - BALL_R - 2
    const face = scene.add.graphics()
    drawDisc(face, 0, 0, radius, { face: SURFACE.bg, faceAlpha: 0.9, drop: 4 })
    face.fillStyle(SURFACE.sunken, 0.95).fillCircle(0, 0, well)
    face.lineStyle(1.5, INK.faint, 0.45).strokeCircle(0, 0, this.reach)
    const o = t.outline
    const first = o.kind === 'hull' ? o.bow : o.normals[0]!
    const firstAt = Math.atan2(first.y, first.x)
    for (let i = 0; i < TICKS; i++) {
      const a = firstAt + (i * 2 * Math.PI) / TICKS
      const inner = well - (i === 0 ? 6 : 3.5)
      face.lineStyle(i === 0 ? 2 : 1.5, i === 0 ? INK.soft : INK.faint, i === 0 ? 0.9 : 0.7)
      face.lineBetween(Math.cos(a) * inner, Math.sin(a) * inner, Math.cos(a) * (well - 1), Math.sin(a) * (well - 1))
    }
    this.corners = o.kind === 'hull' ? hullOutline(this.reach * 1.5, this.reach * 0.5, o.bow) : stageOutline(this.reach * 0.92, o.normals)
    face.fillStyle(SURFACE.raised, 0.7).fillPoints([...this.corners], true)
    face.lineStyle(2, INK.muted, 0.85).strokePoints([...this.corners], true)
    face.lineStyle(2, TONE.warn.face, 0.75).strokeCircle(0, 0, (this.reach * Math.min(t.slipDeg, t.fullDeg)) / t.fullDeg)
    this.edges = scene.add.graphics()
    this.ball = scene.add.graphics()
    this.reading = new Pill(scene, 0, radius + 28, { text: '0°' })
    this.add([face, this.edges, this.ball, this.reading])
  }

  /** t.down 是沿那块面往下的方向（屏幕上的单位向量），t.deg 是此刻的倾角；now 是此刻的时钟，毫秒 */
  setTilt(t: TiltSnapshot, now: number): this {
    const deg = t.deg
    const k = (this.reach * Math.min(deg, this.fullDeg)) / this.fullDeg
    const x = t.down.x * k
    const y = t.down.y * k
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
      s.x = x
      s.y = y
      s.slip = slip
    }
    const blink = Math.floor(now / BLINK_MS) % 2 === 0
    if (t.next !== s.next || t.open !== s.open || (t.next >= 0 && blink !== s.blink)) {
      const g = this.edges.clear()
      const side = (i: number, color: number, alpha: number): void => {
        const n = this.corners.length
        const a = this.corners[(i - 1 + n) % n]!
        const b = this.corners[i]!
        g.lineStyle(5, color, alpha).lineBetween(a.x, a.y, b.x, b.y)
      }
      if (t.open >= 0) side(t.open, TONE.good.face, 1)
      if (t.next >= 0 && blink) side(t.next, TONE.warn.face, 1)
      s.next = t.next
      s.open = t.open
      s.blink = blink
    }
    const shownDeg = Math.round(deg)
    if (shownDeg !== s.deg || slip !== s.warm) {
      this.reading.setText(`${shownDeg}°`).setInk(slip ? 'warn' : 'ink')
      s.deg = shownDeg
      s.warm = slip
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

/** 从上往下看的正多边形台面：边心距 apo，各边朝外的法线是 normals；第 k 个顶点夹在第 k 条边与第 k+1 条边之间 */
function stageOutline(apo: number, normals: readonly Point[]): Phaser.Math.Vector2[] {
  const n = normals.length
  const r = apo / Math.cos(Math.PI / n)
  return normals.map((a, k) => {
    const b = normals[(k + 1) % n]!
    const mx = a.x + b.x
    const my = a.y + b.y
    const len = Math.hypot(mx, my) || 1
    return new Phaser.Math.Vector2((mx / len) * r, (my / len) * r)
  })
}
