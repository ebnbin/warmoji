import Phaser from 'phaser'
import { visibleEmojiIds } from '../emoji/pack'
import { browserStorage } from '../util/storage'
import { loadSettings } from '../save/settings'
import { setSvgSize } from '../emoji/svg'
import {
  ANIM_RECIPES,
  ANIM_DEF,
  ANIM_TEMPLATES,
  animSetOf,
  applyTemplate,
  bakeAnimFrame,
  composeSvg,
  flattenTree,
  parseSvgTree,
} from '../emoji/anim'
import type { AnimClip, AnimRecipe, AnimTemplate, SvgTree, TreeRow } from '../emoji/anim'
import type { AnimClipId } from '../types/anim'
import { emojiSvgText, ensureEmoji, loadEmojiPack, svgToImage } from '../emoji/textures'
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
  Tabs,
  VirtualEmojiGrid,
} from '../ui'
import type { PageFrame, Rect } from '../ui'
import { viewport, VIEWPORT_CHANGED } from '../util/apply'
import { SceneKey } from './keys'
import type { DevProvider, DevProviderHost } from '../devtools'

const RASTER = 256
const SPEEDS = [1, 0.5, 0.25] as const
const ANAT_ROW = 64
const ANAT_INDENT = 28
const anatIndentOf = (depth: number): number => 16 + depth * ANAT_INDENT

type Tab = 'recipes' | 'templates' | 'anatomy'

const TABS: readonly { readonly key: Tab; readonly label: string }[] = [
  { key: 'recipes', label: '{1f3ac} 配方' },
  { key: 'templates', label: '{1f9e9} 模板' },
  { key: 'anatomy', label: '{1f52c} 解剖' },
]

const CLIP_LABELS: Record<AnimClipId, string> = { idle: '{1f9d8} 待机', attack: '{2694} 攻击' }

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

export class StudioScene extends Phaser.Scene implements DevProviderHost {
  private preserveOnRestart = false
  private tab: Tab = 'recipes'
  private recipeSel = ANIM_RECIPES[0]!.emoji
  private clipSel: AnimClipId = 'idle'
  private tplEmoji = DEFAULT_SUBJECT
  private tpl: AnimTemplate = ANIM_TEMPLATES[0]!
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
  private preview?: Picture
  private paused = false
  private speedIdx = 0
  private frameKeys: string[] = []
  private frameIdx = 0
  private previewSize = 0
  private animTimer?: Phaser.Time.TimerEvent
  private jobGen = 0
  private ownedKeys = new Set<string>()
  private detailObjs: { destroy(): void }[] = []
  private detailScroll!: ScrollView
  private toggleBtn?: Button
  private speedBtn?: Button

  constructor() {
    super(SceneKey.Studio)
  }

