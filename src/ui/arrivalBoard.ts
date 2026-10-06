import Phaser from 'phaser'
import { drawBlock } from './draw'
import { Label } from './label'
import { INK, SURFACE, TONE } from './theme'
import { Widget } from './widget'
import type { TextColor } from './theme'

const W = 232
const ROW_H = 40
const PAD = 10
const BADGE_R = 13
const BAR_H = 4

/** 一条轨道这一行：车往屏幕上哪个方向开；等车、预警、进站、停靠、快关门、出站；还有几秒、这一段还剩几成，是不是专列 */
export interface BoardRow {
  readonly label: number
  readonly color: number
  readonly arrow: 'left' | 'right' | 'up' | 'down'
  readonly state: 'wait' | 'warn' | 'arrive' | 'open' | 'closing' | 'depart'
  readonly inSec: number
  readonly ratio: number
  readonly express: boolean
}

/**
 * 到站牌：每条轨道一行，左边是线路色的圆牌写着几号线和车往哪边开，右边写着下一班还有几秒进站、停着还有几秒关门；
 * 预警与快关门时整行闪，底下一道细条是这一段还剩多少
 */
export class ArrivalBoard extends Widget {
  private readonly g: Phaser.GameObjects.Graphics
  private readonly texts: Label[] = []
  private shown: string[] = []

  constructor(scene: Phaser.Scene, right: number, top: number, rows: number) {
    super(scene, right - W, top)
    const face = scene.add.graphics()
    const h = PAD * 2 + rows * ROW_H
    drawBlock(face, 0, 0, W, h, { face: SURFACE.bg, faceAlpha: 0.9, radius: 14, drop: 4 })
    face.fillStyle(SURFACE.sunken, 0.95).fillRoundedRect(4, 4, W - 8, h - 8, 11)
    this.g = scene.add.graphics()
    this.add([face, this.g])
    for (let i = 0; i < rows; i++) {
      const t = new Label(scene, PAD + BADGE_R * 2 + 26, PAD + i * ROW_H + ROW_H / 2 - 3, '', { kind: 'label', bold: true }).setOrigin(0, 0.5)
      this.texts.push(t)
      this.add(t)
    }
  }

  setRows(rows: readonly BoardRow[], now: number): this {
    const blink = Math.floor(now / 260) % 2 === 0
    const g = this.g.clear()
    rows.forEach((r, i) => {
      const y = PAD + i * ROW_H
      const mid = y + ROW_H / 2 - 3
      const urgent = r.state === 'warn' || r.state === 'closing'
      if (urgent && blink) g.fillStyle(r.state === 'warn' ? TONE.warn.face : TONE.bad.face, 0.16).fillRoundedRect(6, y + 2, W - 12, ROW_H - 4, 8)
      const bx = PAD + BADGE_R
      g.fillStyle(SURFACE.outline, 1).fillCircle(bx, mid + 2, BADGE_R)
      g.fillStyle(r.express ? TONE.accent.face : r.color, 1).fillCircle(bx, mid, BADGE_R)
      g.fillStyle(0xffffff, 0.22).fillEllipse(bx, mid - BADGE_R * 0.5, BADGE_R * 1.2, BADGE_R * 0.5)
      this.digit(g, r.label, bx, mid)
      this.arrow(g, r.arrow, bx + BADGE_R + 13, mid, r.state === 'wait' ? INK.faint : INK.soft)
      const x0 = PAD + BADGE_R * 2 + 26
      const bw = W - x0 - PAD - 4
      g.fillStyle(SURFACE.raised, 1).fillRoundedRect(x0, y + ROW_H - 9, bw, BAR_H, 2)
      const tone = r.state === 'open' ? TONE.good.face : r.state === 'closing' ? TONE.bad.face : r.state === 'wait' ? TONE.info.face : TONE.warn.face
      const left = Math.max(0, Math.min(1, r.ratio))
      if (left > 0) g.fillStyle(tone, 1).fillRoundedRect(x0, y + ROW_H - 9, Math.max(BAR_H, bw * left), BAR_H, 2)
      const sec = Math.max(0, Math.ceil(r.inSec))
      const head = r.express ? '专列' : ''
      const text =
        r.state === 'wait' || r.state === 'warn'
          ? `${head}${sec} 秒后进站`
          : r.state === 'arrive'
            ? `${head}进站中`
            : r.state === 'open'
              ? `${head}停靠 ${sec} 秒`
              : r.state === 'closing'
                ? `${head}关门 ${sec} 秒`
                : `${head}出站中`
      const ink: TextColor = r.state === 'wait' ? 'soft' : r.state === 'open' ? 'good' : r.state === 'closing' ? 'bad' : 'warn'
      const key = `${text}|${ink}`
      const label = this.texts[i]
      if (label && this.shown[i] !== key) {
        label.setText(text).setInk(ink).fit(bw)
        this.shown[i] = key
      }
    })
    return this
  }

  /** 圆牌上的线路号：几段粗线拼的数字，不随字体变 */
  private digit(g: Phaser.GameObjects.Graphics, n: number, x: number, y: number): void {
    const s = BADGE_R * 0.5
    const segs: Record<number, readonly (readonly [number, number, number, number])[]> = {
      1: [[0.15, -1, 0.15, 1], [-0.35, -0.6, 0.15, -1]],
      2: [[-0.6, -1, 0.6, -1], [0.6, -1, 0.6, 0], [0.6, 0, -0.6, 0], [-0.6, 0, -0.6, 1], [-0.6, 1, 0.6, 1]],
      3: [[-0.6, -1, 0.6, -1], [0.6, -1, 0.6, 1], [-0.4, 0, 0.6, 0], [-0.6, 1, 0.6, 1]],
    }
    g.lineStyle(3.4, SURFACE.outline, 1)
    for (const [ax, ay, bx, by] of segs[n] ?? []) g.lineBetween(x + ax * s, y + ay * s * 1.1, x + bx * s, y + by * s * 1.1)
  }

  private arrow(g: Phaser.GameObjects.Graphics, dir: BoardRow['arrow'], x: number, y: number, color: number): void {
    const a = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir]
    const c = Math.cos(a)
    const s = Math.sin(a)
    const p = (u: number, v: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(x + u * c - v * s, y + u * s + v * c)
    g.fillStyle(color, 1)
    g.fillPoints([p(9, 0), p(-1, -8), p(-1, -3.5), p(-8, -3.5), p(-8, 3.5), p(-1, 3.5), p(-1, 8)], true)
  }
}
