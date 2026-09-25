import Phaser from 'phaser'
import { randomPalette } from '../util/palette'
import type { Palette } from '../util/palette'
import { Rng } from '../util/rng'
import { visibleEmojiIds } from '../emoji/pack'
import { browserStorage } from '../util/storage'
import { loadSettings } from '../save/settings'
import { usedEmojiSet, wikiEntryByEmoji, wikiGroups } from '../scene/wikiEntries'
import type { WikiEntry, WikiGroup } from '../types/wikiEntries'
import { applyBackground } from '../util/background'
import { emojiKey, ensureEmoji, loadEmojiPack } from '../emoji/textures'
import { emojiImage } from '../emoji/hold'
import { emojiText } from '../ui/emojiText'
import { EmojiGrid } from '../ui/grid'
import { ScrollView } from '../ui/scroll'
import { FONT, UI_FONT } from '../util/fonts'
import { TAP_SLOP } from '../util/units'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { emojiThumbSize, prepareEmojiThumbs, releaseEmojiThumbs } from '../emoji/thumbs'
import { VirtualEmojiGrid } from '../ui/virtualGrid'
import { clipTo } from '../util/mask'
import { roundRect } from '../ui/shapes'
import { SceneKey } from './keys'

interface WikiLayout {
  content: { w: number; h: number }
  headerY: number
  catsY: number
  detail: { x: number; y: number; w: number; h: number }
  list: { x: number; y: number; w: number; h: number }
}

const LANDSCAPE: WikiLayout = {
  content: { w: 1280, h: 720 },
  headerY: 44,
  catsY: 102,
  detail: { x: 40, y: 140, w: 620, h: 548 },
  list: { x: 700, y: 140, w: 540, h: 548 },
}

const PORTRAIT: WikiLayout = {
  content: { w: 720, h: 1280 },
  headerY: 52,
  catsY: 116,
  detail: { x: 24, y: 212, w: 672, h: 436 },
  list: { x: 24, y: 664, w: 672, h: 588 },
}

interface DetailPool {
  view: ScrollView
  icon: Phaser.GameObjects.Image
  badge: Phaser.GameObjects.Text
  name: Phaser.GameObjects.Text
  desc: Phaser.GameObjects.Text
  levelTabs: Phaser.GameObjects.Text[]
  sections: { title: Phaser.GameObjects.Text; body: Phaser.GameObjects.Text }[]
  footer: Phaser.GameObjects.Text
}

export class WikiScene extends Phaser.Scene {
  private preserveOnRestart = false
  private palette?: Palette
  private category = 0
  private focusedIndex = 0
  private levelSel = 0
  private currentCategory = ''
  private currentEntry?: WikiEntry
  private allSelected: string | null = null
  private manifest: string[] = []
  private used = new Set<string>()
  private groups: WikiGroup[] = []
  private entryLookup = new Map<string, { category: string; entry: WikiEntry }>()
  private manifestUsed = 0

  private layout!: WikiLayout
  private origin = { x: 0, y: 0 }
  private entryGrid?: EmojiGrid<number>
  private allGrid?: VirtualEmojiGrid
  private listScroll = 0
  private gridScroll = 0
  private pool?: DetailPool
  private readonly iconWant = new WeakMap<Phaser.GameObjects.Image, string>()
  private catRects: { x: number; w: number }[] = []
  private catContainer?: Phaser.GameObjects.Container
  private catScroll = 0
  private catScrollMax = 0
  private catRowRect = { x: 0, y: 0, w: 0, h: 0 }
  private catDragging = false
  private catDragMoved = false
  private catDragStartX = 0
  private catDragStartScroll = 0

  constructor() {
    super(SceneKey.Wiki)
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)
    this.groups = wikiGroups()
    this.used = usedEmojiSet()
    prepareEmojiThumbs(this, emojiThumbSize(70, viewport.renderScale))
    this.entryLookup = wikiEntryByEmoji()
    this.pool = undefined
    if (!preserved) {
      this.category = 0
      this.focusedIndex = 0
      this.allSelected = null
      this.listScroll = 0
      this.gridScroll = 0
      this.catScroll = 0
    }
    this.entryGrid = undefined
    this.allGrid = undefined

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const L = (this.layout = h > w ? PORTRAIT : LANDSCAPE)
    this.origin = { x: (w - L.content.w) / 2, y: (h - L.content.h) / 2 }
    const ox = this.origin.x
    const oy = this.origin.y

