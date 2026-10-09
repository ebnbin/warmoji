import Phaser from 'phaser'
import { setSvgSize } from '../emoji/svg'
import { composeSvg, flattenTree, parseSvgTree } from '../emoji/svgTree'
import type { SvgTree, TreeRow } from '../emoji/svgTree'
import { emojiSvgText, loadEmojiPack, svgToImage } from '../emoji/textures'
import { emojiThumbSize, prepareEmojiThumbs, releaseEmojiThumbs } from '../emoji/thumbs'
import {
  beginPage,
  Button,
  Checkbox,
  IconButton,
  Label,
  PageHeader,
  pageFrame,
  Panel,
  Picture,
  Row,
  ScrollView,
  Swatch,
  VirtualEmojiGrid,
} from '../ui'
import type { PageFrame, Rect } from '../ui'
import { viewport, VIEWPORT_CHANGED } from '../util/apply'
import { SceneKey } from './keys'

const RASTER = 256
const ANAT_ROW = 64
const ANAT_INDENT = 28
const anatIndentOf = (depth: number): number => 16 + depth * ANAT_INDENT

interface AnatUi {
  tree: SvgTree
  split: Picture
  fullKey: string
  info: Label
  rows: ScrollView
  area: Rect
  bigSize: number
}

const DEFAULT_SUBJECT = '1f939'

export class StudioScene extends Phaser.Scene {
  private preserveOnRestart = false
  private anatEmoji = DEFAULT_SUBJECT
  private allKeys: string[] = []

  private anat?: AnatUi
  private anatHidden = new Set<string>()
  private anatCollapsed = new Set<string>()
  private anatScroll = 0
  private anatAllRows: TreeRow[] = []
  private anatSplitGen = 0
  private anatLiveCounter = 0
  private anatLiveKey?: string

  private frame!: PageFrame
  private grid?: VirtualEmojiGrid
  private jobGen = 0
  private ownedKeys = new Set<string>()
  private detailObjs: { destroy(): void }[] = []

  constructor() {
    super(SceneKey.Studio)
  }

