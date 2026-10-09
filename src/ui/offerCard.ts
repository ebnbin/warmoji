import Phaser from 'phaser'
import type { OutlineKind } from '../emoji/svg'
import { Button } from './button'
import { Chip } from './chip'
import { drawBlock, drawDisc } from './draw'
import type { Rect } from './gesture'
import { Icon } from './icon'
import { Label } from './label'
import { ScrollView } from './scrollView'
import { MOTION, SHAPE, SURFACE, TONE } from './theme'
import type { TextColor, TextKind, Tone } from './theme'
import { Widget } from './widget'

/** 场上的一个人：吃不吃得到这一格货 */
export interface OfferFace {
  readonly emoji: string
  readonly outline?: OutlineKind
  readonly on: boolean
}

/** 这一格货场上谁吃得到：每人一个头像，吃不到的压暗；note 是一句总括 */
export interface OfferFaces {
  readonly faces: readonly OfferFace[]
  readonly note: string
}

export interface OfferLine {
  readonly text: string
  readonly color?: TextColor
}

/** 摆在格子里的货 */
export interface OfferGoods {
  readonly emoji: string
  readonly name: string
  /** 描边、光晕与名字的色调；null 是朴素的 */
  readonly tone: Tone | null
  readonly tag: string
  readonly tagTone: Tone
  readonly lines: readonly OfferLine[]
  /** 效果之后单独一行的小字，例如已持有几件 */
  readonly aside?: string
}

/** open 待售，sold 已买下，empty 没货 */
export type OfferState =
  | { readonly kind: 'open'; readonly goods: OfferGoods; readonly price: string; readonly canBuy: boolean; readonly onBuy: () => void }
  | { readonly kind: 'sold'; readonly goods: OfferGoods; readonly stamp: string; readonly fresh: boolean }
  | { readonly kind: 'empty'; readonly note: string }

export interface OfferCardOptions {
  readonly faces: OfferFaces
  readonly state: OfferState
}

const RADIUS = SHAPE.radius.md + 2
/** 谁吃得到那一栏压在描边以内 */
const INSET = 2
const PAD = 14
/** 竖卡顶上那一栏的高度 */
const BAND_H = 80
/** 横卡左侧那一栏的宽度 */
const SIDE_W = 140
/** 那一栏里的头像与间距；吃不到的头像压暗 */
const FACE = 30
const FACE_GAP = 6
const FACE_OFF = 0.25
/** 横卡右上角购买键的宽度 */
const BUY_W = 176
const LINE_GAP = 5
/** 两列效果之间的空隙 */
const COL_GAP = 16
const SOLD_ALPHA = 0.4

type Side = 'top' | 'left'

/** 排好的效果文字与总高 */
interface Lines {
  readonly labels: Label[]
  readonly height: number
}

/** 能整体调透明度的对象 */
type Fadable = Phaser.GameObjects.GameObject & { readonly alpha: number; setAlpha(value?: number): unknown }

/** 谁吃得到那一栏：竖卡在顶上，总括一行、头像一排；横卡在左侧，总括在上、头像按行排开 */
class FacesBand extends Widget {
  private readonly bandW: number
  private readonly bandH: number
  private readonly side: Side

  constructor(scene: Phaser.Scene, w: number, h: number, side: Side, faces: OfferFaces) {
    super(scene)
    this.bandW = w
    this.bandH = h
    this.side = side
    const bg = scene.add.graphics()
    this.add(bg)
    this.paint(bg)
    if (side === 'top') this.layTop(faces)
    else this.layLeft(faces)
  }

  private face(f: OfferFace, x: number, y: number): Icon {
    return new Icon(this.scene, x, y, f.emoji, FACE, f.outline).setAlpha(f.on ? 1 : FACE_OFF)
  }

