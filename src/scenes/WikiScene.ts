import Phaser from 'phaser'
import { codepointsToEmoji } from '../core/emoji'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { usedEmojiSet, wikiGroups } from '../core/wiki'
import type { WikiEntry } from '../core/wiki'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { emojiImage, emojiKey, ensureEmoji } from '../ui/emoji'
import { UI_FONT } from '../ui/fonts'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

// 图鉴：两个标签页。
// 「图鉴」= 已登场 entity 的分组列表（数据零维护，聚合自 core/wiki.ts）+ 详情面板；
// 「全部 emoji」= twemoji 基础形态完整列表（构建期 manifest 懒加载）+ 虚拟化网格——
// 只创建可视区的格子，滚动复用、纹理按需拉取（LRU 自动淘汰），3000+ 项不成负担。
interface WikiLayout {
  content: { w: number; h: number }
  headerY: number
  tabsY: number
  detail: { x: number; y: number; w: number; h: number }
  list: { x: number; y: number; w: number; h: number }
}

// 方向对应约定：竖屏「上」= 横屏「左」（详情），竖屏「下」= 横屏「右」（列表/网格）
const LANDSCAPE: WikiLayout = {
  content: { w: 1280, h: 720 },
  headerY: 40,
  tabsY: 84,
  detail: { x: 40, y: 124, w: 620, h: 556 },
  list: { x: 700, y: 124, w: 540, h: 556 },
}

const PORTRAIT: WikiLayout = {
  content: { w: 720, h: 1280 },
  headerY: 48,
  tabsY: 92,
  detail: { x: 24, y: 132, w: 672, h: 430 },
  list: { x: 24, y: 586, w: 672, h: 640 },
}

type Tab = 'entries' | 'all'

interface EntryRow {
  key: string
  entry: WikiEntry
  relY: number
  bg: Phaser.GameObjects.Graphics
}

/** 虚拟网格的格子（对象池复用，滚动只换内容） */
interface Cell {
  image: Phaser.GameObjects.Image
  holder: Phaser.GameObjects.Graphics
  boundIndex: number
}

