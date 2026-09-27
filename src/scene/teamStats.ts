import type Phaser from 'phaser'
import { STAT_KEYS, STATS, statValue } from '../data/stats'
import { Icon, KeyValueList, Label, Panel, ScrollView, Tabs } from '../ui'
import type { Rect } from '../ui'
import type { MemberSheet } from '../run/hudHost'

const PAD = 16
const TAB_H = 96
const HEAD_H = 84
/** 列表区宽于它就把属性排成两列 */
const TWO_COLS = 900

/** 暂停页的队伍属性：每名队员一个页签，页里逐项列出属性目录，放不下就滚动；此刻的值与常驻值不同的高亮并附上常驻值 */
export class TeamStatsPanel {
  private readonly scene: Phaser.Scene
  private readonly sheets: readonly MemberSheet[]
  private readonly onSelect: (slot: number) => void
  private readonly panel: Panel
  private readonly tabs: Tabs<number>
  private readonly view: ScrollView

  constructor(scene: Phaser.Scene, rect: Rect, sheets: readonly MemberSheet[], slot: number, depth: number, onSelect: (slot: number) => void) {
    this.scene = scene
    this.sheets = sheets
    this.onSelect = onSelect
    this.panel = new Panel(scene, rect.x, rect.y, rect.w, rect.h, { variant: 'dialog' }).setDepth(depth)
    const n = sheets.length
    const tabW = Math.min(150, (rect.w - PAD * 2 - 10 * (n - 1)) / n)
    this.tabs = new Tabs(scene, { x: rect.x + PAD, y: rect.y + PAD + TAB_H / 2, w: rect.w - PAD * 2 }, {
      items: sheets.map((s, i) => ({ key: i, icon: s.emoji, outline: 'player' as const, label: s.name, badge: s.leader ? '2b50' : undefined, dim: !s.alive })),
      selected: slot,
      size: 'tall',
      tabWidth: tabW,
      depth: depth + 1,
      onSelect: (i) => this.select(i),
    })
    const top = rect.y + PAD + TAB_H + 16
    this.view = new ScrollView(scene, { x: rect.x + PAD, y: top, w: rect.w - PAD * 2, h: rect.y + rect.h - PAD - top }).setDepth(depth + 1)
    this.fill(sheets[slot]!)
  }

  destroy(): void {
    this.tabs.destroy()
    this.view.destroy()
    this.panel.destroy()
  }

  private select(slot: number): void {
    const sheet = this.sheets[slot]
    if (!sheet) return
    this.onSelect(slot)
    this.fill(sheet)
  }

  private fill(s: MemberSheet): void {
    const scene = this.scene
    const w = this.view.viewport.w
    const view = this.view.clear()
    view.add([
      new Icon(scene, 36, HEAD_H / 2, s.emoji, 56, 'player').setAlpha(s.alive ? 1 : 0.4),
      new Label(scene, 76, 26, s.name, { kind: 'heading' }).setOrigin(0, 0.5),
      new Label(scene, 76, 62, `Lv.${s.level} · ${s.role}${s.leader ? ' · 队长' : ''}`, { kind: 'label', color: 'accent' }).setOrigin(0, 0.5),
      new Label(scene, w - 14, HEAD_H / 2, s.alive ? `生命 ${Math.ceil(s.hp)} / ${s.max}` : `倒下 · ${s.reviveSec} 秒后复活`, {
        kind: 'body',
        color: s.alive ? 'ink' : 'bad',
      }).setOrigin(1, 0.5),
    ])
    const rows = STAT_KEYS.map((k) => {
      const now = statValue(k, s.now[k])
      const lasting = statValue(k, s.lasting[k])
      const changed = now !== lasting
      return { key: STATS[k].name, value: now, highlight: changed, note: changed ? `常驻 ${lasting}` : undefined }
    })
    const list = new KeyValueList(scene, 0, HEAD_H + 8, w, rows, w >= TWO_COLS ? 2 : 1)
    const note = new Label(scene, 4, list.y + list.listHeight + 16, '黄色的数值此刻受限时效果、战场效果或体力影响，旁边灰字是常驻值', {
      kind: 'caption',
      color: 'faint',
      wrap: w - 8,
    })
    view.add([list, note]).setContentSize(note.y + note.height + 8)
  }
}
