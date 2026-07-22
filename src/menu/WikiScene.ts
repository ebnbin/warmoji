import Phaser from 'phaser'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { allEmojiIds } from '../emoji/pack'
import { usedEmojiSet, wikiEntryByEmoji, wikiGroups } from './wiki'
import type { WikiEntry, WikiGroup } from './wiki'
import { applyBackground } from '../core/background'
import { reportDebug } from '../debug/debug'
import { emojiImage, emojiKey, emojiText, ensureEmoji, loadEmojiPack } from '../emoji/textures'
import { EmojiGrid } from './grid'
import { ScrollView } from './scroll'
import { FONT, UI_FONT } from '../core/fonts'
import { TAP_SLOP } from '../core/units'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../core/apply'
import { emojiThumbSize, emojiThumbsReady, prepareEmojiThumbs, releaseEmojiThumbs } from '../emoji/thumbs'
import { VirtualEmojiGrid } from '../emoji/virtualGrid'

// 图鉴：单排类别 tab——角色/队长/敌人/能力/道具（条目列表+详情）与
// 「全部」（twemoji 基础形态完整网格）平级，「全部」排最后。
// 「全部」页 = VirtualEmojiGrid feed 流组件：无前置构建，滚到哪个格子
// 哪个格子按需光栅化（页内缓存、滚回零等待），退出图鉴全量释放内存。
interface WikiLayout {
  content: { w: number; h: number }
  headerY: number
  catsY: number
  detail: { x: number; y: number; w: number; h: number }
  list: { x: number; y: number; w: number; h: number }
}

// 方向对应约定：竖屏「上」= 横屏「左」（详情），竖屏「下」= 横屏「右」（列表/网格）。
// 类别 chip 横屏单行；竖屏一行放不下，拆成两行（catsY 为首行中心）。
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

/** 详情卡对象池：Text 只创建一次，切换条目仅 setText——
 * 点击时批量 创建+销毁 文本会触发成串的 canvas 光栅化与 GPU 纹理增删（真机掉帧主因） */
interface DetailPool {
  view: ScrollView
  icon: Phaser.GameObjects.Image
  badge: Phaser.GameObjects.Text
  name: Phaser.GameObjects.Text
  desc: Phaser.GameObjects.Text
  sections: { title: Phaser.GameObjects.Text; body: Phaser.GameObjects.Text }[]
  footer: Phaser.GameObjects.Text
}

