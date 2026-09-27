import Phaser from 'phaser'
import type { OutlineKind } from '../emoji/svg'
import { Button } from './button'
import { Chip } from './chip'
import { drawBlock, drawDisc } from './draw'
import { ProgressBar } from './gauge'
import type { GaugeTone } from './gauge'
import { pressable } from './gesture'
import type { Rect } from './gesture'
import { Icon } from './icon'
import { Label, RichLabel } from './label'
import type { Segment } from './label'
import { ScrollView } from './scrollView'
import { MOTION, SHAPE, SURFACE, TONE } from './theme'
import type { TextColor, TextKind, Tone } from './theme'
import { Widget } from './widget'

/** 这一格货归谁：头像、名字、等级与经验 */
export interface OfferOwner {
  readonly emoji: string
  readonly outline?: OutlineKind
  readonly name: string
  /** 等级字样，例如 Lv 2 */
  readonly level: string
  /** 经验进度，0 到 1 */
  readonly xp: number
  /** 买下后会到的经验进度 */
  readonly xpAfter?: number
  readonly xpTone: GaugeTone
  /** 经验条旁的短字，例如 +8 */
  readonly note?: string
  readonly noteColor?: TextColor
  /** 点主人一栏 */
  readonly onTap?: () => void
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
  readonly owner: OfferOwner
  readonly state: OfferState
}

const RADIUS = SHAPE.radius.md + 2
/** 主人栏压在描边以内 */
const INSET = 2
const PAD = 14
/** 竖卡顶上主人栏的高度 */
const BAND_H = 80
/** 横卡左侧主人栏的宽度 */
const SIDE_W = 140
/** 横卡右上角购买键的宽度 */
const BUY_W = 176
const LINE_GAP = 5
/** 两列效果之间的空隙 */
const COL_GAP = 16
const SOLD_ALPHA = 0.4

type Side = 'top' | 'left'

/** 能整体调透明度的对象 */
type Fadable = Phaser.GameObjects.GameObject & { readonly alpha: number; setAlpha(value?: number): unknown }

/** 主人一栏：竖卡在顶上横排，横卡在左侧竖排 */
class OwnerBand extends Widget {
  private readonly bg: Phaser.GameObjects.Graphics
  private readonly bandW: number
  private readonly bandH: number
  private readonly side: Side

  constructor(scene: Phaser.Scene, w: number, h: number, side: Side, owner: OfferOwner) {
    super(scene)
    this.bandW = w
    this.bandH = h
    this.side = side
    this.bg = scene.add.graphics()
    this.add(this.bg)
    this.paint(false)
    if (side === 'top') this.layTop(owner)
    else this.layLeft(owner)
    const onTap = owner.onTap
    if (onTap) pressable(this, { shape: new Phaser.Geom.Rectangle(0, 0, w, h), onTap, onPress: (down) => this.paint(down) })
  }

  private layTop(o: OfferOwner): void {
    const { bandW: w, bandH: h } = this
    const avatar = 52
    const x = PAD + avatar + 12
    const nameY = h / 2 - 13
    const barY = h / 2 + 15
    this.add(new Icon(this.scene, PAD + avatar / 2, h / 2, o.emoji, avatar, o.outline))
    const level = new Label(this.scene, w - PAD, nameY, o.level, { kind: 'caption', bold: true, color: 'accent' }).setOrigin(1, 0.5)
    const name = new Label(this.scene, x, nameY, o.name, { kind: 'label', bold: true }).setOrigin(0, 0.5)
    name.fit(level.x - level.width - 8 - x)
    this.add([name, level])
    let right = w - PAD
    if (o.note) {
      const note = new Label(this.scene, right, barY, o.note, { kind: 'caption', bold: true, color: o.noteColor ?? 'info' }).setOrigin(1, 0.5)
      this.add(note)
      right -= note.width + 8
    }
    this.add(new ProgressBar(this.scene, x, barY - 5, Math.max(12, right - x), 10, { tone: o.xpTone, value: o.xp, preview: o.xpAfter }))
  }

  private layLeft(o: OfferOwner): void {
    const { bandW: w, bandH: h } = this
    const avatar = 56
    const top = Math.max(PAD, (h - 132) / 2)
    const nameY = top + avatar + 20
    const rowY = nameY + 28
    this.add(new Icon(this.scene, w / 2, top + avatar / 2, o.emoji, avatar, o.outline))
    this.add(new Label(this.scene, w / 2, nameY, o.name, { kind: 'label', bold: true }).setOrigin(0.5).fit(w - 20))
    const row: Segment[] = [{ text: o.level, color: 'accent' }, ...(o.note ? [{ text: o.note, color: o.noteColor ?? 'info' }] : [])]
    this.add(new RichLabel(this.scene, w / 2, rowY, row, { kind: 'caption', bold: true, gap: 8, originX: 0.5, maxWidth: w - 16 }))
    this.add(new ProgressBar(this.scene, 16, rowY + 16, w - 32, 10, { tone: o.xpTone, value: o.xp, preview: o.xpAfter }))
  }

  private paint(down: boolean): void {
    const { bandW: w, bandH: h } = this
    const r = RADIUS - INSET
    const g = this.bg.clear().fillStyle(down ? SURFACE.bg : SURFACE.sunken, 1)
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

/** 商店里的一格：一侧是主人，其余是给他的货；高比宽大时主人在上，否则主人在左。rect 是卡片外沿 */
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
    this.add(column ? new OwnerBand(scene, rect.w, BAND_H, 'top', opts.owner) : new OwnerBand(scene, SIDE_W, rect.h, 'left', opts.owner))
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
    const lines = this.makeLines(goods, w - PAD * 2, 'center', w < 260 ? 'caption' : 'label')
    // 效果写得长时图标让出地方
    const size = Phaser.Math.Clamp(Math.min(Math.round(w * 0.36), bottom - top - 58 - lines.height), 56, 104)
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

  /** 横卡：图标、名字与购买键一行，效果在下，整块在主人栏右侧居中 */
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
    const lines = this.makeLines(goods, right - x0, 'left', 'label', true)
    const gap = 8
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
  private makeLines(goods: OfferGoods, width: number, align: 'left' | 'center', kind: TextKind, pair = false): { labels: Label[]; height: number } {
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

  /** 效果放进滚动区：通常放得下，放不下时可拖动 */
  private placeLines(lines: { readonly labels: readonly Label[]; readonly height: number }, rect: Rect): void {
    const view = (this.view = new ScrollView(this.scene, { x: this.x + rect.x, y: this.y + rect.y, w: rect.w, h: Math.max(0, rect.h) }))
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