  private layTop(o: OfferFaces): void {
    const { bandW: w, bandH: h } = this
    this.add(new Label(this.scene, w / 2, h / 2 - 16, o.note, { kind: 'caption', bold: true, color: 'soft' }).setOrigin(0.5).fit(w - PAD * 2))
    const span = o.faces.length * FACE + (o.faces.length - 1) * FACE_GAP
    o.faces.forEach((f, i) => this.add(this.face(f, (w - span) / 2 + FACE / 2 + i * (FACE + FACE_GAP), h / 2 + 16)))
  }

  private layLeft(o: OfferFaces): void {
    const { bandW: w } = this
    const note = new Label(this.scene, w / 2, PAD, o.note, { kind: 'caption', bold: true, color: 'soft', align: 'center', wrap: w - 16 }).setOrigin(0.5, 0)
    this.add(note)
    const cols = Math.max(1, Math.floor((w - 16 + FACE_GAP) / (FACE + FACE_GAP)))
    const top = note.y + note.height + 10 + FACE / 2
    o.faces.forEach((f, i) => {
      const row = Math.floor(i / cols)
      const inRow = Math.min(cols, o.faces.length - row * cols)
      const span = inRow * FACE + (inRow - 1) * FACE_GAP
      this.add(this.face(f, (w - span) / 2 + FACE / 2 + (i % cols) * (FACE + FACE_GAP), top + row * (FACE + FACE_GAP)))
    })
  }

  private paint(g: Phaser.GameObjects.Graphics): void {
    const { bandW: w, bandH: h } = this
    const r = RADIUS - INSET
    g.clear().fillStyle(SURFACE.sunken, 1)
    g.lineStyle(2, SURFACE.outline, 1)
    if (this.side === 'top') {
      g.fillRoundedRect(INSET, INSET, w - INSET * 2, h - INSET, { tl: r, tr: r, bl: 0, br: 0 })
      g.lineBetween(0, h, w, h)
    } else {
      g.fillRoundedRect(INSET, INSET, w - INSET, h - INSET * 2, { tl: r, tr: 0, bl: r, br: 0 })
      g.lineBetween(w, 0, w, h)
    }
  }
}

/** 商店里的一格：一侧是场上谁吃得到，其余是货；高比宽大时那一栏在上，否则在左。rect 是卡片外沿 */
export class OfferCard extends Widget {
  private readonly cardW: number
  private readonly cardH: number
  private view?: ScrollView
  private stamp?: Chip

