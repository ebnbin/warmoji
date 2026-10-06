import Phaser from 'phaser'
import { Pill } from './chip'
import { drawDisc } from './draw'
import { INK, SURFACE, TONE } from './theme'
import { Widget } from './widget'

/** 泥色取自 Twemoji 的棕：泥面、泥身与暗处 */
const MUD = { top: 0xd99e82, body: 0xc1694f, deep: 0x8a4b38 } as const
const RING_W = 6
const PIP_R = 6
/** 小人从脚到下巴占盘里的哪一段（占盘半径的比例，向下为正） */
const FEET = 0.66
const CHIN = -0.2

/** 一个队员陷得怎样：深度（0 到 1），被困住了没有，是不是队长，倒下了没有 */
export interface MirePip {
  readonly d: number
  readonly trapped: boolean
  readonly leader: boolean
  readonly down: boolean
}

/**
 * 陷泥表：盘心一个小人站在泥里，泥面随队长陷的深浅从脚漫到下巴，盘边两道刻度是被困住与呛泥的线；
 * 被困住时外圈闪橙光、圈上是此刻挣的劲，呛泥时整圈闪红；盘底一排小圆点是每个队员陷了多深。盘下右对齐写着队长此刻的处境
 */
export class MireDial extends Widget {
  private readonly ring: Phaser.GameObjects.Graphics
  private readonly glyph: Phaser.GameObjects.Graphics
  private readonly pips: Phaser.GameObjects.Graphics
  private readonly reading: Pill
  private readonly well: number
  private readonly outer: number
  private shown = { key: '', pips: '', text: '' }

  constructor(scene: Phaser.Scene, x: number, y: number, radius: number) {
    super(scene, x, y)
    this.well = radius - 6
    this.outer = radius - 6 - RING_W / 2 - 1
    const face = scene.add.graphics()
    drawDisc(face, 0, 0, radius, { face: SURFACE.bg, faceAlpha: 0.9, drop: 4 })
    face.fillStyle(SURFACE.sunken, 0.95).fillCircle(0, 0, this.well)
    this.glyph = scene.add.graphics()
    this.ring = scene.add.graphics()
    this.pips = scene.add.graphics()
    this.reading = new Pill(scene, radius, radius + 28, { text: '', originX: 1 })
    this.add([face, this.glyph, this.ring, this.pips, this.reading])
  }

  /** lead 是队长陷的深度，trapped、effort 是困没困住、此刻挣了几成劲，firm 是脚下是不是实地；trap、choke 是两道线；pips 是每个队员 */
  setMire(lead: number, trapped: boolean, effort: number, firm: boolean, trap: number, choke: number, pips: readonly MirePip[], now: number): this {
    const choking = lead >= choke
    const blink = Math.floor(now / 240) % 2 === 0
    const key = `${Math.round(lead * 200)}|${trapped}|${Math.round(effort * 20)}|${choking && blink}|${trapped && blink}`
    if (key !== this.shown.key) {
      this.drawGlyph(lead, trap, choke)
      this.drawRing(trapped, effort, choking, blink)
      this.shown.key = key
    }
    const pk = pips.map((p) => `${Math.round(p.d * 20)}${p.trapped ? 't' : ''}${p.leader ? 'l' : ''}${p.down ? 'x' : ''}`).join(',') + (blink ? '!' : '')
    if (pk !== this.shown.pips) {
      this.drawPips(pips, choke, blink)
      this.shown.pips = pk
    }
    const text = choking ? '呛泥！快挣出来' : trapped ? '被困！朝一个方向挣' : lead > 0.02 ? `陷了 ${Math.round(lead * 100)}%${firm ? '，在拔' : ''}` : firm ? '踩在实地' : '刚沾泥'
    if (text !== this.shown.text) {
      this.reading.setText(text).setInk(choking ? 'bad' : trapped ? 'warn' : 'ink')
      this.shown.text = text
    }
    return this
  }

  /** 深度 d 时泥面在盘里的纵坐标 */
  private level(d: number): number {
    return (FEET + (CHIN - FEET) * Math.max(0, Math.min(1, d))) * this.well
  }

