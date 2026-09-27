import Phaser from 'phaser'
import { STAT_KEYS, STATS, statValue } from '../data/stats'
import { emojiImage } from '../emoji/hold'
import { textRes } from '../util/apply'
import { FONT, UI_FONT } from '../util/fonts'
import { roundRect } from '../ui/shapes'
import { ScrollView } from '../ui/scroll'
import type { ScrollRect } from '../ui/scroll'
import type { MemberSheet } from '../run/hudHost'

const PAD = 16
const TAB = { h: 96, maxW: 150, gap: 10, emoji: 44 } as const
const HEAD_H = 84
const ROW_H = 46
const COL_GAP = 24
/** 列表区宽于它就把属性排成两列 */
const TWO_COLS = 900

interface Tab {
  readonly bg: Phaser.GameObjects.Graphics
  readonly name: Phaser.GameObjects.Text
  readonly rect: ScrollRect
}

/** 暂停页的队伍属性：每名队员一个页签，页里逐项列出属性目录，放不下就滚动；此刻的值与常驻值不同的高亮并附上常驻值 */
export class TeamStatsPanel {
  private readonly scene: Phaser.Scene
  private readonly sheets: readonly MemberSheet[]
  private readonly onSelect: (slot: number) => void
  private readonly objs: Phaser.GameObjects.GameObject[] = []
  private readonly tabs: Tab[] = []
  private readonly view: ScrollView
  private selected = -1

  constructor(scene: Phaser.Scene, rect: ScrollRect, sheets: readonly MemberSheet[], slot: number, depth: number, onSelect: (slot: number) => void) {
    this.scene = scene
    this.sheets = sheets
    this.onSelect = onSelect
    const res = textRes()

    const card = scene.add.graphics().setDepth(depth)
    roundRect(card, rect.x, rect.y, rect.w, rect.h, 22, { fill: 0x1c1d26, fillAlpha: 0.92, stroke: 0xffffff, strokeAlpha: 0.12 })
    // 挡住面板下面的摇杆：在面板上拖动只滚动列表
    const block = scene.add.zone(rect.x, rect.y, rect.w, rect.h).setOrigin(0).setDepth(depth).setInteractive()
    this.objs.push(card, block)

    const n = sheets.length
    const tw = Math.min(TAB.maxW, (rect.w - PAD * 2 - TAB.gap * (n - 1)) / n)
    const x0 = rect.x + (rect.w - (tw * n + TAB.gap * (n - 1))) / 2
    const y0 = rect.y + PAD
    sheets.forEach((s, i) => {
      const r = { x: x0 + i * (tw + TAB.gap), y: y0, w: tw, h: TAB.h }
      const bg = scene.add.graphics().setDepth(depth + 1)
      const face = emojiImage(scene, r.x + tw / 2, r.y + 38, s.emoji, TAB.emoji, 'player')
        .setDepth(depth + 2)
        .setAlpha(s.alive ? 1 : 0.4)
      const name = scene.add
        .text(r.x + tw / 2, r.y + 80, s.name, { fontFamily: UI_FONT, fontSize: FONT.caption, resolution: res })
        .setOrigin(0.5)
        .setDepth(depth + 2)
      if (name.width > tw - 10) name.setScale((tw - 10) / name.width)
      const zone = scene.add
        .zone(r.x, r.y, r.w, r.h)
        .setOrigin(0)
        .setDepth(depth + 3)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.select(i))
      this.objs.push(bg, face, name, zone)
      if (s.leader) this.objs.push(emojiImage(scene, r.x + tw - 18, r.y + 18, '2b50', 24).setDepth(depth + 2))
      this.tabs.push({ bg, name, rect: r })
    })

    const top = y0 + TAB.h + 12
    this.view = new ScrollView(scene, { x: rect.x + PAD, y: top, w: rect.w - PAD * 2, h: rect.y + rect.h - PAD - top }).setDepth(depth + 1)
    this.select(slot)
  }

  select(slot: number): void {
    if (slot === this.selected || !this.sheets[slot]) return
    this.selected = slot
    this.onSelect(slot)
    this.tabs.forEach((t, i) => {
      const on = i === slot
      const { x, y, w, h } = t.rect
      t.bg.clear()
      roundRect(t.bg, x, y, w, h, 16, { fill: on ? 0xffffff : 0x000000, fillAlpha: on ? 0.2 : 0.22, strokeWidth: on ? 2 : 1, stroke: 0xffffff, strokeAlpha: on ? 0.85 : 0.1 })
      t.name.setColor(on ? '#ffffff' : '#b9b9c6').setFontStyle(on ? 'bold' : 'normal')
    })
    this.fill(this.sheets[slot]!)
  }

  destroy(): void {
    for (const o of this.objs) o.destroy()
    this.view.destroy()
  }

  private fill(s: MemberSheet): void {
    const scene = this.scene
    const res = textRes()
    const w = this.view.viewport.w
    const text = (x: number, y: number, str: string, size: string, color: string, bold = false): Phaser.GameObjects.Text =>
      scene.add.text(x, y, str, { fontFamily: UI_FONT, fontSize: size, fontStyle: bold ? 'bold' : 'normal', color, resolution: res })
    const objs: Phaser.GameObjects.GameObject[] = [
      emojiImage(scene, 36, HEAD_H / 2, s.emoji, 56, 'player').setAlpha(s.alive ? 1 : 0.4),
      text(76, 26, s.name, FONT.head, '#ffffff', true).setOrigin(0, 0.5),
      text(76, 62, `Lv.${s.level} · ${s.role}${s.leader ? ' · 队长' : ''}`, FONT.small, '#ffdc5d').setOrigin(0, 0.5),
      text(w - 14, HEAD_H / 2, s.alive ? `生命 ${Math.ceil(s.hp)} / ${s.max}` : `倒下 · ${s.reviveSec} 秒后复活`, FONT.body, s.alive ? '#ffffff' : '#ff8a80').setOrigin(1, 0.5),
    ]

    const cols = w >= TWO_COLS ? 2 : 1
    const colW = (w - COL_GAP * (cols - 1)) / cols
    const rows = Math.ceil(STAT_KEYS.length / cols)
    const top = HEAD_H + 8
    const zebra = scene.add.graphics()
    objs.push(zebra)
    STAT_KEYS.forEach((k, i) => {
      const x = Math.floor(i / rows) * (colW + COL_GAP)
      const row = i % rows
      const y = top + row * ROW_H + ROW_H / 2
      if (row % 2 === 0) {
        zebra.fillStyle(0xffffff, 0.05)
        zebra.fillRoundedRect(x, y - ROW_H / 2, colW, ROW_H, 10)
      }
      const now = statValue(k, s.now[k])
      const lasting = statValue(k, s.lasting[k])
      const changed = now !== lasting
      const value = text(x + colW - 14, y, now, FONT.body, changed ? '#ffdc5d' : '#ffffff', true).setOrigin(1, 0.5)
      objs.push(text(x + 14, y, STATS[k].name, FONT.body, '#c9c9d4').setOrigin(0, 0.5), value)
      if (changed) objs.push(text(value.x - value.width - 12, y, `常驻 ${lasting}`, FONT.caption, '#8f8fa0').setOrigin(1, 0.5))
    })

    const note = text(4, top + rows * ROW_H + 16, '黄色的数值此刻受限时效果、战场效果或体力影响，旁边灰字是常驻值', FONT.caption, '#8f8fa0')
    note.setWordWrapWidth(w - 8)
    objs.push(note)
    this.view.clear().add(objs)
    this.view.setContentHeight(note.y + note.height + 8)
  }
}
