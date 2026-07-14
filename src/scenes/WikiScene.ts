import Phaser from 'phaser'
import { codepointsToEmoji } from '../core/emoji'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { usedEmojiSet, wikiEntryByEmoji, wikiGroups } from '../core/wiki'
import type { WikiEntry, WikiGroup } from '../core/wiki'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { emojiImage, emojiKey, ensureEmoji } from '../ui/emoji'
import { UI_FONT } from '../ui/fonts'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'
import { buildWikiAtlas, wikiAtlasProgress, wikiFrame } from '../ui/wikiAtlas'

// 图鉴：两个标签页。
// 「图鉴」= 类别横向 tab（角色/队长/敌人/武器/道具）+ 该类条目列表 + 详情；
// 「全部 emoji」= twemoji 基础形态完整列表（构建期 manifest 懒加载）+ 虚拟化网格。
// 网格性能：环形缓冲窗口 + 容器平移——滚动帧只移动容器，跨行才重绑格子，
// 纹理拉取带防抖（快速滑动不触发无效请求），LRU 自动淘汰离屏纹理。
interface WikiLayout {
  content: { w: number; h: number }
  headerY: number
  tabsY: number
  catsY: number
  detail: { x: number; y: number; w: number; h: number }
  list: { x: number; y: number; w: number; h: number }
}

// 方向对应约定：竖屏「上」= 横屏「左」（详情），竖屏「下」= 横屏「右」（列表/网格）
const LANDSCAPE: WikiLayout = {
  content: { w: 1280, h: 720 },
  headerY: 40,
  tabsY: 84,
  catsY: 130,
  detail: { x: 40, y: 164, w: 620, h: 516 },
  list: { x: 700, y: 164, w: 540, h: 516 },
}

const PORTRAIT: WikiLayout = {
  content: { w: 720, h: 1280 },
  headerY: 48,
  tabsY: 92,
  catsY: 138,
  detail: { x: 24, y: 176, w: 672, h: 386 },
  list: { x: 24, y: 586, w: 672, h: 640 },
}

type Tab = 'entries' | 'all'

interface EntryRow {
  key: string
  entry: WikiEntry
  relY: number
  bg: Phaser.GameObjects.Graphics
}

/** 详情卡对象池：Text 只创建一次，切换条目仅 setText——
 * 点击时批量 创建+销毁 文本会触发成串的 canvas 光栅化与 GPU 纹理增删（真机掉帧主因） */
interface DetailPool {
  panel: Phaser.GameObjects.Graphics
  icon: Phaser.GameObjects.Image
  badge: Phaser.GameObjects.Text
  name: Phaser.GameObjects.Text
  desc: Phaser.GameObjects.Text
  sections: { title: Phaser.GameObjects.Text; body: Phaser.GameObjects.Text }[]
  footer: Phaser.GameObjects.Text
}

/** 虚拟网格的格子（环形缓冲复用：slot = index % poolSize；纹理来自常驻图集，绑定为同步查表） */
interface Cell {
  image: Phaser.GameObjects.Image
  boundIndex: number
}

const ROW_H = 52
const CELL = 62