  create(): void {
    beginPage(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved) {
      this.anatEmoji = DEFAULT_SUBJECT
      this.resetAnatState()
    }
    prepareEmojiThumbs(this, emojiThumbSize(70, viewport.renderScale))
    this.detailObjs = []
    this.anat = undefined

    const f = (this.frame = pageFrame({ tallDetail: true }))
    new PageHeader(this, f, { title: '{1f9ea} Emoji Studio', back: () => this.scene.start(SceneKey.Menu) })
    new Panel(this, f.detail.x, f.detail.y, f.detail.w, f.detail.h)
    const grid = (this.grid = new VirtualEmojiGrid(this, f.list))
    grid.onTap = (cp) => this.onGridTap(cp)

    void loadEmojiPack()
      .then((p) => {
        this.allKeys = [...p.ids]
      })
      .catch((err) => console.error(`emoji 清单加载失败: ${String(err)}`))
      .then(() => {
        if (!this.scene.isActive(SceneKey.Studio)) return
        this.showAll()
      })

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      this.jobGen++
      for (const key of this.ownedKeys) this.textures.remove(key)
      this.ownedKeys.clear()
      if (!this.preserveOnRestart) releaseEmojiThumbs(this)
    })
  }

  private showAll(): void {
    const grid = this.grid
    if (grid) {
      grid.setItems(this.allKeys)
      grid.setSelected(this.anatEmoji)
      grid.ensureVisible()
    }
    this.buildAnatomyDetail()
  }

  private onGridTap(cp: string): void {
    if (cp === this.anatEmoji) return
    this.anatEmoji = cp
    this.resetAnatState()
    this.grid?.setSelected(cp)
    this.buildAnatomyDetail()
  }

  private resetAnatState(): void {
    this.anatHidden = new Set()
    this.anatCollapsed = new Set()
    this.anatScroll = 0
  }

  private resetDetail(): Rect {
    this.jobGen++
    this.anatSplitGen++
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    this.anat = undefined
    return this.frame.detail
  }

  private keep<T extends { destroy(): void }>(obj: T): T {
    this.detailObjs.push(obj)
    return obj
  }

  private buildAnatomyDetail(): void {
    const d = this.resetDetail()
    const portrait = this.frame.portrait
    const bigSize = portrait ? 200 : 156
    const emoji = this.anatEmoji
    const gen = ++this.jobGen

    this.keep(new Label(this, d.x + 24, d.y + 30, '结构树 · 点行显/隐', { kind: 'label', color: 'muted' }).setOrigin(0, 0.5))
    this.keep(
      new Button(this, d.x + d.w - 24 - 60, d.y + 30, {
        label: '↺ 复位',
        size: 'sm',
        variant: 'secondary',
        width: 120,
        onTap: () => {
          if (this.anatHidden.size === 0 && this.anatCollapsed.size === 0) return
          this.resetAnatState()
          this.rebuildAnatRows()
          this.refreshAnatInfo()
          void this.refreshAnatSplit()
        },
      }),
    )

    void emojiSvgText(emoji)
      .then(async (svg) => {
        if (gen !== this.jobGen) return
        const tree = parseSvgTree(svg)
        const fullKey = `studio-anat-full-${emoji}`
        if (!this.textures.exists(fullKey)) {
          const img = await svgToImage(setSvgSize(svg, RASTER))
          if (!this.textures.exists(fullKey)) {
            this.textures.addImage(fullKey, img)
            this.ownedKeys.add(fullKey)
          }
        }
        if (gen !== this.jobGen || !this.scene.isActive(SceneKey.Studio)) return

        const colX = d.x + 24
        const colW = portrait ? 250 : 200
        const colCx = colX + colW / 2
        const top = d.y + 66
        const area: Rect = { x: colX + colW + 24, y: top + 10, w: d.w - 48 - colW - 24, h: d.y + d.h - top - 30 }

        let cy = top
        this.keep(new Label(this, colX + 2, cy, '完整', { kind: 'caption', color: 'faint' }))
        cy += 26
        const fullY = cy + 8 + bigSize / 2
        cy += bigSize + 16 + 10
        this.keep(new Label(this, colX + 2, cy, '拆分', { kind: 'caption', color: 'faint' }))
        cy += 26
        const splitY = cy + 8 + bigSize / 2
        cy += bigSize + 16 + 10
        for (const iy of [fullY, splitY]) {
          this.keep(new Panel(this, colCx - bigSize / 2 - 8, iy - bigSize / 2 - 8, bigSize + 16, bigSize + 16, { variant: 'well' }))
        }
        this.keep(new Picture(this, colCx, fullY, bigSize).show(fullKey))
        const split = this.keep(new Picture(this, colCx, splitY, bigSize).show(fullKey))
        const info = this.keep(new Label(this, colCx, cy, '', { kind: 'label', color: 'soft', align: 'center', wrap: colW }).setOrigin(0.5, 0))
        this.keep(new Panel(this, area.x - 10, area.y - 10, area.w + 20, area.h + 20, { variant: 'well' }))
        const rows = this.keep(new ScrollView(this, area, { onScroll: (pos) => (this.anatScroll = pos) }))
        this.anat = { tree, split, fullKey, info, rows, area, bigSize }
        this.anatAllRows = flattenTree(tree, new Set())
        this.rebuildAnatRows()
        this.refreshAnatInfo()
        void this.refreshAnatSplit()
      })
      .catch((err) => {
        console.error(`解剖失败: ${String(err)}`)
      })
  }

  private anatEffHidden(path: string): boolean {
    const segs = path.split('/')
    for (let i = 1; i <= segs.length; i++) {
      if (this.anatHidden.has(segs.slice(0, i).join('/'))) return true
    }
    return false
  }

  private toggleHidden(path: string): void {
    if (this.anatHidden.has(path)) this.anatHidden.delete(path)
    else this.anatHidden.add(path)
    this.rebuildAnatRows()
    this.refreshAnatInfo()
    void this.refreshAnatSplit()
  }

  private toggleCollapsed(path: string): void {
    if (this.anatCollapsed.has(path)) this.anatCollapsed.delete(path)
    else this.anatCollapsed.add(path)
    this.rebuildAnatRows()
  }

  private rebuildAnatRows(): void {
    const a = this.anat
    if (!a) return
    const keepScroll = this.anatScroll
    const view = a.rows.clear()
    const rows = flattenTree(a.tree, this.anatCollapsed)
    const w = a.area.w - 8
    rows.forEach((row, i) => {
      const dim = this.anatEffHidden(row.path)
      const bar = new Row(this, 0, i * ANAT_ROW + 3, w, ANAT_ROW - 8, {
        dim,
        onTap: row.paints ? () => this.toggleHidden(row.path) : undefined,
      })
      const mid = (ANAT_ROW - 8) / 2
      const indent = anatIndentOf(row.depth)
      if (row.container) {
        bar.add(
          new IconButton(this, indent + 14, mid, {
            glyph: this.anatCollapsed.has(row.path) ? 'expand' : 'collapse',
            size: 36,
            variant: 'dark',
            onTap: () => this.toggleCollapsed(row.path),
          }),
        )
      }
      let x = indent + 40
      if (row.paints) {
        bar.add(new Checkbox(this, x + 18, mid, { value: !this.anatHidden.has(row.path), onChange: () => this.toggleHidden(row.path) }))
        x += 48
      }
      if (row.fill && /^#[0-9a-fA-F]{6}$/.test(row.fill)) {
        bar.add(new Swatch(this, x + 10, mid, 20, Number.parseInt(row.fill.slice(1), 16)))
        x += 32
      }
      const label = `#${row.path} <${row.tag}>${row.container ? ` ×${row.childCount}` : ''}${row.paints ? '' : ' 共享定义'}`
      bar.add(new Label(this, x, mid, label, { kind: 'body', color: dim ? 'faint' : 'ink' }).setOrigin(0, 0.5).setAlpha(row.paints ? 1 : 0.75))
      view.add(bar)
    })
    view.setContentSize(rows.length * ANAT_ROW)
    view.scrollTo(keepScroll)
  }

  private refreshAnatInfo(): void {
    const a = this.anat
    if (!a) return
    const paintCount = this.anatAllRows.filter((r) => r.paints).length
    a.info.setText(`共 ${paintCount} 个绘制节点 · 已隐藏 ${this.anatHidden.size}`)
  }

  private async refreshAnatSplit(): Promise<void> {
    const a = this.anat
    if (!a) return
    const detailGen = this.jobGen
    const gen = ++this.anatSplitGen
    if (this.anatHidden.size === 0) {
      a.split.show(a.fullKey, a.bigSize)
      this.dropAnatLive(undefined)
      return
    }
    const svg = composeSvg(a.tree, { hidden: this.anatHidden })
    try {
      const img = await svgToImage(setSvgSize(svg, RASTER))
      if (gen !== this.anatSplitGen || detailGen !== this.jobGen || !this.scene.isActive(SceneKey.Studio)) return
      const key = `studio-anat-live-${++this.anatLiveCounter}`
      this.textures.addImage(key, img)
      this.ownedKeys.add(key)
      a.split.show(key, a.bigSize)
      this.dropAnatLive(key)
    } catch (err) {
      console.warn(`拆分图渲染失败: ${String(err)}`)
    }
  }

  private dropAnatLive(next: string | undefined): void {
    if (this.anatLiveKey && this.anatLiveKey !== next && this.textures.exists(this.anatLiveKey)) {
      this.textures.remove(this.anatLiveKey)
      this.ownedKeys.delete(this.anatLiveKey)
    }
    this.anatLiveKey = next
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}