export class WikiScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色/标签页/类别/焦点/滚动等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  /** 0..groups.length-1 = 分组条目；groups.length = 「全部」网格页 */
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
  private entryGrid?: EmojiGrid
  private allGrid?: VirtualEmojiGrid
  private listScroll = 0
  private gridScroll = 0
  private pool?: DetailPool
  // 类别行：单排 tab 放进容器，超宽横向滚动。catRects 存的是容器内局部 x
  private catRects: { title: string; x: number; y: number; w: number; h: number }[] = []
  private catContainer?: Phaser.GameObjects.Container
  private catScroll = 0
  private catScrollMax = 0
  private catRowRect = { x: 0, y: 0, w: 0, h: 0 }
  private catDragging = false
  private catDragMoved = false
  private catDragStartX = 0
  private catDragStartScroll = 0
  private backRect = { x: 0, y: 0, w: 0, h: 0 }
  private reportAt = 0

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
    // 缩略图档位按设备渲染缩放定（52 逻辑 px 格子的物理像素 1:1）；同档复用缓存
    prepareEmojiThumbs(this, emojiThumbSize(70, viewport.renderScale))
    this.entryLookup = wikiEntryByEmoji()
    this.pool = undefined
    if (!preserved) {
      this.category = 0
      this.focusedKey = ''
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

    const back = this.add
      .text(ox + 40, oy + L.headerY, '← 返回', {
        fontFamily: UI_FONT,
        fontSize: FONT.strong,
        color: '#c8c8d4',
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!this.wasDragged()) this.scene.start('menu')
      })
    this.backRect = { x: back.x, y: back.y - back.height / 2, w: back.width, h: back.height }
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('menu'))

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
      // 真退出图鉴才释放缩略缓存；旋转/切类别的内部 restart 保留（同档位复用）
      if (!this.preserveOnRestart) releaseEmojiThumbs(this)
    })

    this.reportWiki()
  }

  /** 两套网格任一发生拖动即视为拖动（返回/类别按钮防误触） */
  private wasDragged(): boolean {
    return (this.entryGrid?.wasDragged ?? false) || (this.allGrid?.wasDragged ?? false)
  }

  // ── 类别横向 tab（单排，可横向滚动） ─────────────────────────

  /** 类别 tab：角色/队长/敌人/能力/道具 + 「全部」平级排最后。单排放进带遮罩的
   * 容器：放得下就居中，放不下就拖动/滚轮左右滑（同一行，绝不换行） */
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

    // 行可视区 = 内容宽减两侧留白；tab 单排装进容器，超宽横向滚动
    const margin = this.layout === PORTRAIT ? 24 : 40
    const rowW = L.content.w - margin * 2
    const rowX = this.origin.x + margin
    const rowY = this.origin.y + L.catsY - ch / 2
    this.catRowRect = { x: rowX, y: rowY, w: rowW, h: ch }
    this.catScrollMax = Math.max(0, total - rowW)
    this.catScroll = Math.max(0, Math.min(this.catScrollMax, this.catScroll))
    // 放得下就居中不滚；放不下则从头左对齐、可滚
    const startX = this.catScrollMax > 0 ? 0 : (rowW - total) / 2

    const container = (this.catContainer = this.add.container(rowX - this.catScroll, rowY))
    const mask = this.add.graphics().setVisible(false)
    mask.fillStyle(0xffffff, 1)
    mask.fillRect(rowX, rowY, rowW, ch)
    container.setMask(mask.createGeometryMask())

    let x = startX
    defs.forEach((d, i) => {
      const cw = widths[i]!
      const on = this.category === i
      const bg = this.add.graphics()
      bg.fillStyle(on ? 0xffffff : 0x000000, on ? 0.2 : 0.22)
      bg.fillRoundedRect(x, 0, cw, ch, ch / 2)
      bg.lineStyle(on ? 2 : 1, 0xffffff, on ? 0.85 : 0.1)
      bg.strokeRoundedRect(x, 0, cw, ch, ch / 2)
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
      this.catRects.push({ title: d.title, x, y: 0, w: cw, h: ch })
      x += cw + gap
    })

    // 单一命中区盖住行可视区：点选按指针 x 反解出 tab，拖动/滚轮横向滚
    //（几何遮罩只裁绘制不裁输入，所以不给每个 tab 挂 zone，避免滚出屏外仍拦点击）
    this.add
      .zone(rowX, rowY, rowW, ch)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', (p: Phaser.Input.Pointer) => this.onCatTap(p))
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, dx: number, dy: number) => {
      if (this.catContains(p)) {
        this.catScrollTo(this.catScroll + (Math.abs(dx) > Math.abs(dy) ? dx : dy) * 0.6)
      }
    })
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.catDragMoved = false
      this.catDragging = this.catContains(p)
      if (this.catDragging) {
        this.catDragStartX = p.worldX
        this.catDragStartScroll = this.catScroll
      }
    })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.catDragging || !p.isDown) return
      const dx = p.worldX - this.catDragStartX
      if (this.catScrollMax > 0 && Math.abs(dx) > TAP_SLOP) this.catDragMoved = true
      if (this.catDragMoved) this.catScrollTo(this.catDragStartScroll - dx)
    })
    const release = (): void => {
      this.catDragging = false
    }
    this.input.on('pointerup', release)
    this.input.on('pointerupoutside', release)
  }

  private catContains(p: Phaser.Input.Pointer): boolean {
    const r = this.catRowRect
    return p.worldX >= r.x && p.worldX <= r.x + r.w && p.worldY >= r.y && p.worldY <= r.y + r.h
  }

  private catScrollTo(v: number): void {
    this.catScroll = Math.max(0, Math.min(this.catScrollMax, v))
    this.catContainer?.setX(this.catRowRect.x - this.catScroll)
    if (this.time.now - this.reportAt > 120) this.reportWiki()
  }

  /** 命中区反解：按指针 x（含滚动偏移）找到所在 tab，非拖动即切类别 */
  private onCatTap(p: Phaser.Input.Pointer): void {
    if (this.wasDragged() || this.catDragMoved) return
    const localX = p.worldX - this.catRowRect.x + this.catScroll
    const i = this.catRects.findIndex((c) => localX >= c.x && localX < c.x + c.w)
    if (i < 0 || this.category === i) return
    this.category = i
    this.focusedKey = ''
    this.listScroll = 0
    this.preserveOnRestart = true
    this.scene.restart()
  }

  private isAllPage(): boolean {
    return this.category === this.groups.length
  }

  // ── 图鉴视图：当前类别的条目网格 + 详情 ─────────────────────

  private createEntriesView(): void {
    const L = this.layout.list
    const group = this.groups[this.category]!
    if (!this.focusedKey && group.entries[0]) {
      this.focusedKey = `${group.title}:${group.entries[0].name}`
    }
    this.entryGrid = new EmojiGrid(
      this,
      { x: this.origin.x + L.x, y: this.origin.y + L.y, w: L.w, h: L.h },
      { initialScroll: this.listScroll },
    )
    this.entryGrid.onTap = (key): void => {
      this.focusedKey = key
      this.refreshEntries()
    }
    this.entryGrid.onScroll = (): void => {
      this.listScroll = this.entryGrid!.scrollY
      if (this.time.now - this.reportAt > 120) this.reportWiki()
    }
    this.entryGrid.setItems(
      group.entries.map((entry) => ({ key: `${group.title}:${entry.name}`, emoji: entry.emoji })),
    )
    this.refreshEntries()
  }

  private refreshEntries(): void {
    const group = this.groups[this.category]!
    this.entryGrid?.setSelected(this.focusedKey)
    const entry =
      group.entries.find((e) => `${group.title}:${e.name}` === this.focusedKey) ?? group.entries[0]
    if (entry) this.renderDetailCard(group.title, entry)
    this.reportWiki()
  }

  /** 详情卡对象池：所有 Text/Image 只创建一次，之后仅 setText/setTexture 复用。
   * 正文（名称/介绍/属性分段）装进可滚动容器——分段数不再封顶 6、内容也不再被硬截断 */
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

    // 底部留 40px 给固定页脚（收录进度），正文滚动区在其之上
    const view = new ScrollView(this, { x: dx, y: dy, w: D.w, h: D.h - 40 })

    const badge = this.add
      .text(D.w - 20, 30, '', {
        fontFamily: UI_FONT,
        fontSize: FONT.small,
        fontStyle: 'bold',
        color: '#25262e',
        backgroundColor: '#ffd54f',
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
        wordWrap: { width: D.w - 150 },
        lineSpacing: 6,
        resolution: res,
      })
      .setOrigin(0, 0)
      .setVisible(false)
    view.add([badge, icon, name, desc])
    const footer = this.add
      .text(dx + 28, dy + D.h - 24, '', {
        fontFamily: UI_FONT,
        fontSize: FONT.caption,
        color: '#8f8f9a',
        resolution: res,
      })
      .setOrigin(0, 1)
      .setVisible(false)
    this.pool = { view, icon, badge, name, desc, sections: [], footer }
    return this.pool
  }

  /** 取第 i 个属性分段（不足则新建并加入滚动内容，分段数不封顶） */
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
          color: '#ffd54f',
          resolution: res,
        })
        .setOrigin(0, 0)
        .setVisible(false),
      body: this.add
        .text(0, 0, '', {
          fontFamily: UI_FONT,
          fontSize: FONT.body,
          color: '#d0d0d8',
          wordWrap: { width: D.w - 56 },
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

  /** 详情卡（图鉴页与完整列表页共用）：类别 + 名称 + 介绍 + 属性分段（全部可滚动） */
  private renderDetailCard(category: string, e: WikiEntry): void {
    const P = this.ensurePool()

    P.badge.setText(category).setVisible(true)
    this.setPoolIcon(P.icon, e.emoji, 100)
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
    // 属性从介绍文字实际底部之后排起（不再固定 y，长介绍不会压住第一段）
    let cursor = Math.max(138, P.desc.y + P.desc.height + 14)
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

  // ── 全部 emoji 视图：懒加载清单 + feed 流虚拟网格组件 ───────

  private createAllView(): void {
    const L = this.layout.list
    const lx = this.origin.x + L.x
    const ly = this.origin.y + L.y
    const frame = this.add.graphics()
    frame.fillStyle(0x000000, 0.18)
    frame.fillRoundedRect(lx - 8, ly - 8, L.w + 16, L.h + 16, 14)
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
      grid.setSelected(cp)
      this.renderAllDetail()
      this.reportWiki()
    }
    grid.onScrolled = (settled): void => {
      this.gridScroll = grid.scrollY
      // 滚动中的调试上报节流；拖动结束/惯性停止补终态
      if (settled || this.time.now - this.reportAt > 120) this.reportWiki()
    }
    grid.onThumbsProgress = (): void => this.reportWiki()

    void this.loadManifest().then(() => {
      if (!this.scene.isActive('wiki') || !this.isAllPage()) return
      this.manifestUsed = this.manifest.filter((cp) => this.used.has(cp)).length
      grid.setItems(this.manifest)
      grid.setSelected(this.allSelected)
      this.renderAllDetail()
      this.reportWiki()
    })
  }

  private async loadManifest(): Promise<void> {
    if (this.manifest.length > 0) return
    try {
      // 全量清单来自打包资源（ordering 顺序，以 ordering 为准，肤色/component 一律保留）
      this.manifest = [...allEmojiIds(await loadEmojiPack())]
    } catch (err) {
      console.error(`emoji 清单加载失败: ${String(err)}`)
    }
  }

  /** 完整列表页的详情面板：收录进度 + 选中项详情（已收录展示类别与属性） */
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
        // 未收录：展示 emoji 本体与待收录状态
        this.setPoolIcon(P.icon, selected, 85)
        P.name.setText('未收录').setColor('#9a9aa8').setVisible(true)
        P.desc
          .setText('这个 emoji 还没有成为游戏实体。\n随版本迭代，目标是把它们全部做进游戏。')
          .setVisible(true)
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
        category: this.isAllPage() ? '全部' : (this.groups[this.category]?.title ?? ''),
        focused: this.focusedKey,
        allSelected: this.allSelected,
        entryCount: this.entryGrid ? this.entryGrid.cellRects().length : 0,
        manifestCount: this.manifest.length,
        usedCount: this.used.size,
        thumbsReady: emojiThumbsReady(),
        scrollY: this.isAllPage() ? this.gridScroll : this.listScroll,
        maxScroll: this.isAllPage()
          ? (this.allGrid?.maxScroll ?? 0)
          : Math.max(0, (this.entryGrid?.contentH ?? 0) - this.layout.list.h),
        items: (this.entryGrid?.cellRects() ?? []).map((r) => ({
          key: r.key,
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
        })),
        list: {
          x: this.origin.x + this.layout.list.x,
          y: this.origin.y + this.layout.list.y,
          w: this.layout.list.w,
          h: this.layout.list.h,
        },
        // 上报屏幕中心（含横向滚动偏移），供 e2e 点击落点
        categories: this.catRects.map((c) => ({
          title: c.title,
          x: this.catRowRect.x - this.catScroll + c.x + c.w / 2,
          y: this.catRowRect.y + c.y + c.h / 2,
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