export class WikiScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色/标签页/类别/焦点/滚动等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private tab: Tab = 'entries'
  private category = 0
  private focusedKey = ''
  private allSelected: string | null = null
  private manifest: string[] = []
  private used = new Set<string>()
  private groups: WikiGroup[] = []
  /** 进场缓存，避免每次点击重建反查表/重算收录数 */
  private entryLookup = new Map<string, { category: string; entry: WikiEntry }>()
  private manifestUsed = 0

  private layout!: WikiLayout
  private origin = { x: 0, y: 0 }
  private rows: EntryRow[] = []
  private listContainer!: Phaser.GameObjects.Container
  private listScroll = 0
  private listMax = 0
  private gridScroll = 0
  private gridMax = 0
  private gridContainer!: Phaser.GameObjects.Container
  private selectRing!: Phaser.GameObjects.Graphics
  private cells: Cell[] = []
  private gridCols = 1
  private poolSize = 0
  private pool?: DetailPool
  private tabRects: { id: Tab; x: number; y: number; w: number; h: number }[] = []
  private catRects: { title: string; x: number; y: number; w: number; h: number }[] = []
  private backRect = { x: 0, y: 0, w: 0, h: 0 }
  private dragging = false
  private dragMoved = false
  private dragStartY = 0
  private dragStartScroll = 0
  // 惯性滚动：拖动时采样速度（px/ms），松手后指数衰减
  private flingV = 0
  private lastMoveY = 0
  private lastMoveT = 0
  private reportAt = 0
  // 图集加载进度条（仅全部页构建期间）
  private gridBuilt = false
  private loadingFill?: Phaser.GameObjects.Graphics
  private loadingText?: Phaser.GameObjects.Text
  private loadingShownDone = -1

  constructor() {
    super('wiki')
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)
    this.groups = wikiGroups()
    this.used = usedEmojiSet()
    this.entryLookup = wikiEntryByEmoji()
    this.pool = undefined
    if (!preserved) {
      this.tab = 'entries'
      this.category = 0
      this.focusedKey = ''
      this.allSelected = null
      this.listScroll = 0
      this.gridScroll = 0
    }
    this.rows = []
    this.cells = []
    this.dragging = false
    this.dragMoved = false

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const L = (this.layout = h > w ? PORTRAIT : LANDSCAPE)
    this.origin = { x: (w - L.content.w) / 2, y: (h - L.content.h) / 2 }
    const ox = this.origin.x
    const oy = this.origin.y

    const back = this.add
      .text(ox + 40, oy + L.headerY, '← 返回', {
        fontFamily: UI_FONT,
        fontSize: '18px',
        color: '#c8c8d4',
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!this.dragMoved) this.scene.start('menu')
      })
    this.backRect = { x: back.x, y: back.y - back.height / 2, w: back.width, h: back.height }
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('menu'))

    this.add
      .text(w / 2, oy + L.headerY, '📖 图鉴', {
        fontFamily: UI_FONT,
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)

    this.createTabs(res)
    if (this.tab === 'entries') this.createEntriesView(res)
    else this.createAllView()

    // 滚动：滚轮 + 拖动（列表/网格通用）
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.inList(p)) this.scrollTo((this.tab === 'entries' ? this.listScroll : this.gridScroll) + dy * 0.6)
    })
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragMoved = false
      this.flingV = 0
      if (this.inList(p)) {
        this.dragging = true
        this.dragStartY = p.worldY
        this.dragStartScroll = this.tab === 'entries' ? this.listScroll : this.gridScroll
        this.lastMoveY = p.worldY
        this.lastMoveT = this.time.now
      }
    })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !p.isDown) return
      const dy = this.dragStartY - p.worldY
      if (Math.abs(dy) > 10) this.dragMoved = true
      if (this.dragMoved) {
        this.scrollTo(this.dragStartScroll + dy)
        const dt = Math.max(1, this.time.now - this.lastMoveT)
        const inst = (this.lastMoveY - p.worldY) / dt
        this.flingV = 0.5 * this.flingV + 0.5 * inst
        this.lastMoveY = p.worldY
        this.lastMoveT = this.time.now
      }
    })
    this.input.on('pointerup', () => {
      this.dragging = false
      // 松手：速度足够则进入惯性滑动，否则立即定格并上报终态
      if (!this.dragMoved || Math.abs(this.flingV) < 0.05) {
        this.flingV = 0
        this.forceReport()
      }
    })

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })

    this.reportWiki()
  }

  /** 惯性滚动 + 图集加载进度刷新 */
  update(_time: number, delta: number): void {
    if (this.tab === 'all' && !this.gridBuilt) this.refreshLoading()
    if (this.flingV === 0 || this.dragging) return
    const cur = this.tab === 'entries' ? this.listScroll : this.gridScroll
    const max = this.tab === 'entries' ? this.listMax : this.gridMax
    const next = cur + this.flingV * delta
    this.scrollTo(next)
    this.flingV *= Math.exp(-delta / 320)
    if (Math.abs(this.flingV) < 0.02 || next <= 0 || next >= max) {
      this.flingV = 0
      this.forceReport()
    }
  }

  private refreshLoading(): void {
    const p = wikiAtlasProgress()
    if (!this.loadingFill || !this.loadingText || p.done === this.loadingShownDone) return
    this.loadingShownDone = p.done
    const L = this.layout.list
    const lx = this.origin.x + L.x
    const ly = this.origin.y + L.y
    const bw = L.w - 80
    const ratio = p.total > 0 ? p.done / p.total : 0
    this.loadingFill.clear()
    this.loadingFill.fillStyle(0xffd54f, 1)
    this.loadingFill.fillRoundedRect(lx + 40, ly + L.h / 2 - 8, Math.max(8, bw * ratio), 16, 8)
    this.loadingText.setText(
      p.total > 0 ? `首次加载全部 emoji… ${p.done} / ${p.total}` : '加载清单中…',
    )
  }

  // ── 标签页与类别 tab ────────────────────────────────────────

  private createTabs(res: number): void {
    const L = this.layout
    const w = viewport.logicalWidth
    const defs: { id: Tab; label: string }[] = [
      { id: 'entries', label: '图鉴' },
      { id: 'all', label: '全部 emoji' },
    ]
    this.tabRects = []
    const tw = 150
    const th = 40
    const total = defs.length * tw + 12
    defs.forEach((d, i) => {
      const x = w / 2 - total / 2 + i * (tw + 12)
      const y = this.origin.y + L.tabsY - th / 2
      const on = this.tab === d.id
      const g = this.add.graphics()
      g.fillStyle(on ? 0xffd54f : 0xffffff, on ? 1 : 0.1)
      g.fillRoundedRect(x, y, tw, th, th / 2)
      this.add
        .text(x + tw / 2, y + th / 2, d.label, {
          fontFamily: UI_FONT,
          fontSize: '17px',
          fontStyle: 'bold',
          color: on ? '#25262e' : '#c8c8d4',
          resolution: res,
        })
        .setOrigin(0.5)
      this.add
        .zone(x, y, tw, th)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (this.dragMoved || this.tab === d.id) return
          this.tab = d.id
          this.preserveOnRestart = true
          this.scene.restart()
        })
      this.tabRects.push({ id: d.id, x, y, w: tw, h: th })
    })
  }

  /** 类别横向 tab（仅图鉴页）：角色/队长/敌人/武器/道具 */
  private createCategoryTabs(res: number): void {
    const L = this.layout
    const w = viewport.logicalWidth
    this.catRects = []
    const ch = 34
    const gap = 10
    const widths = this.groups.map((g) => 30 + g.title.length * 17 + 26)
    const total = widths.reduce((s, x) => s + x, 0) + gap * (this.groups.length - 1)
    let x = w / 2 - total / 2
    this.groups.forEach((g, i) => {
      const cw = widths[i]!
      const y = this.origin.y + L.catsY - ch / 2
      const on = this.category === i
      const bg = this.add.graphics()
      bg.fillStyle(on ? 0xffffff : 0x000000, on ? 0.2 : 0.22)
      bg.fillRoundedRect(x, y, cw, ch, ch / 2)
      bg.lineStyle(on ? 2 : 1, 0xffffff, on ? 0.85 : 0.1)
      bg.strokeRoundedRect(x, y, cw, ch, ch / 2)
      emojiImage(this, x + 20, y + ch / 2, g.icon, 18)
      this.add
        .text(x + 34, y + ch / 2, `${g.title} ${g.entries.length}`, {
          fontFamily: UI_FONT,
          fontSize: '14px',
          fontStyle: on ? 'bold' : 'normal',
          color: on ? '#ffffff' : '#b9b9c6',
          resolution: res,
        })
        .setOrigin(0, 0.5)
      this.add
        .zone(x, y, cw, ch)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (this.dragMoved || this.category === i) return
          this.category = i
          this.focusedKey = ''
          this.listScroll = 0
          this.preserveOnRestart = true
          this.scene.restart()
        })
      this.catRects.push({ title: g.title, x, y, w: cw, h: ch })
      x += cw + gap
    })
  }

  private inList(p: Phaser.Input.Pointer): boolean {
    const L = this.layout.list
    const lx = this.origin.x + L.x
    const ly = this.origin.y + L.y
    return p.worldX >= lx && p.worldX <= lx + L.w && p.worldY >= ly && p.worldY <= ly + L.h
  }

  private scrollTo(y: number): void {
    const L = this.layout.list
    if (this.tab === 'entries') {
      this.listScroll = Math.max(0, Math.min(this.listMax, y))
      this.listContainer.y = this.origin.y + L.y - this.listScroll
    } else {
      this.gridScroll = Math.max(0, Math.min(this.gridMax, y))
      this.gridContainer.y = this.origin.y + L.y - this.gridScroll
      this.updateWindow()
    }
    // 滚动中的调试上报节流；拖动结束/惯性停止时 forceReport 补终态
    if (this.time.now - this.reportAt > 120) this.reportWiki()
  }

  private forceReport(): void {
    this.reportWiki()
  }

  // ── 图鉴视图：当前类别的条目列表 + 详情 ─────────────────────

  private createEntriesView(res: number): void {
    this.createCategoryTabs(res)
    const L = this.layout.list
    const lx = this.origin.x + L.x
    const ly = this.origin.y + L.y
    const frame = this.add.graphics()
    frame.fillStyle(0x000000, 0.18)
    frame.fillRoundedRect(lx - 8, ly - 8, L.w + 16, L.h + 16, 14)

    this.listContainer = this.add.container(lx, ly)
    const mask = this.add.graphics().setVisible(false)
    mask.fillStyle(0xffffff, 1)
    mask.fillRect(lx, ly, L.w, L.h)
    this.listContainer.setMask(mask.createGeometryMask())

    const group = this.groups[this.category]!
    const gap = 6
    let cursor = 0
    for (const entry of group.entries) {
      const key = `${group.title}:${entry.name}`
      if (!this.focusedKey) this.focusedKey = key
      const relY = cursor
      const bg = this.add.graphics()
      const icon = emojiImage(this, 30, relY + ROW_H / 2, entry.emoji, 32)
      const name = this.add
        .text(58, relY + ROW_H / 2, entry.name, {
          fontFamily: UI_FONT,
          fontSize: '17px',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5)
      const zone = this.add
        .zone(0, relY, L.w, ROW_H)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (this.dragMoved) return
          const cy = ly + relY - this.listScroll + ROW_H / 2
          if (cy < ly || cy > ly + L.h) return
          this.focusedKey = key
          this.refreshEntries()
        })
      this.listContainer.add([bg, icon, name, zone])
      this.rows.push({ key, entry, relY, bg })
      cursor += ROW_H + gap
    }
    this.listMax = Math.max(0, cursor - gap - L.h)
    this.scrollTo(this.listScroll)
    this.refreshEntries()
  }

  private refreshEntries(): void {
    const L = this.layout.list
    for (const row of this.rows) {
      const focused = row.key === this.focusedKey
      row.bg.clear()
      row.bg.fillStyle(focused ? 0xffffff : 0x000000, focused ? 0.16 : 0.22)
      row.bg.fillRoundedRect(0, row.relY, L.w, ROW_H, 10)
      row.bg.lineStyle(focused ? 2 : 1, 0xffffff, focused ? 0.9 : 0.08)
      row.bg.strokeRoundedRect(0, row.relY, L.w, ROW_H, 10)
    }
    const row = this.rows.find((r) => r.key === this.focusedKey) ?? this.rows[0]
    if (row) {
      this.renderDetailCard(this.groups[this.category]!.title, row.entry)
    }
    this.reportWiki()
  }

  /** 详情卡对象池：所有 Text/Image 只创建一次，之后仅 setText/setTexture 复用 */
  private ensurePool(): DetailPool {
    if (this.pool) return this.pool
    const res = textRes()
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y

    const panel = this.add.graphics()
    panel.fillStyle(0x000000, 0.22)
    panel.fillRoundedRect(dx, dy, D.w, D.h, 14)
    panel.lineStyle(1, 0xffffff, 0.1)
    panel.strokeRoundedRect(dx, dy, D.w, D.h, 14)

    const badge = this.add
      .text(dx + D.w - 20, dy + 22, '', {
        fontFamily: UI_FONT,
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#25262e',
        backgroundColor: '#ffd54f',
        padding: { x: 10, y: 4 },
        resolution: res,
      })
      .setOrigin(1, 0.5)
      .setVisible(false)
    const icon = this.add.image(dx + 58, dy + 56, '__DEFAULT').setVisible(false)
    const name = this.add
      .text(dx + 104, dy + 40, '', {
        fontFamily: UI_FONT,
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setVisible(false)
    const desc = this.add
      .text(dx + 104, dy + 68, '', {
        fontFamily: UI_FONT,
        fontSize: '14px',
        color: '#b9b9c6',
        wordWrap: { width: D.w - 130 },
        lineSpacing: 6,
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setVisible(false)
    const sections = Array.from({ length: 6 }, () => ({
      title: this.add
        .text(0, 0, '', {
          fontFamily: UI_FONT,
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#ffd54f',
          resolution: res,
        })
        .setOrigin(0, 0)
        .setVisible(false),
      body: this.add
        .text(0, 0, '', {
          fontFamily: UI_FONT,
          fontSize: '14px',
          color: '#d0d0d8',
          wordWrap: { width: D.w - 56 },
          lineSpacing: 6,
          resolution: res,
        })
        .setOrigin(0, 0)
        .setVisible(false),
    }))
    const footer = this.add
      .text(dx + 28, dy + D.h - 24, '', {
        fontFamily: UI_FONT,
        fontSize: '13px',
        color: '#8f8f9a',
        resolution: res,
      })
      .setOrigin(0, 1)
      .setVisible(false)
    this.pool = { panel, icon, badge, name, desc, sections, footer }
    return this.pool
  }

  /** 池化的 emoji 图标：纹理未就绪时异步拉取，回填前校验仍是同一目标 */
  private setPoolIcon(icon: Phaser.GameObjects.Image, emoji: string, size: number): void {
    const key = emojiKey(emoji)
    icon.setData('want', key)
    if (this.textures.exists(key)) {
      icon.setTexture(key).setDisplaySize(size, size).setVisible(true)
      return
    }
    icon.setVisible(false)
    void ensureEmoji(this, emoji).then((k) => {
      if (icon.getData('want') !== k || !this.scene.isActive('wiki')) return
      icon.setTexture(k).setDisplaySize(size, size).setVisible(true)
    })
  }

  /** 详情卡（图鉴页与完整列表页共用）：类别 + 名称 + 介绍 + 属性分段 */
  private renderDetailCard(category: string, e: WikiEntry): void {
    const P = this.ensurePool()
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y

    P.badge.setText(category).setVisible(true)
    this.setPoolIcon(P.icon, e.emoji, 64)
    P.name.setText(e.name).setColor('#ffffff').setVisible(true)
    P.desc.setText(e.desc).setVisible(true)
    P.footer.setVisible(false)

    // 属性行分段：◆ 标题 + 后续内容合并为一个多行 Text（少量对象、单次光栅化）
    const segments: { title: string; body: string[] }[] = []
    for (const line of e.lines) {
      if (line.startsWith('◆')) segments.push({ title: line, body: [] })
      else if (segments.length === 0) segments.push({ title: '', body: [line] })
      else segments[segments.length - 1]!.body.push(line)
    }
    let cursor = dy + 112
    P.sections.forEach((s, i) => {
      const seg = segments[i]
      if (!seg || cursor > dy + D.h - 40) {
        s.title.setVisible(false)
        s.body.setVisible(false)
        return
      }
      if (seg.title) {
        s.title.setPosition(dx + 28, cursor).setText(seg.title).setVisible(true)
        cursor += 26
      } else {
        s.title.setVisible(false)
      }
      s.body.setPosition(dx + 28, cursor).setText(seg.body.join('\n')).setVisible(true)
      cursor += s.body.height + 10
    })
  }

  // ── 全部 emoji 视图：懒加载清单 + 虚拟网格 ──────────────────

  private createAllView(): void {
    const L = this.layout.list
    const lx = this.origin.x + L.x
    const ly = this.origin.y + L.y
    const frame = this.add.graphics()
    frame.fillStyle(0x000000, 0.18)
    frame.fillRoundedRect(lx - 8, ly - 8, L.w + 16, L.h + 16, 14)

    this.gridCols = Math.floor(L.w / CELL)
    this.gridBuilt = false
    this.renderAllDetail()

    const mask = this.add.graphics().setVisible(false)
    mask.fillStyle(0xffffff, 1)
    mask.fillRect(lx, ly, L.w, L.h)
    this.gridContainer = this.add.container(lx, ly)
    this.gridContainer.setMask(mask.createGeometryMask())
    this.selectRing = this.add.graphics()
    this.gridContainer.add(this.selectRing)

    // 首次进入：全量缩略图集构建进度（完成后此区域变成网格）
    const barBg = this.add.graphics()
    barBg.fillStyle(0xffffff, 0.1)
    barBg.fillRoundedRect(lx + 40, ly + L.h / 2 - 8, L.w - 80, 16, 8)
    this.loadingFill = this.add.graphics()
    this.loadingText = this.add
      .text(lx + L.w / 2, ly + L.h / 2 - 32, '加载清单中…', {
        fontFamily: UI_FONT,
        fontSize: '15px',
        color: '#d0d0d8',
        resolution: textRes(),
      })
      .setOrigin(0.5)
    this.loadingShownDone = -1
    const loadingObjs = [barBg, this.loadingFill, this.loadingText]

    // 点击选中格子（拖动不算；网格就绪后才可选）
    this.add
      .zone(lx, ly, L.w, L.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', (p: Phaser.Input.Pointer) => {
        if (this.dragMoved || !this.gridBuilt) return
        const col = Math.floor((p.worldX - lx) / CELL)
        const row = Math.floor((p.worldY - ly + this.gridScroll) / CELL)
        const index = row * this.gridCols + col
        const cp = this.manifest[index]
        if (col < 0 || col >= this.gridCols || cp === undefined) return
        this.allSelected = cp
        this.drawSelectRing(index)
        this.renderAllDetail()
        this.reportWiki()
      })

    void this.loadManifest()
      .then(() => {
        if (!this.scene.isActive('wiki')) return
        this.manifestUsed = this.manifest.filter((cp) => this.used.has(codepointsToEmoji(cp))).length
        // 一次性预载全部缩略图（幂等：会话内只构建一次，之后进入秒开）
        return buildWikiAtlas(this, this.manifest)
      })
      .then(() => {
        if (!this.scene.isActive('wiki') || this.tab !== 'all') return
        if (wikiAtlasProgress().state !== 'ready') return
        for (const o of loadingObjs) o.destroy()
        this.loadingFill = undefined
        this.loadingText = undefined
        this.buildGrid()
      })
  }

  /** 图集就绪后构建网格：格子纹理同步查表，滚动无任何异步加载 */
  private buildGrid(): void {
    const L = this.layout.list
    const totalRows = Math.ceil(this.manifest.length / this.gridCols)
    this.gridMax = Math.max(0, totalRows * CELL - L.h)
    const poolRows = Math.ceil(L.h / CELL) + 2
    this.poolSize = poolRows * this.gridCols
    for (let i = 0; i < this.poolSize; i++) {
      const image = this.add.image(0, 0, '__DEFAULT').setVisible(false)
      this.gridContainer.add(image)
      this.cells.push({ image, boundIndex: -1 })
    }
    this.gridBuilt = true
    if (this.allSelected) this.drawSelectRing(this.manifest.indexOf(this.allSelected))
    this.scrollTo(this.gridScroll)
    this.renderAllDetail()
    this.forceReport()
  }

  private async loadManifest(): Promise<void> {
    if (this.manifest.length > 0) return
    try {
      const res = await fetch(`/emoji/${__TWEMOJI_VERSION__}/manifest.json`)
      const data = (await res.json()) as { base: string[] }
      this.manifest = data.base
    } catch (err) {
      console.error(`emoji 清单加载失败: ${String(err)}`)
    }
  }

  /** 虚拟滚动核心：环形缓冲——只有窗口边缘换入的格子才重绑 */
  private updateWindow(): void {
    if (this.cells.length === 0) return
    const firstRow = Math.floor(this.gridScroll / CELL)
    const first = firstRow * this.gridCols
    const last = Math.min(first + this.poolSize - 1, this.manifest.length - 1)
    for (let index = first; index <= last; index++) {
      const cell = this.cells[index % this.poolSize]!
      if (cell.boundIndex === index) continue
      this.bindCell(cell, index)
    }
  }

  private bindCell(cell: Cell, index: number): void {
    cell.boundIndex = index
    const cp = this.manifest[index]!
    const col = index % this.gridCols
    const cx = col * CELL + CELL / 2
    const cy = Math.floor(index / this.gridCols) * CELL + CELL / 2
    const f = wikiFrame(cp)
    if (!f) {
      cell.image.setVisible(false)
      return
    }
    cell.image
      .setPosition(cx, cy)
      .setTexture(f.key, f.frame)
      .setDisplaySize(44, 44)
      .setAlpha(this.used.has(codepointsToEmoji(cp)) ? 1 : 0.26)
      .setVisible(true)
  }

  private drawSelectRing(index: number): void {
    this.selectRing.clear()
    if (index < 0) return
    const col = index % this.gridCols
    const x = col * CELL
    const y = Math.floor(index / this.gridCols) * CELL
    this.selectRing.lineStyle(2, 0xffd54f, 0.95)
    this.selectRing.strokeRoundedRect(x + 4, y + 4, CELL - 8, CELL - 8, 10)
  }

  /** 完整列表页的详情面板：收录进度 + 选中项详情（已收录展示类别与属性） */
  private renderAllDetail(): void {
    const P = this.ensurePool()
    const selected = this.allSelected ? codepointsToEmoji(this.allSelected) : null
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
        // 未收录：展示 emoji 本体与待收录状态
        this.setPoolIcon(P.icon, selected, 64)
        P.name.setText('未收录').setColor('#9a9aa8').setVisible(true)
        P.desc
          .setText('这个 emoji 还没有成为游戏实体。\n随版本迭代，目标是把它们全部做进游戏。')
          .setVisible(true)
      } else {
        P.icon.setVisible(false)
        P.name.setText('全部 emoji').setColor('#ffffff').setVisible(true)
        P.desc.setText('点击任意格子查看详情').setVisible(true)
      }
    }
    P.footer
      .setText(
        this.manifest.length > 0
          ? `已收录 ${this.manifestUsed} / ${this.manifest.length} · 亮色 = 已登场，点击查看详情`
          : '加载清单中…',
      )
      .setVisible(true)
  }

  private reportWiki(): void {
    reportDebug({
      scene: 'wiki',
      elapsed: 0,
      hp: 0,
      alive: 0,
      kills: 0,
      level: 1,
      enemies: 0,
      pending: 0,
      fps: 0,
      viewW: viewport.logicalWidth,
      viewH: viewport.logicalHeight,
      playerX: 0,
      playerY: 0,
      camX: 0,
      camY: 0,
      wiki: {
        tab: this.tab,
        category: this.groups[this.category]?.title ?? '',
        focused: this.focusedKey,
        allSelected: this.allSelected,
        entryCount: this.rows.length,
        manifestCount: this.manifest.length,
        usedCount: this.used.size,
        atlas: wikiAtlasProgress().state,
        scrollY: this.tab === 'entries' ? this.listScroll : this.gridScroll,
        maxScroll: this.tab === 'entries' ? this.listMax : this.gridMax,
        items: this.rows.map((r) => ({
          key: r.key,
          x: this.origin.x + this.layout.list.x,
          y: this.origin.y + this.layout.list.y + r.relY - this.listScroll,
          w: this.layout.list.w,
          h: ROW_H,
        })),
        list: {
          x: this.origin.x + this.layout.list.x,
          y: this.origin.y + this.layout.list.y,
          w: this.layout.list.w,
          h: this.layout.list.h,
        },
        tabs: this.tabRects.map((t) => ({
          id: t.id,
          x: t.x + t.w / 2,
          y: t.y + t.h / 2,
          w: t.w,
          h: t.h,
        })),
        categories: this.catRects.map((c) => ({
          title: c.title,
          x: c.x + c.w / 2,
          y: c.y + c.h / 2,
          w: c.w,
          h: c.h,
        })),
        back: {
          x: this.backRect.x + this.backRect.w / 2,
          y: this.backRect.y + this.backRect.h / 2,
          w: this.backRect.w,
          h: this.backRect.h,
        },
      },
    })
    this.reportAt = this.time.now
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}
