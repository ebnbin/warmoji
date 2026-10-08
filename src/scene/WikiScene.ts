import Phaser from 'phaser'
import { visibleEmojiIds } from '../emoji/pack'
import { browserStorage } from '../util/storage'
import { loadSettings } from '../save/settings'
import { usedEmojiSet, wikiEntryByEmoji, wikiGroups } from '../scene/wikiEntries'
import type { WikiEntry, WikiGroup } from '../types/wikiEntries'
import { loadEmojiPack } from '../emoji/textures'
import { beginPage, Chip, EmojiGrid, Label, PageHeader, pageFrame, Panel, Picture, ScrollView, Tabs, VirtualEmojiGrid } from '../ui'
import type { PageFrame } from '../ui'
import { viewport, VIEWPORT_CHANGED } from '../util/apply'
import { emojiThumbSize, prepareEmojiThumbs, releaseEmojiThumbs } from '../emoji/thumbs'
import { SceneKey } from './keys'

const ALL_TAB = -1
const ICON = 100

export class WikiScene extends Phaser.Scene {
  private preserveOnRestart = false
  private category = 0
  private focusedIndex = 0
  private levelSel = 0
  private allSelected: string | null = null
  private manifest: string[] = []
  private used = new Set<string>()
  private groups: WikiGroup[] = []
  private entryLookup = new Map<string, { category: string; entry: WikiEntry }>()
  private manifestUsed = 0
  private listScroll = 0
  private gridScroll = 0

  private frame!: PageFrame
  private entryGrid?: EmojiGrid<number>
  private detail!: ScrollView
  private footer?: Label

  constructor() {
    super(SceneKey.Wiki)
  }