    this.add
      .text(ox + 40, oy + L.headerY, '← 返回', {
        fontFamily: UI_FONT,
        fontSize: FONT.strong,
        color: '#c8c8d4',
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        if (!this.wasDragged()) this.scene.start(SceneKey.Menu)
      })
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start(SceneKey.Menu))

    emojiText(
      this,
      w / 2,
      oy + L.headerY,
      '{1f4d6} 图鉴',
      {
        fontFamily: UI_FONT,
        fontSize: FONT.title,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      },
      { origin: 0.5 },
    )

    this.createCategoryTabs(res)
    if (this.isAllPage()) this.createAllView()
    else this.createEntriesView()

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      if (!this.preserveOnRestart) releaseEmojiThumbs(this)
    })

  }

  private wasDragged(): boolean {
    return (this.entryGrid?.wasDragged ?? false) || (this.allGrid?.wasDragged ?? false)
  }

  private createCategoryTabs(res: number): void {
    const L = this.layout
    this.catRects = []
    const ch = 48
    const gap = 10
    const defs = [
      ...this.groups.map((g) => ({ icon: g.icon, label: `${g.title} ${g.entries.length}`, title: g.title })),
      { icon: '1f310', label: '全部', title: '全部' },
    ]
    const widths = defs.map((d) => 44 + d.label.length * 22 + 20)
    const total = widths.reduce((s, x) => s + x, 0) + gap * (defs.length - 1)

    const margin = this.layout === PORTRAIT ? 24 : 40
    const rowW = L.content.w - margin * 2
    const rowX = this.origin.x + margin
    const rowY = this.origin.y + L.catsY - ch / 2
    this.catRowRect = { x: rowX, y: rowY, w: rowW, h: ch }
    this.catScrollMax = Math.max(0, total - rowW)
    this.catScroll = Math.max(0, Math.min(this.catScrollMax, this.catScroll))
    const startX = this.catScrollMax > 0 ? 0 : (rowW - total) / 2

    const container = (this.catContainer = this.add.container(rowX - this.catScroll, rowY))
    const mask = this.add.graphics().setVisible(false)
    mask.fillStyle(0xffffff, 1)
    mask.fillRect(rowX, rowY, rowW, ch)
    clipTo(container, mask)

    let x = startX
    defs.forEach((d, i) => {
      const cw = widths[i]!
      const on = this.category === i
      const bg = this.add.graphics()
      roundRect(bg, x, 0, cw, ch, ch / 2, { fill: on ? 0xffffff : 0x000000, fillAlpha: on ? 0.2 : 0.22, strokeWidth: on ? 2 : 1, stroke: 0xffffff, strokeAlpha: on ? 0.85 : 0.1 })
      const icon = emojiImage(this, x + 28, ch / 2, d.icon, 35)
      const label = this.add
        .text(x + 46, ch / 2, d.label, {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          fontStyle: on ? 'bold' : 'normal',
          color: on ? '#ffffff' : '#b9b9c6',
          resolution: res,
        })
        .setOrigin(0, 0.5)
      container.add([bg, icon, label])
      this.catRects.push({ x, w: cw })
      x += cw + gap
    })

    this.add
      .zone(rowX, rowY, rowW, ch)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (p: Phaser.Input.Pointer) => this.onCatTap(p))
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (p: Phaser.Input.Pointer, _o: unknown, dx: number, dy: number) => {
      if (this.catContains(p)) {
        this.catScrollTo(this.catScroll + (Math.abs(dx) > Math.abs(dy) ? dx : dy) * 0.6)
      }
    })
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.catDragMoved = false
      this.catDragging = this.catContains(p)
      if (this.catDragging) {
        this.catDragStartX = p.worldX
        this.catDragStartScroll = this.catScroll
      }
    })
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.catDragging || !p.isDown) return
      const dx = p.worldX - this.catDragStartX
      if (this.catScrollMax > 0 && Math.abs(dx) > TAP_SLOP) this.catDragMoved = true
      if (this.catDragMoved) this.catScrollTo(this.catDragStartScroll - dx)
    })
    const release = (): void => {
      this.catDragging = false
    }
    this.input.on(Phaser.Input.Events.POINTER_UP, release)
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release)
  }

  private catContains(p: Phaser.Input.Pointer): boolean {
    const r = this.catRowRect
    return p.worldX >= r.x && p.worldX <= r.x + r.w && p.worldY >= r.y && p.worldY <= r.y + r.h
  }

  private catScrollTo(v: number): void {
    this.catScroll = Math.max(0, Math.min(this.catScrollMax, v))
    this.catContainer?.setX(this.catRowRect.x - this.catScroll)
  }

  private onCatTap(p: Phaser.Input.Pointer): void {
    if (this.wasDragged() || this.catDragMoved) return
    const localX = p.worldX - this.catRowRect.x + this.catScroll
    const i = this.catRects.findIndex((c) => localX >= c.x && localX < c.x + c.w)
    if (i < 0 || this.category === i) return
    this.category = i
    this.focusedIndex = 0
    this.levelSel = 0
    this.listScroll = 0
    this.preserveOnRestart = true
    this.scene.restart()
  }

  private isAllPage(): boolean {
    return this.category === this.groups.length
  }

  private createEntriesView(): void {
    const L = this.layout.list
    const group = this.groups[this.category]!
    this.entryGrid = new EmojiGrid(
      this,
      { x: this.origin.x + L.x, y: this.origin.y + L.y, w: L.w, h: L.h },
      { initialScroll: this.listScroll },
    )
    this.entryGrid.onTap = (key): void => {
      this.focusedIndex = key
      this.levelSel = 0
      this.refreshEntries()
    }
    this.entryGrid.onScroll = (): void => {
      this.listScroll = this.entryGrid!.scrollY
    }
    this.entryGrid.setItems(
      group.entries.map((entry, i) => ({ key: i, emoji: entry.emoji })),
    )
    this.refreshEntries()
  }

  private refreshEntries(): void {
    const group = this.groups[this.category]!
    this.entryGrid?.setSelected(this.focusedIndex)
    const entry = group.entries[this.focusedIndex] ?? group.entries[0]
    if (entry) this.renderDetailCard(group.title, entry)
  }

  private ensurePool(): DetailPool {
    if (this.pool) return this.pool
    const res = textRes()
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y

    const panel = this.add.graphics()
    roundRect(panel, dx, dy, D.w, D.h, 14, { fill: 0x000000, fillAlpha: 0.22, stroke: 0xffffff, strokeAlpha: 0.1 })

    const view = new ScrollView(this, { x: dx, y: dy, w: D.w, h: D.h - 40 })

    const badge = this.add
      .text(D.w - 20, 30, '', {
        fontFamily: UI_FONT,
        fontSize: FONT.small,
        fontStyle: 'bold',
        color: '#25262e',
        backgroundColor: '#ffdc5d',
        padding: { x: 12, y: 5 },
        resolution: res,
      })
      .setOrigin(1, 0.5)
      .setVisible(false)
    const icon = this.add.image(66, 70, '__DEFAULT').setVisible(false)
    const name = this.add
      .text(122, 52, '', {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setVisible(false)
    const desc = this.add
      .text(122, 76, '', {
        fontFamily: UI_FONT,
        fontSize: FONT.small,
        color: '#b9b9c6',
        wordWrap: { width: D.w - 150, useAdvancedWrap: true },
        lineSpacing: 6,
        resolution: res,
      })
      .setOrigin(0, 0)
      .setVisible(false)
    view.add([badge, icon, name, desc])
    const levelTabs = [0, 1, 2].map((i) => {
      const t = this.add
        .text(0, 0, '', {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          fontStyle: 'bold',
          color: '#ffffff',
          backgroundColor: '#00000055',
          padding: { x: 14, y: 6 },
          resolution: res,
        })
        .setOrigin(0, 0)
        .setVisible(false)
        .setInteractive({ useHandCursor: true })
      t.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        if (!view.wasDragged) this.selectLevel(i)
      })
      return t
    })
    view.add(levelTabs)
    const footer = this.add
      .text(dx + 28, dy + D.h - 24, '', {
        fontFamily: UI_FONT,
        fontSize: FONT.caption,
        color: '#8f8f9a',
        resolution: res,
      })
      .setOrigin(0, 1)
      .setVisible(false)
    this.pool = { view, icon, badge, name, desc, levelTabs, sections: [], footer }
    return this.pool
  }

  private sectionAt(i: number): { title: Phaser.GameObjects.Text; body: Phaser.GameObjects.Text } {
    const P = this.pool!
    let s = P.sections[i]
    if (s) return s
    const res = textRes()
    const D = this.layout.detail
    s = {
      title: this.add
        .text(0, 0, '', {
          fontFamily: UI_FONT,
          fontSize: FONT.body,
          fontStyle: 'bold',
          color: '#ffdc5d',
          resolution: res,
        })
        .setOrigin(0, 0)
        .setVisible(false),
      body: this.add
        .text(0, 0, '', {
          fontFamily: UI_FONT,
          fontSize: FONT.body,
          color: '#d0d0d8',
          wordWrap: { width: D.w - 56, useAdvancedWrap: true },
          lineSpacing: 8,
          resolution: res,
        })
        .setOrigin(0, 0)
        .setVisible(false),
    }
    P.view.add([s.title, s.body])
    P.sections.push(s)
    return s
  }

  private setPoolIcon(icon: Phaser.GameObjects.Image, emoji: string, size: number): void {
    const key = emojiKey(emoji)
    this.iconWant.set(icon, key)
    if (this.textures.exists(key)) {
      icon.setTexture(key).setDisplaySize(size, size).setVisible(true)
      return
    }
    icon.setVisible(false)
    void ensureEmoji(this, emoji).then((k) => {
      if (this.iconWant.get(icon) !== k || !this.scene.isActive(SceneKey.Wiki)) return
      icon.setTexture(k).setDisplaySize(size, size).setVisible(true)
    })
  }

  private selectLevel(i: number): void {
    if (this.levelSel === i || !this.currentEntry) return
    this.levelSel = i
    this.renderDetailCard(this.currentCategory, this.currentEntry)
  }

  private renderDetailCard(category: string, e: WikiEntry): void {
    const P = this.ensurePool()
    this.currentCategory = category
    this.currentEntry = e

    P.badge.setText(category).setVisible(true)
    this.setPoolIcon(P.icon, e.emoji, 100)
    P.name.setText(e.name).setColor('#ffffff').setVisible(true)
    P.desc.setText(e.desc).setVisible(true)
    P.footer.setVisible(false)

    let cursor = Math.max(138, P.desc.y + P.desc.height + 14)

    const lvls = e.levels
    if (lvls && lvls.length > 0) {
      const sel = Math.min(this.levelSel, lvls.length - 1)
      let cx = 28
      P.levelTabs.forEach((t, i) => {
        if (i >= lvls.length) {
          t.setVisible(false)
          return
        }
        const on = i === sel
        t.setText(lvls[i]!.label)
          .setPosition(cx, cursor)
          .setColor(on ? '#25262e' : '#dcdce4')
          .setBackgroundColor(on ? '#ffdc5d' : '#00000055')
          .setVisible(true)
        cx += t.width + 10
      })
      cursor += 46
    } else {
      for (const t of P.levelTabs) t.setVisible(false)
    }

    const lines = lvls && lvls.length > 0 ? lvls[Math.min(this.levelSel, lvls.length - 1)]!.lines : e.lines
    const segments: { title: string; body: string[] }[] = []
    for (const line of lines) {
      if (line.startsWith('◆')) segments.push({ title: line, body: [] })
      else if (segments.length === 0) segments.push({ title: '', body: [line] })
      else segments[segments.length - 1]!.body.push(line)
    }
    const used = Math.max(segments.length, P.sections.length)
    for (let i = 0; i < used; i++) {
      const seg = segments[i]
      if (!seg) {
        const s = P.sections[i]!
        s.title.setVisible(false)
        s.body.setVisible(false)
        continue
      }
      const s = this.sectionAt(i)
      if (seg.title) {
        s.title.setPosition(28, cursor).setText(seg.title).setVisible(true)
        cursor += 38
      } else {
        s.title.setVisible(false)
      }
      s.body.setPosition(28, cursor).setText(seg.body.join('\n')).setVisible(true)
      cursor += s.body.height + 12
    }
    P.view.scrollTo(0)
    P.view.setContentHeight(cursor + 12)
  }

  private createAllView(): void {
    const L = this.layout.list
    const lx = this.origin.x + L.x
    const ly = this.origin.y + L.y
    const frame = this.add.graphics()
    roundRect(frame, lx - 8, ly - 8, L.w + 16, L.h + 16, 14, { fill: 0x000000, fillAlpha: 0.18 })
    this.renderAllDetail()

    const grid = (this.allGrid = new VirtualEmojiGrid(
      this,
      { x: lx, y: ly, w: L.w, h: L.h },
      {
        initialScroll: this.gridScroll,
        alphaOf: (cp): number => (this.used.has(cp) ? 1 : 0.26),
      },
    ))
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
    const P = this.ensurePool()
    const selected = this.allSelected
    const hit = selected ? this.entryLookup.get(selected) : undefined
    if (selected && hit) {
      this.renderDetailCard(hit.category, hit.entry)
    } else {
      P.badge.setVisible(false)
      for (const s of P.sections) {
        s.title.setVisible(false)
        s.body.setVisible(false)
      }
      if (selected) {
        this.setPoolIcon(P.icon, selected, 85)
        P.name.setText('未收录').setColor('#9a9aa8').setVisible(true)
        P.desc.setText('这个 emoji 还没有成为游戏实体').setVisible(true)
      } else {
        P.icon.setVisible(false)
        P.name.setText('全部 emoji').setColor('#ffffff').setVisible(true)
        P.desc.setText('点击任意格子查看详情').setVisible(true)
      }
      P.view.scrollTo(0)
      P.view.setContentHeight(P.desc.y + P.desc.height + 24)
    }
    P.footer
      .setText(
        this.manifest.length > 0
          ? `已收录 ${this.manifestUsed} / ${this.manifest.length} · 亮色 = 已登场，点击查看详情`
          : '加载清单中…',
      )
      .setVisible(true)
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}