  create(): void {
    beginPage(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved) {
      this.tab = 'recipes'
      this.recipeSel = ANIM_RECIPES[0]!.emoji
      this.tplEmoji = DEFAULT_SUBJECT
      this.tpl = ANIM_TEMPLATES[0]!
      this.anatEmoji = DEFAULT_SUBJECT
      this.resetAnatState()
      this.paused = false
      this.speedIdx = 0
    }
    prepareEmojiThumbs(this, emojiThumbSize(70, viewport.renderScale))
    this.detailObjs = []
    this.anat = undefined

    const f = (this.frame = pageFrame({ sub: true, tallDetail: true }))
    new PageHeader(this, f, { title: '{1f9ea} Emoji Studio', back: () => this.scene.start(SceneKey.Menu) })
    new Tabs(this, { x: f.left, y: f.subY, w: f.right - f.left }, {
      items: TABS,
      selected: this.tab,
      tabWidth: 176,
      onSelect: (key) => {
        this.tab = key
        this.paused = false
        this.applyTab()
      },
    })
    new Panel(this, f.detail.x, f.detail.y, f.detail.w, f.detail.h)
    this.detailScroll = new ScrollView(this, f.detail)
    const grid = (this.grid = new VirtualEmojiGrid(this, f.list))
    grid.onTap = (cp) => this.onGridTap(cp)

    const need = new Set<string>(ANIM_TEMPLATES.map((t) => t.icon))
    void Promise.all([
      Promise.all([...need].map((e) => ensureEmoji(this, e).catch(() => ''))),
      loadEmojiPack()
        .then((p) => {
          this.allKeys = [...visibleEmojiIds(p, loadSettings(browserStorage()).showSkinTone)]
        })
        .catch((err) => console.error(`emoji 清单加载失败: ${String(err)}`)),
    ]).then(() => {
      if (!this.scene.isActive(SceneKey.Studio)) return
      this.applyTab()
    })

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      this.animTimer?.remove()
      this.jobGen++
      for (const key of this.ownedKeys) this.textures.remove(key)
      this.ownedKeys.clear()
      if (!this.preserveOnRestart) releaseEmojiThumbs(this)
    })
  }

  private applyTab(): void {
    const grid = this.grid
    if (grid) {
      if (this.tab === 'recipes') {
        grid.setItems(ANIM_RECIPES.map((r) => r.emoji))
        grid.setSelected(this.recipeSel)
      } else {
        grid.setItems(this.allKeys)
        grid.setSelected(this.tab === 'templates' ? this.tplEmoji : this.anatEmoji)
      }
      grid.ensureVisible()
    }
    if (this.tab === 'recipes') this.buildRecipeDetail()
    else if (this.tab === 'templates') this.buildTemplateDetail()
    else this.buildAnatomyDetail()
  }

  private onGridTap(cp: string): void {
    if (this.tab === 'recipes') {
      const recipe = ANIM_RECIPES.find((r) => r.emoji === cp)
      if (!recipe || recipe.emoji === this.recipeSel) return
      this.recipeSel = recipe.emoji
      this.clipSel = animSetOf(recipe.emoji)?.clips[0]?.id ?? 'idle'
      this.grid?.setSelected(cp)
      this.buildRecipeDetail()
    } else if (this.tab === 'templates') {
      if (cp === this.tplEmoji) return
      this.tplEmoji = cp
      this.grid?.setSelected(cp)
      this.buildTemplateDetail()
    } else {
      if (cp === this.anatEmoji) return
      this.anatEmoji = cp
      this.resetAnatState()
      this.grid?.setSelected(cp)
      this.buildAnatomyDetail()
    }
  }

  private resetAnatState(): void {
    this.anatHidden = new Set()
    this.anatCollapsed = new Set()
    this.anatScroll = 0
  }

  private resetDetail(): Rect {
    this.animTimer?.remove()
    this.animTimer = undefined
    this.jobGen++
    this.anatSplitGen++
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    this.detailScroll.clear()
    this.preview = undefined
    this.frameKeys = []
    this.anat = undefined
    this.toggleBtn = undefined
    this.speedBtn = undefined
    return this.frame.detail
  }

  private keep<T extends { destroy(): void }>(obj: T): T {
    this.detailObjs.push(obj)
    return obj
  }

  private buildRecipeDetail(): void {
    const d = this.resetDetail()
    const set = animSetOf(this.recipeSel)
    if (!set) return
    const clip = set.clips.find((c) => c.id === this.clipSel) ?? set.clips[0]!
    this.clipSel = clip.id
    const previewSize = this.frame.portrait ? 280 : 300
    const cx = d.x + d.w / 2
    let y = d.y + 18
    this.spawnPreview(cx, y + previewSize / 2, previewSize, set.emoji)
    y += previewSize + 18
    if (set.clips.length > 1) y = this.buildClipTabs(set, clip, d, y) + 12
    y = this.buildControls(cx, y) + 16
    const view = this.detailScroll
    view.setViewport({ x: d.x, y, w: d.w, h: d.y + d.h - y - 8 })
    const name = new Label(this, d.w / 2, 0, clip.name, { kind: 'lead' }).setOrigin(0.5, 0)
    const desc = new Label(this, d.w / 2, 50, clip.desc, { kind: 'body', color: 'soft', align: 'center', wrap: d.w - 72, spacing: 8 }).setOrigin(0.5, 0)
    const anatomy = new Label(this, d.w / 2, desc.y + desc.height + 14, clip.anatomy, { kind: 'label', color: 'muted', align: 'center', wrap: d.w - 72 }).setOrigin(0.5, 0)
    view.add([name, desc, anatomy])
    view.setContentSize(anatomy.y + anatomy.height + 8)
    this.startBake(clip, previewSize, `studio-anim-${set.emoji}-${clip.id}`, clip.frames)
  }

  private buildClipTabs(set: { clips: readonly AnimClip[] }, current: AnimClip, d: Rect, y: number): number {
    const tabs = new Tabs(this, { x: d.x + 24, y: y + 22, w: d.w - 48 }, {
      items: set.clips.map((c) => ({ key: c.id, label: CLIP_LABELS[c.id] })),
      selected: current.id,
      size: 'sm',
      tabWidth: 160,
      onSelect: (id) => {
        this.clipSel = id
        this.buildRecipeDetail()
      },
    })
    this.keep(tabs)
    return y + tabs.height
  }

  private buildTemplateDetail(): void {
    const d = this.resetDetail()
    const tpl = this.tpl
    const previewSize = this.frame.portrait ? 260 : 270
    const cx = d.x + d.w / 2
    let y = d.y + 16
    this.spawnPreview(cx, y + previewSize / 2, previewSize, this.tplEmoji)
    y += previewSize + 18
    y = this.buildControls(cx, y) + 18

    const view = this.detailScroll
    view.setViewport({ x: d.x, y, w: d.w, h: d.y + d.h - y - 8 })
    const tiles = new Tabs(this, { x: 20, y: 40, w: d.w - 40 }, {
      items: ANIM_TEMPLATES.map((t) => ({ key: t.id, icon: t.icon, label: t.name })),
      selected: tpl.id,
      size: 'tile',
      columns: 5,
      parent: view.content,
      onSelect: (id) => {
        const next = ANIM_TEMPLATES.find((t) => t.id === id)
        if (!next) return
        this.tpl = next
        this.buildTemplateDetail()
      },
    })
    const desc = new Label(this, d.w / 2, 8 + tiles.height + 12, `${tpl.name}：${tpl.desc}`, {
      kind: 'label',
      color: 'soft',
      align: 'center',
      wrap: d.w - 72,
    }).setOrigin(0.5, 0)
    view.add(desc)
    view.setContentSize(desc.y + desc.height + 8)

    const emoji = this.tplEmoji
    const gen = ++this.jobGen
    void emojiSvgText(emoji)
      .then((svg) => {
        if (gen !== this.jobGen) return
        this.startBake(applyTemplate(tpl, emoji, svg), previewSize, `studio-tpl-${emoji}-${tpl.id}`)
      })
      .catch((err) => {
        console.error(`模板套用失败: ${String(err)}`)
      })
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

  private spawnPreview(cx: number, cy: number, size: number, emoji: string): void {
    const pic = this.keep(new Picture(this, cx, cy, size))
    this.preview = pic
    this.previewSize = size
    void ensureEmoji(this, emoji)
      .then((key) => {
        if (this.preview !== pic || this.frameKeys.length > 0 || !this.scene.isActive(SceneKey.Studio)) return
        pic.show(key, size)
      })
      .catch((err) => console.warn(`预览加载失败 ${emoji}: ${String(err)}`))
  }

  private buildControls(cx: number, y: number): number {
    const defs: { label: string; onTap: () => void }[] = [
      { label: '{23ee}', onTap: () => this.stepFrame(-1) },
      {
        label: this.toggleLabel(),
        onTap: () => {
          this.paused = !this.paused
          this.restartTimer()
          this.refreshControls()
        },
      },
      { label: '{23ed}', onTap: () => this.stepFrame(1) },
      {
        label: this.speedLabel(),
        onTap: () => {
          this.speedIdx = (this.speedIdx + 1) % SPEEDS.length
          this.restartTimer()
          this.refreshControls()
        },
      },
    ]
    const btnW = 76
    const gap = 12
    const x0 = cx - (defs.length * btnW + (defs.length - 1) * gap) / 2 + btnW / 2
    const h = 50
    const buttons = defs.map((d, i) =>
      this.keep(new Button(this, x0 + i * (btnW + gap), y + h / 2, { label: d.label, size: 'sm', variant: 'secondary', width: btnW, onTap: d.onTap })),
    )
    this.toggleBtn = buttons[1]
    this.speedBtn = buttons[3]
    return y + h + 5
  }

  private toggleLabel(): string {
    return this.paused ? '{25b6}' : '{23f8}'
  }

  private speedLabel(): string {
    return `${SPEEDS[this.speedIdx]}×`
  }

  private refreshControls(): void {
    this.toggleBtn?.setLabel(this.toggleLabel())
    this.speedBtn?.setLabel(this.speedLabel())
  }

  private stepFrame(dir: 1 | -1): void {
    if (this.frameKeys.length === 0) return
    if (!this.paused) {
      this.paused = true
      this.restartTimer()
      this.refreshControls()
    }
    this.frameIdx = (this.frameIdx + dir + this.frameKeys.length) % this.frameKeys.length
    this.preview?.show(this.frameKeys[this.frameIdx]!, this.previewSize)
  }

  private restartTimer(): void {
    this.animTimer?.remove()
    this.animTimer = undefined
    if (this.paused || this.frameKeys.length === 0) return
    this.animTimer = this.time.addEvent({
      delay: Math.max(30, ANIM_DEF.durMs / this.frameKeys.length / SPEEDS[this.speedIdx]!),
      loop: true,
      callback: () => {
        this.frameIdx = (this.frameIdx + 1) % this.frameKeys.length
        this.preview?.show(this.frameKeys[this.frameIdx]!, this.previewSize)
      },
    })
  }

  private startBake(recipe: AnimRecipe, size: number, keyPrefix?: string, frames?: number): void {
    const gen = ++this.jobGen
    void this.bakeAnimTextures(recipe, keyPrefix, frames ?? ANIM_DEF.frames)
      .then((keys) => {
        if (gen !== this.jobGen || !this.preview) return
        this.frameKeys = keys
        this.frameIdx = 0
        this.previewSize = size
        this.preview.show(keys[0]!, size)
        this.restartTimer()
      })
      .catch((err) => {
        console.error(`动画烘焙失败: ${String(err)}`)
      })
  }

  private async bakeAnimTextures(recipe: AnimRecipe, keyPrefix: string | undefined, frames: number): Promise<string[]> {
    const svg = await emojiSvgText(recipe.emoji)
    const prefix = keyPrefix ?? `studio-anim-${recipe.emoji}`
    const keys: string[] = []
    for (let k = 0; k < frames; k++) {
      const key = `${prefix}-${k}`
      keys.push(key)
      if (this.textures.exists(key)) continue
      const frame = bakeAnimFrame(svg, recipe, k / frames)
      const img = await svgToImage(setSvgSize(frame, RASTER))
      if (!this.textures.exists(key)) {
        this.textures.addImage(key, img)
        this.ownedKeys.add(key)
      }
    }
    return keys
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }

  devProvider(): DevProvider {
    return {
      id: 'studio',
      title: 'Studio',
      sections: [
        {
          id: 'studio',
          title: 'Studio',
          items: () => [
            {
              kind: 'action',
              label: '随机换一个 emoji',
              desc: '在当前页签的全集里随机选一个，省去在几千个里翻找',
              run: (): void => {
                const keys = this.tab === 'recipes' ? ANIM_RECIPES.map((r) => r.emoji) : this.allKeys
                const cp = keys[Math.floor(Math.random() * keys.length)]
                if (cp) this.onGridTap(cp)
              },
            },
          ],
        },
      ],
    }
  }
}