  constructor(scene: Phaser.Scene, rect: Rect, opts: OfferCardOptions) {
    super(scene, rect.x, rect.y)
    this.cardW = rect.w
    this.cardH = rect.h
    const { state } = opts
    const tone = state.kind === 'open' ? state.goods.tone : null
    const bg = scene.add.graphics()
    drawBlock(bg, 0, 0, rect.w, rect.h, { face: SURFACE.raised, radius: RADIUS, drop: SHAPE.drop, line: tone ? TONE[tone].face : undefined, lineW: tone ? 4 : SHAPE.line })
    this.add(bg)
    const column = rect.h >= rect.w
    this.add(column ? new FacesBand(scene, rect.w, BAND_H, 'top', opts.faces) : new FacesBand(scene, SIDE_W, rect.h, 'left', opts.faces))
    if (column) this.layColumn(state)
    else this.layRow(state)
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.tweens.killTweensOf([this, ...(this.stamp ? [this.stamp] : []), ...(this.view ? [this.view.content] : [])])
      this.view?.destroy()
    })
  }

  /** 淡入；刷新后逐张亮出 */
  reveal(delay: number): this {
    const targets: Fadable[] = [this, ...(this.view ? [this.view.content] : [])]
    for (const t of targets) {
      const to = t.alpha
      t.setAlpha(0)
      this.scene.tweens.add({ targets: t, alpha: to, delay, duration: MOTION.pop, ease: 'Quad.easeOut' })
    }
    return this
  }

  /** 竖卡：图标、名字与效果作为一块居中，购买键压底 */
  private layColumn(state: OfferState): void {
    const { cardW: w, cardH: h } = this
    const top = BAND_H + 14
    const btnY = h - 44
    const bottom = btnY - 36
    if (state.kind === 'empty') {
      this.add(new Label(this.scene, w / 2, (top + bottom) / 2, state.note, { kind: 'label', color: 'muted', align: 'center', wrap: w - PAD * 2 }).setOrigin(0.5))
      return
    }
    const goods = state.goods
    const room = bottom - top - 58
    const lines = this.fitLines(goods, w - PAD * 2, 'center', room - 56)
    // 效果写得长时图标让出地方
    const size = Phaser.Math.Clamp(Math.min(Math.round(w * 0.36), room - lines.height), 56, 104)
    const headH = size + 58
    const y0 = top + Math.max(0, (bottom - top - headH - lines.height) * 0.45)
    const head = this.goodsIcon(goods, w / 2, y0 + size / 2, size)
    const titleY = y0 + size + 28
    const name = new Label(this.scene, 0, titleY, goods.name, { kind: 'heading', color: goods.tone ?? 'ink' }).setOrigin(0, 0.5)
    const tag = new Chip(this.scene, 0, titleY, goods.tag, { tone: goods.tagTone, originX: 0 })
    name.fit(w - PAD * 2 - 8 - tag.chipWidth)
    const span = name.displayWidth + 8 + tag.chipWidth
    name.setX((w - span) / 2)
    tag.setX(name.x + name.displayWidth + 8)
    head.push(name, tag)
    this.add([name, tag])
    const linesTop = y0 + headH
    this.placeLines(lines, { x: PAD, y: linesTop, w: w - PAD * 2, h: bottom - linesTop })
    this.goodsEnd(state, head, { x: w / 2, y: btnY, w: w - PAD * 2 })
  }

  /** 横卡：图标、名字与购买键一行，效果在下，整块在左侧那一栏的右边居中 */
  private layRow(state: OfferState): void {
    const { cardW: w, cardH: h } = this
    const x0 = SIDE_W + 18
    const right = w - PAD
    if (state.kind === 'empty') {
      this.add(new Label(this.scene, (x0 + right) / 2, h / 2, state.note, { kind: 'label', color: 'muted', align: 'center', wrap: right - x0 }).setOrigin(0.5))
      return
    }
    const goods = state.goods
    const size = Phaser.Math.Clamp(Math.round(h * 0.28), 48, 80)
    const gap = 8
    const lines = this.fitLines(goods, right - x0, 'left', h - PAD - 10 - size - gap, true)
    const y0 = PAD + Math.max(0, (h - PAD * 2 - size - gap - lines.height) * 0.45)
    const rowY = y0 + size / 2
    const head = this.goodsIcon(goods, x0 + size / 2, rowY, size)
    const nameX = x0 + size + 14
    const name = new Label(this.scene, nameX, rowY, goods.name, { kind: 'heading', color: goods.tone ?? 'ink' }).setOrigin(0, 0.5)
    const tag = new Chip(this.scene, 0, rowY, goods.tag, { tone: goods.tagTone, originX: 0 })
    name.fit(right - BUY_W - 20 - tag.chipWidth - 8 - nameX)
    tag.setX(nameX + name.displayWidth + 8)
    head.push(name, tag)
    this.add([name, tag])
    const linesTop = y0 + size + gap
    this.placeLines(lines, { x: x0, y: linesTop, w: right - x0, h: h - 10 - linesTop })
    this.goodsEnd(state, head, { x: right - BUY_W / 2, y: rowY, w: BUY_W })
  }

  /** 光晕与图标，返回售出后要压暗的对象 */
  private goodsIcon(goods: OfferGoods, x: number, y: number, size: number): Fadable[] {
    const halo = this.scene.add.graphics()
    drawDisc(halo, x, y, size * 0.62, { face: goods.tone ? TONE[goods.tone].face : SURFACE.raisedHi, faceAlpha: goods.tone ? 0.22 : 1, line: null })
    const icon = new Icon(this.scene, x, y, goods.emoji, size)
    this.add([halo, icon])
    return [halo, icon]
  }

  /** 效果逐条排好，先量出总高再定位置；pair 时条条都短就左右两列；小字另起一行 */
  private makeLines(goods: OfferGoods, width: number, align: 'left' | 'center', kind: TextKind, pair = false): Lines {
    const x = align === 'center' ? width / 2 : 0
    const originX = align === 'center' ? 0.5 : 0
    let labels: Label[] = []
    let y = 0
    if (pair && goods.lines.length > 1) {
      const colW = (width - COL_GAP) / 2
      labels = goods.lines.map((line) => new Label(this.scene, 0, 0, line.text, { kind, color: line.color ?? 'soft' }))
      if (labels.every((t) => t.width <= colW)) {
        for (let i = 0; i < labels.length; i += 2) {
          const row = labels.slice(i, i + 2)
          row.forEach((t, j) => t.setPosition(j * (colW + COL_GAP), y))
          y += Math.max(...row.map((t) => t.height)) + LINE_GAP
        }
      } else {
        for (const t of labels) t.destroy()
        labels = []
      }
    }
    if (labels.length === 0) {
      labels = goods.lines.map((line) => {
        const t = new Label(this.scene, x, y, line.text, { kind, color: line.color ?? 'soft', align, wrap: width - 10, spacing: 3 }).setOrigin(originX, 0)
        y += t.height + LINE_GAP
        return t
      })
    }
    if (goods.aside) {
      const t = new Label(this.scene, x, y, goods.aside, { kind, color: 'muted', align, wrap: width - 10 }).setOrigin(originX, 0)
      labels.push(t)
      y += t.height + LINE_GAP
    }
    return { labels, height: Math.max(0, y - LINE_GAP) }
  }

  /** 先用正文字号，放不进 room 高再换小一号 */
  private fitLines(goods: OfferGoods, width: number, align: 'left' | 'center', room: number, pair = false): Lines {
    const lines = this.makeLines(goods, width, align, 'label', pair)
    if (lines.height <= room) return lines
    for (const t of lines.labels) t.destroy()
    return this.makeLines(goods, width, align, 'caption', pair)
  }

  /** 效果放进滚动区：通常放得下；放不下时在两条之间截住，余下的拖动查看 */
  private placeLines(lines: Lines, rect: Rect): void {
    const whole = lines.labels.map((t) => t.y + t.height).filter((bottom) => bottom <= rect.h)
    const h = lines.height > rect.h && whole.length > 0 ? Math.max(...whole) + 2 : rect.h
    const view = (this.view = new ScrollView(this.scene, { x: this.x + rect.x, y: this.y + rect.y, w: rect.w, h: Math.max(0, h) }))
    view.add([...lines.labels]).setContentSize(lines.height)
  }

  /** 待售放购买键；已买下压暗货品，购买键的位置盖上戳 */
  private goodsEnd(state: Exclude<OfferState, { kind: 'empty' }>, head: readonly Fadable[], buy: { readonly x: number; readonly y: number; readonly w: number }): void {
    if (state.kind === 'open') {
      this.add(new Button(this.scene, buy.x, buy.y, { label: state.price, size: 'sm', width: buy.w, enabled: state.canBuy, sfx: null, onTap: state.onBuy }))
      return
    }
    for (const o of head) o.setAlpha(SOLD_ALPHA)
    this.view?.content.setAlpha(SOLD_ALPHA)
    const stamp = (this.stamp = new Chip(this.scene, buy.x, buy.y, state.stamp, { tone: 'good', size: 'md' }).setAngle(-6))
    this.add(stamp)
    if (state.fresh) {
      stamp.setScale(1.8)
      this.scene.tweens.add({ targets: stamp, scale: 1, duration: MOTION.pop, ease: 'Back.easeOut' })
    }
  }
}