export class WikiScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色/标签页/焦点/滚动等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private tab: Tab = 'entries'
  private focusedKey = ''
  private manifest: string[] = []
  private used = new Set<string>()

  private layout!: WikiLayout
  private origin = { x: 0, y: 0 }
  private rows: EntryRow[] = []
  private listContainer!: Phaser.GameObjects.Container
  private listScroll = 0
  private listMax = 0
  private gridScroll = 0
  private gridMax = 0
  private cells: Cell[] = []
  private gridCols = 1
  private cellSize = 64
  private detailObjs: Phaser.GameObjects.GameObject[] = []
  private tabRects: { id: Tab; x: number; y: number; w: number; h: number }[] = []
  private backRect = { x: 0, y: 0, w: 0, h: 0 }
  private dragging = false
  private dragMoved = false
  private dragStartY = 0
  private dragStartScroll = 0
  /** 网格重绑定代际：滚动后旧的异步纹理回调不再生效 */
  private bindGen = 0

  constructor() {
    super('wiki')
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)
    this.used = usedEmojiSet()
    if (!preserved) {
      this.tab = 'entries'
      this.focusedKey = ''
      this.listScroll = 0
      this.gridScroll = 0
    }
    this.rows = []
    this.cells = []
    this.detailObjs = []
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
    else this.createAllView(res)

    // 滚动：滚轮 + 拖动（列表/网格通用）
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.inList(p)) this.scrollBy(dy * 0.6)
    })
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragMoved = false
      if (this.inList(p)) {
        this.dragging = true
        this.dragStartY = p.worldY
        this.dragStartScroll = this.tab === 'entries' ? this.listScroll : this.gridScroll
      }
    })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !p.isDown) return
      const dy = this.dragStartY - p.worldY
      if (Math.abs(dy) > 10) this.dragMoved = true
      if (this.dragMoved) this.scrollTo(this.dragStartScroll + dy)
    })
    this.input.on('pointerup', () => {
      this.dragging = false
    })

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })

    this.reportWiki()
  }

  // ── 标签页 ──────────────────────────────────────────────────

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

  private inList(p: Phaser.Input.Pointer): boolean {
    const L = this.layout.list
    const lx = this.origin.x + L.x
    const ly = this.origin.y + L.y
    return p.worldX >= lx && p.worldX <= lx + L.w && p.worldY >= ly && p.worldY <= ly + L.h
  }

  private scrollBy(dy: number): void {
    this.scrollTo((this.tab === 'entries' ? this.listScroll : this.gridScroll) + dy)
  }

  private scrollTo(y: number): void {
    if (this.tab === 'entries') {
      this.listScroll = Math.max(0, Math.min(this.listMax, y))
      this.listContainer.y = this.origin.y + this.layout.list.y - this.listScroll
    } else {
      this.gridScroll = Math.max(0, Math.min(this.gridMax, y))
      this.rebindCells()
    }
    this.reportWiki()
  }

  // ── 图鉴视图：分组条目列表 + 详情 ───────────────────────────

  private createEntriesView(res: number): void {
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

    const rowH = 52
    const gap = 6
    let cursor = 0
    for (const group of wikiGroups()) {
      // 分组标题行
      const header = this.add
        .text(10, cursor + 14, `${group.title}（${group.entries.length}）`, {
          fontFamily: UI_FONT,
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#ffd54f',
          resolution: res,
        })
        .setOrigin(0, 0.5)
      this.listContainer.add(header)
      cursor += 34
      for (const entry of group.entries) {
        const key = `${group.title}:${entry.name}`
        if (!this.focusedKey) this.focusedKey = key
        const relY = cursor
        const bg = this.add.graphics()
        const icon = emojiImage(this, 30, relY + rowH / 2, entry.emoji, 32)
        const name = this.add
          .text(58, relY + rowH / 2, entry.name, {
            fontFamily: UI_FONT,
            fontSize: '17px',
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0, 0.5)
        const zone = this.add
          .zone(0, relY, L.w, rowH)
          .setOrigin(0)
          .setInteractive({ useHandCursor: true })
          .on('pointerup', () => {
            if (this.dragMoved) return
            const cy = this.origin.y + L.y + relY - this.listScroll + rowH / 2
            if (cy < this.origin.y + L.y || cy > this.origin.y + L.y + L.h) return
            this.focusedKey = key
            this.refreshEntries()
          })
        this.listContainer.add([bg, icon, name, zone])
        this.rows.push({ key, entry, relY, bg })
        cursor += rowH + gap
      }
      cursor += 10
    }
    this.listMax = Math.max(0, cursor - L.h)
    this.scrollTo(this.listScroll)
    this.refreshEntries()
  }

  private refreshEntries(): void {
    const L = this.layout.list
    const rowH = 52
    for (const row of this.rows) {
      const focused = row.key === this.focusedKey
      row.bg.clear()
      row.bg.fillStyle(focused ? 0xffffff : 0x000000, focused ? 0.16 : 0.22)
      row.bg.fillRoundedRect(0, row.relY, L.w, rowH, 10)
      row.bg.lineStyle(focused ? 2 : 1, 0xffffff, focused ? 0.9 : 0.08)
      row.bg.strokeRoundedRect(0, row.relY, L.w, rowH, 10)
    }
    this.renderDetail()
    this.reportWiki()
  }

  private renderDetail(): void {
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    const res = textRes()
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y

    const panel = this.add.graphics()
    panel.fillStyle(0x000000, 0.22)
    panel.fillRoundedRect(dx, dy, D.w, D.h, 14)
    panel.lineStyle(1, 0xffffff, 0.1)
    panel.strokeRoundedRect(dx, dy, D.w, D.h, 14)
    this.detailObjs.push(panel)

    const row = this.rows.find((r) => r.key === this.focusedKey) ?? this.rows[0]
    if (!row) return
    const e = row.entry
    this.detailObjs.push(
      emojiImage(this, dx + 58, dy + 56, e.emoji, 64),
      this.add
        .text(dx + 104, dy + 40, e.name, {
          fontFamily: UI_FONT,
          fontSize: '26px',
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(dx + 104, dy + 68, e.desc, {
          fontFamily: UI_FONT,
          fontSize: '14px',
          color: '#b9b9c6',
          wordWrap: { width: D.w - 120 },
          resolution: res,
        })
        .setOrigin(0, 0.5),
    )
    let cursor = dy + 112
    for (const line of e.lines) {
      const isTitle = line.startsWith('◆')
      this.detailObjs.push(
        this.add
          .text(dx + 28, cursor, line, {
            fontFamily: UI_FONT,
            fontSize: isTitle ? '15px' : '14px',
            fontStyle: isTitle ? 'bold' : 'normal',
            color: isTitle ? '#ffd54f' : '#d0d0d8',
            wordWrap: { width: D.w - 56 },
            resolution: res,
          })
          .setOrigin(0, 0),
      )
      cursor += isTitle ? 26 : 22
      if (cursor > dy + D.h - 24) break
    }
  }

  // ── 全部 emoji 视图：懒加载清单 + 虚拟网格 ──────────────────

  private createAllView(res: number): void {
    const L = this.layout.list
    const lx = this.origin.x + L.x
    const ly = this.origin.y + L.y
    const frame = this.add.graphics()
    frame.fillStyle(0x000000, 0.18)
    frame.fillRoundedRect(lx - 8, ly - 8, L.w + 16, L.h + 16, 14)

    // 详情区改作说明卡
    const D = this.layout.detail
    const dx = this.origin.x + D.x
    const dy = this.origin.y + D.y
    const panel = this.add.graphics()
    panel.fillStyle(0x000000, 0.22)
    panel.fillRoundedRect(dx, dy, D.w, D.h, 14)
    const info = this.add
      .text(dx + 24, dy + 24, '加载清单中…', {
        fontFamily: UI_FONT,
        fontSize: '16px',
        color: '#d0d0d8',
        lineSpacing: 8,
        wordWrap: { width: D.w - 48 },
        resolution: res,
      })
      .setOrigin(0, 0)
    this.detailObjs.push(panel, info)

    this.cellSize = 62
    this.gridCols = Math.floor(L.w / this.cellSize)

    const buildGrid = (): void => {
      const totalRows = Math.ceil(this.manifest.length / this.gridCols)
      this.gridMax = Math.max(0, totalRows * this.cellSize - L.h)
      // 格子池：可视行数 + 2 行缓冲
      const poolRows = Math.ceil(L.h / this.cellSize) + 2
      const mask = this.add.graphics().setVisible(false)
      mask.fillStyle(0xffffff, 1)
      mask.fillRect(lx, ly, L.w, L.h)
      const container = this.add.container(0, 0)
      container.setMask(mask.createGeometryMask())
      for (let i = 0; i < poolRows * this.gridCols; i++) {
        const holder = this.add.graphics()
        const image = this.add.image(0, 0, '__DEFAULT').setVisible(false)
        container.add([holder, image])
        this.cells.push({ image, holder, boundIndex: -1 })
      }
      const usedCount = this.manifest.filter((cp) => this.used.has(codepointsToEmoji(cp))).length
      info.setText(
        [
          `twemoji 基础形态共 ${this.manifest.length} 个`,
          `已作为游戏实体收录 ${usedCount} 个`,
          '',
          '亮色 = 已登场；暗色 = 待收录。',
          '随版本迭代，目标是把它们全部做进游戏。',
        ].join('\n'),
      )
      this.rebindCells()
      this.reportWiki()
    }

    void this.loadManifest().then(() => {
      if (this.scene.isActive('wiki') && this.tab === 'all') buildGrid()
    })
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

  /** 虚拟滚动核心：把格子池重新绑定到当前可视索引区间 */
  private rebindCells(): void {
    if (this.cells.length === 0) return
    const L = this.layout.list
    const lx = this.origin.x + L.x
    const ly = this.origin.y + L.y
    const gen = ++this.bindGen
    const firstRow = Math.floor(this.gridScroll / this.cellSize)
    const firstIndex = firstRow * this.gridCols
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]!
      const index = firstIndex + i
      const cp = this.manifest[index]
      const col = index % this.gridCols
      const rowY = Math.floor(index / this.gridCols) * this.cellSize - this.gridScroll
      const cx = lx + col * this.cellSize + this.cellSize / 2
      const cy = ly + rowY + this.cellSize / 2
      cell.boundIndex = index
      cell.holder.clear()
      if (cp === undefined || rowY > L.h) {
        cell.image.setVisible(false)
        continue
      }
      const emoji = codepointsToEmoji(cp)
      const isUsed = this.used.has(emoji)
      const key = emojiKey(emoji)
      cell.image.setPosition(cx, cy).setAlpha(isUsed ? 1 : 0.26)
      if (this.textures.exists(key)) {
        cell.image.setTexture(key).setDisplaySize(44, 44).setVisible(true)
      } else {
        // 占位点，纹理到位后若格子仍绑定同一索引再display
        cell.image.setVisible(false)
        cell.holder.fillStyle(0xffffff, 0.08)
        cell.holder.fillCircle(cx, cy, 14)
        void ensureEmoji(this, emoji).then((k) => {
          if (this.bindGen !== gen || cell.boundIndex !== index || !this.scene.isActive('wiki')) return
          cell.holder.clear()
          cell.image.setTexture(k).setDisplaySize(44, 44).setVisible(true)
        })
      }
    }
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
        focused: this.focusedKey,
        entryCount: this.rows.length,
        manifestCount: this.manifest.length,
        usedCount: this.used.size,
        scrollY: this.tab === 'entries' ? this.listScroll : this.gridScroll,
        maxScroll: this.tab === 'entries' ? this.listMax : this.gridMax,
        items: this.rows.slice(0, 60).map((r) => ({
          key: r.key,
          x: this.origin.x + this.layout.list.x,
          y: this.origin.y + this.layout.list.y + r.relY - this.listScroll,
          w: this.layout.list.w,
          h: 52,
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
        back: {
          x: this.backRect.x + this.backRect.w / 2,
          y: this.backRect.y + this.backRect.h / 2,
          w: this.backRect.w,
          h: this.backRect.h,
        },
      },
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}