  create(): void {
    beginPage(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    this.groups = wikiGroups()
    this.used = usedEmojiSet()
    prepareEmojiThumbs(this, emojiThumbSize(70, viewport.renderScale))
    this.entryLookup = wikiEntryByEmoji()
    if (!preserved) {
      this.category = 0
      this.focusedIndex = 0
      this.allSelected = null
      this.listScroll = 0
      this.gridScroll = 0
    }
    this.entryGrid = undefined
    this.footer = undefined

    const f = (this.frame = pageFrame({ sub: true }))
    new PageHeader(this, f, { title: '{1f4d6} 图鉴', back: () => this.scene.start(SceneKey.Menu) })
    new Tabs(this, { x: f.left, y: f.subY, w: f.right - f.left }, {
      items: [
        ...this.groups.map((g, i) => ({ key: i, label: `{${g.icon}} ${g.title} ${g.entries.length}` })),
        { key: ALL_TAB, label: '{1f310} 全部' },
      ],
      selected: this.isAllPage() ? ALL_TAB : this.category,
      onSelect: (key) => this.selectCategory(key === ALL_TAB ? this.groups.length : key),
    })

    const D = f.detail
    new Panel(this, D.x, D.y, D.w, D.h)
    this.detail = new ScrollView(this, { x: D.x, y: D.y + 8, w: D.w, h: D.h - (this.isAllPage() ? 52 : 16) })
    if (this.isAllPage()) this.createAllView()
    else this.createEntriesView()

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      if (!this.preserveOnRestart) releaseEmojiThumbs(this)
    })
  }

  private isAllPage(): boolean {
    return this.category === this.groups.length
  }

  private selectCategory(category: number): void {
    if (category === this.category) return
    this.category = category
    this.focusedIndex = 0
    this.levelSel = 0
    this.listScroll = 0
    this.preserveOnRestart = true
    this.scene.restart()
  }

  private createEntriesView(): void {
    const group = this.groups[this.category]!
    const grid = (this.entryGrid = new EmojiGrid(this, this.frame.list, {
      initialScroll: this.listScroll,
      onScroll: (pos) => (this.listScroll = pos),
    }))
    grid.onTap = (key): void => {
      this.focusedIndex = key
      this.levelSel = 0
      this.refreshEntries()
    }
    grid.setItems(group.entries.map((entry, i) => ({ key: i, emoji: entry.emoji })))
    this.refreshEntries()
  }

  private refreshEntries(): void {
    const group = this.groups[this.category]!
    this.entryGrid?.setSelected(this.focusedIndex)
    const entry = group.entries[this.focusedIndex] ?? group.entries[0]
    if (entry) this.renderEntry(group.title, entry)
  }

  /** 头部：图标、名字、说明、分类角标；返回正文起点 */
  private renderHead(icon: string | null, name: string, desc: string, category: string | null, dim = false): number {
    const view = this.detail.clear()
    const w = this.frame.detail.w
    const pic = new Picture(this, 72, 62, ICON)
    if (icon) pic.showEmoji(icon)
    const nameLabel = new Label(this, 136, 44, name, { kind: 'lead', color: dim ? 'muted' : 'ink' }).setOrigin(0, 0.5)
    const descLabel = new Label(this, 136, 74, desc, { kind: 'label', color: 'muted', wrap: w - 160 })
    view.add([pic, nameLabel, descLabel])
    if (category) {
      const chip = new Chip(this, w - 24, 30, category, { originX: 1 })
      view.add(chip)
      nameLabel.fit(w - 136 - chip.chipWidth - 36)
    }
    return Math.max(136, descLabel.y + descLabel.height + 16)
  }

  private renderEntry(category: string, e: WikiEntry): void {
    let y = this.renderHead(e.emoji, e.name, e.desc, category)
    const view = this.detail
    const w = this.frame.detail.w
    const levels = e.levels
    const sel = levels && levels.length > 0 ? Math.min(this.levelSel, levels.length - 1) : 0
    if (levels && levels.length > 0) {
      new Tabs(this, { x: 28, y: y + 22, w: w - 56 }, {
        items: levels.map((l, i) => ({ key: i, label: l.label })),
        selected: sel,
        onSelect: (i) => {
          this.levelSel = i
          this.renderEntry(category, e)
        },
        size: 'sm',
        parent: view.content,
        align: 'left',
      })
      y += 64
    }
    const lines = levels && levels.length > 0 ? levels[sel]!.lines : e.lines
    const segments: { title: string; body: string[] }[] = []
    for (const line of lines) {
      if (line.startsWith('◆')) segments.push({ title: line, body: [] })
      else if (segments.length === 0) segments.push({ title: '', body: [line] })
      else segments[segments.length - 1]!.body.push(line)
    }
    for (const seg of segments) {
      if (seg.title) {
        view.add(new Label(this, 28, y, seg.title, { kind: 'body', bold: true, color: 'accent' }))
        y += 38
      }
      const body = new Label(this, 28, y, seg.body.join('\n'), { kind: 'body', color: 'soft', wrap: w - 56, spacing: 8 })
      view.add(body)
      y += body.height + 14
    }
    view.setContentSize(y + 8)
  }

  private createAllView(): void {
    const D = this.frame.detail
    this.footer = new Label(this, D.x + 28, D.y + D.h - 18, '加载清单中…', { kind: 'caption', color: 'faint' }).setOrigin(0, 1)
    this.renderAllDetail()
    const grid = new VirtualEmojiGrid(this, this.frame.list, {
      initialScroll: this.gridScroll,
      alphaOf: (cp): number => (this.used.has(cp) ? 1 : 0.26),
    })
    grid.onTap = (cp): void => {
      this.allSelected = cp
      this.levelSel = 0
      grid.setSelected(cp)
      this.renderAllDetail()
    }
    grid.onScrolled = (): void => {
      this.gridScroll = grid.scrollY
    }
    void this.loadManifest().then(() => {
      if (!this.scene.isActive(SceneKey.Wiki) || !this.isAllPage()) return
      this.manifestUsed = this.manifest.filter((cp) => this.used.has(cp)).length
      grid.setItems(this.manifest)
      grid.setSelected(this.allSelected)
      this.renderAllDetail()
    })
  }

  private async loadManifest(): Promise<void> {
    if (this.manifest.length > 0) return
    try {
      const showSkinTone = loadSettings(browserStorage()).showSkinTone
      this.manifest = [...visibleEmojiIds(await loadEmojiPack(), showSkinTone)]
    } catch (err) {
      console.error(`emoji 清单加载失败: ${String(err)}`)
    }
  }

  private renderAllDetail(): void {
    const selected = this.allSelected
    const hit = selected ? this.entryLookup.get(selected) : undefined
    if (selected && hit) {
      this.renderEntry(hit.category, hit.entry)
    } else {
      const bottom = selected
        ? this.renderHead(selected, '未收录', '这个 emoji 还没有成为游戏实体', null, true)
        : this.renderHead(null, '全部 emoji', '点击任意格子查看详情', null)
      this.detail.setContentSize(bottom)
    }
    this.footer?.setText(
      this.manifest.length > 0 ? `已收录 ${this.manifestUsed} / ${this.manifest.length} · 亮色 = 已登场，点击查看详情` : '加载清单中…',
    )
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}