  /** 小人、漫上来的泥与两道刻度 */
  private drawGlyph(lead: number, trap: number, choke: number): void {
    const g = this.glyph.clear()
    const W = this.well
    // 小人：圆头、圆肩的身子
    g.fillStyle(SURFACE.outline, 1)
    g.fillCircle(0, -0.36 * W, 0.19 * W)
    g.fillRoundedRect(-0.29 * W, -0.16 * W, 0.58 * W, 0.86 * W, 0.2 * W)
    g.fillStyle(INK.soft, 1)
    g.fillCircle(0, -0.36 * W, 0.16 * W)
    g.fillRoundedRect(-0.26 * W, -0.13 * W, 0.52 * W, 0.83 * W, 0.17 * W)
    // 泥：盘里泥面以下那一截弓形
    const y = this.level(lead)
    if (y < W - 1) {
      const half = Math.acos(Math.max(-1, Math.min(1, y / W)))
      const pts: Phaser.Math.Vector2[] = []
      for (let i = 0; i <= 32; i++) {
        const a = Math.PI / 2 - half + (i / 32) * half * 2
        pts.push(new Phaser.Math.Vector2(Math.cos(a) * W, Math.sin(a) * W))
      }
      g.fillStyle(MUD.body, 1).fillPoints(pts, true)
      const w = Math.sqrt(Math.max(0, W * W - y * y))
      g.fillStyle(MUD.deep, 1).fillEllipse(0, y, 0.78 * W, 0.16 * W)
      g.lineStyle(2, MUD.top, 1).lineBetween(-w + 2, y, w - 2, y)
      g.lineStyle(2, MUD.top, 0.9).strokeEllipse(0, y, 0.78 * W, 0.16 * W)
    }
    // 刻度：被困住与呛泥的那两道线，从盘边往里伸一截
    for (const [d, color] of [
      [trap, TONE.warn.face],
      [choke, TONE.bad.face],
    ] as const) {
      const ty = this.level(d)
      const w = Math.sqrt(Math.max(0, W * W - ty * ty))
      g.lineStyle(3, color, 1)
      g.lineBetween(-w, ty, -w + 0.22 * W, ty)
      g.lineBetween(w - 0.22 * W, ty, w, ty)
    }
  }

  private drawRing(trapped: boolean, effort: number, choking: boolean, blink: boolean): void {
    const g = this.ring.clear()
    if (choking) {
      g.lineStyle(RING_W, TONE.bad.face, blink ? 1 : 0.35).strokeCircle(0, 0, this.outer)
      return
    }
    if (!trapped) return
    g.lineStyle(RING_W, TONE.warn.face, blink ? 0.5 : 0.25).strokeCircle(0, 0, this.outer)
    if (effort <= 0.02) return
    g.lineStyle(RING_W, TONE.warn.face, 1)
    g.beginPath()
    g.arc(0, 0, this.outer, -Math.PI / 2, -Math.PI / 2 + effort * Math.PI * 2, false)
    g.strokePath()
  }

  /** 盘底一排小圆点：每个队员一个，泥从下往上填到他陷的深浅；被困住描橙边，呛泥闪红，倒下的灰掉，队长的大一圈 */
  private drawPips(pips: readonly MirePip[], choke: number, blink: boolean): void {
    const g = this.pips.clear()
    const n = pips.length
    if (n <= 1) return
    const span = Math.min(Math.PI * 0.7, n * 0.24)
    const r = this.well + 10
    pips.forEach((p, i) => {
      const a = Math.PI / 2 + span / 2 - (n === 1 ? 0.5 : i / (n - 1)) * span
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      const rad = p.leader ? PIP_R + 1.5 : PIP_R
      const edge = p.down ? SURFACE.outline : p.d >= choke ? (blink ? TONE.bad.face : SURFACE.outline) : p.trapped ? TONE.warn.face : SURFACE.outline
      g.fillStyle(edge, 1).fillCircle(x, y, rad + 2)
      g.fillStyle(p.down ? SURFACE.raised : INK.soft, 1).fillCircle(x, y, rad)
      if (p.down || p.d <= 0.01) return
      const top = y + rad - 2 * rad * Math.min(1, p.d)
      const half = Math.acos(Math.max(-1, Math.min(1, (top - y) / rad)))
      const pts: Phaser.Math.Vector2[] = []
      for (let k = 0; k <= 12; k++) {
        const t = Math.PI / 2 - half + (k / 12) * half * 2
        pts.push(new Phaser.Math.Vector2(x + Math.cos(t) * rad, y + Math.sin(t) * rad))
      }
      g.fillStyle(MUD.body, 1).fillPoints(pts, true)
    })
  }
}
