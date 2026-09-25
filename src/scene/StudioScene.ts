import Phaser from 'phaser'
import { visibleEmojiIds } from '../emoji/pack'
import { browserStorage } from '../util/storage'
import { loadSettings } from '../save/settings'
import { randomPalette } from '../util/palette'
import type { Palette } from '../util/palette'
import { Rng } from '../util/rng'
import { setSvgSize } from '../emoji/svg'
import {
  ANIM_RECIPES,
  ANIM_DEF,
  ANIM_TEMPLATES,
  animSetOf,
  animTemplateOf,
  applyTemplate,
  bakeAnimFrame,
  composeSvg,
  flattenTree,
  parseSvgTree,
} from '../emoji/anim'
import type { AnimClip, AnimRecipe, SvgTree, TreeRow } from '../emoji/anim'
import { applyBackground } from '../util/background'
import { emojiKey, emojiSvgText, ensureEmoji, loadEmojiPack, svgToImage } from '../emoji/textures'
import { emojiImage } from '../emoji/hold'
import { emojiText } from '../ui/emojiText'
import { emojiThumbSize, prepareEmojiThumbs, releaseEmojiThumbs } from '../emoji/thumbs'
import { FONT, UI_FONT } from '../util/fonts'
import { TAP_SLOP } from '../util/units'
import { VirtualEmojiGrid } from '../ui/virtualGrid'
import { ScrollView } from '../ui/scroll'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { clipTo } from '../util/mask'
import { roundRect } from '../ui/shapes'
import { SceneKey } from './keys'

interface StudioLayout {
  content: { w: number; h: number }
  headerY: number
  tabsY: number
  detail: { x: number; y: number; w: number; h: number }
  list: { x: number; y: number; w: number; h: number }
}

const LANDSCAPE: StudioLayout = {
  content: { w: 1280, h: 720 },
  headerY: 44,
  tabsY: 100,
  detail: { x: 40, y: 138, w: 720, h: 550 },
  list: { x: 784, y: 138, w: 456, h: 550 },
}

const PORTRAIT: StudioLayout = {
  content: { w: 720, h: 1280 },
  headerY: 52,
  tabsY: 112,
  detail: { x: 24, y: 152, w: 672, h: 672 },
  list: { x: 24, y: 840, w: 672, h: 416 },
}

const RASTER = 256
const SPEEDS = [1, 0.5, 0.25] as const
const ANAT_ROW = 64
const ANAT_INDENT = 28
const anatIndentOf = (depth: number): number => 16 + depth * ANAT_INDENT

type Tab = 'recipes' | 'templates' | 'anatomy'

interface AnatUi {
  tree: SvgTree
  splitImg: Phaser.GameObjects.Image
  fullKey: string
  info: Phaser.GameObjects.Text
  rowsBox: Phaser.GameObjects.Container
  area: { x: number; y: number; w: number; h: number }
  rowObjs: Phaser.GameObjects.GameObject[]
  res: number
  bigSize: number
}

const DEFAULT_SUBJECT = '1f939'

export class StudioScene extends Phaser.Scene {
  private preserveOnRestart = false
  private palette?: Palette
  private tab: Tab = 'recipes'
  private recipeSel = ANIM_RECIPES[0]!.emoji
  private clipSel = 'idle'
  private tplEmoji = DEFAULT_SUBJECT
  private tplId = ANIM_TEMPLATES[0]!.id
  private anatEmoji = DEFAULT_SUBJECT
  private allKeys: string[] = []

  private anat?: AnatUi
  private anatHidden = new Set<string>()
  private anatCollapsed = new Set<string>()
  private anatScroll = 0
  private anatScrollMax = 0
  private anatAllRows: TreeRow[] = []
  private anatRowMeta: TreeRow[] = []
  private anatSplitGen = 0
  private anatLiveCounter = 0
  private anatLiveKey?: string
  private anatDragging = false
  private anatDragMoved = false
  private anatDragStartY = 0
  private anatDragStartScroll = 0

  private layout!: StudioLayout
  private origin = { x: 0, y: 0 }
  private grid?: VirtualEmojiGrid
  private previewImg?: Phaser.GameObjects.Image
  private paused = false
  private speedIdx = 0
  private frameKeys: string[] = []
  private frameIdx = 0
  private previewSize = 0
  private animTimer?: Phaser.Time.TimerEvent
  private jobGen = 0
  private ownedKeys = new Set<string>()
  private detailObjs: Phaser.GameObjects.GameObject[] = []
  private detailScroll!: ScrollView
  private tabObjs: Phaser.GameObjects.GameObject[] = []

  constructor() {
    super(SceneKey.Studio)
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)
    if (!preserved) {
      this.tab = 'recipes'
      this.recipeSel = ANIM_RECIPES[0]!.emoji
      this.tplEmoji = DEFAULT_SUBJECT
      this.tplId = ANIM_TEMPLATES[0]!.id
      this.anatEmoji = DEFAULT_SUBJECT
      this.resetAnatState()
      this.paused = false
      this.speedIdx = 0
    }
    prepareEmojiThumbs(this, emojiThumbSize(70, viewport.renderScale))
    this.detailObjs = []
    this.tabObjs = []
    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const L = (this.layout = h > w ? PORTRAIT : LANDSCAPE)
    this.origin = { x: (w - L.content.w) / 2, y: (h - L.content.h) / 2 }
    const res = textRes()

    this.add
      .text(Math.max(this.origin.x + 40, safeInsets.left + 24), this.origin.y + L.headerY, '← 返回', {
        fontFamily: UI_FONT,
        fontSize: FONT.strong,
        color: '#c8c8d4',
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        if (!(this.grid?.wasDragged ?? false)) this.scene.start(SceneKey.Menu)
      })
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start(SceneKey.Menu))
    emojiText(
      this,
      w / 2,
      this.origin.y + L.headerY,
      '{1f9ea} Emoji Studio',
      {
        fontFamily: UI_FONT,
        fontSize: FONT.title,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      },
      { origin: 0.5 },
    )

    const frames = this.add.graphics()
    frames.fillStyle(0x000000, 0.18)
    const D = this.detailRect()
    const G = this.listRect()
    frames.fillRoundedRect(D.x - 8, D.y - 8, D.w + 16, D.h + 16, 14)
    frames.fillRoundedRect(G.x - 8, G.y - 8, G.w + 16, G.h + 16, 14)
    this.detailScroll = new ScrollView(this, { x: D.x, y: D.y, w: D.w, h: D.h })

    this.buildTabs(res)
    const grid = (this.grid = new VirtualEmojiGrid(this, G))
    grid.onTap = (cp) => this.onGridTap(cp)

    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.anatContains(p)) this.anatScrollTo(this.anatScroll + dy * 0.6)
    })
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.anatDragMoved = false
      this.anatDragging = this.anatContains(p)
      if (this.anatDragging) {
        this.anatDragStartY = p.worldY
        this.anatDragStartScroll = this.anatScroll
      }
    })
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.anatDragging || !p.isDown) return
      const dy = this.anatDragStartY - p.worldY
      if (this.anatScrollMax > 0 && Math.abs(dy) > TAP_SLOP) this.anatDragMoved = true
      if (this.anatDragMoved) this.anatScrollTo(this.anatDragStartScroll + dy)
    })
    const releaseTree = (): void => {
      this.anatDragging = false
    }
    this.input.on(Phaser.Input.Events.POINTER_UP, releaseTree)
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, releaseTree)

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

  private detailRect(): { x: number; y: number; w: number; h: number } {
    const d = this.layout.detail
    return { x: this.origin.x + d.x, y: this.origin.y + d.y, w: d.w, h: d.h }
  }

  private listRect(): { x: number; y: number; w: number; h: number } {
    const l = this.layout.list
    return { x: this.origin.x + l.x, y: this.origin.y + l.y, w: l.w, h: l.h }
  }

  private buildTabs(res: number): void {
    const defs: { id: Tab; label: string }[] = [
      { id: 'recipes', label: '{1f3ac} 配方' },
      { id: 'templates', label: '{1f9e9} 模板' },
      { id: 'anatomy', label: '{1f52c} 解剖' },
    ]
    for (const o of this.tabObjs) o.destroy()
    this.tabObjs = []
    const cx = this.origin.x + this.layout.content.w / 2
    const y = this.origin.y + this.layout.tabsY
    const chipW = 176
    const chipH = 54
    const gap = 18
    let x = cx - (defs.length * chipW + (defs.length - 1) * gap) / 2
    for (const d of defs) {
      const active = this.tab === d.id
      const bg = this.add.graphics()
      roundRect(bg, x, y - chipH / 2, chipW, chipH, chipH / 2, { fill: active ? 0xffffff : 0x000000, fillAlpha: active ? 0.22 : 0.2, strokeWidth: 2, stroke: 0xffffff, strokeAlpha: active ? 0.9 : 0.12 })
      const label = emojiText(
        this,
        x + chipW / 2,
        y,
        d.label,
        {
          fontFamily: UI_FONT,
          fontSize: FONT.strong,
          color: '#ffffff',
          resolution: res,
        },
        { origin: 0.5 },
      ).setAlpha(active ? 1 : 0.62)
      const zone = this.add
        .zone(x, y - chipH / 2, chipW, chipH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
          if (this.tab === d.id || this.grid?.wasDragged) return
          this.tab = d.id
          this.paused = false
          this.buildTabs(textRes())
          this.applyTab()
        })
      this.tabObjs.push(bg, label, zone)
      x += chipW + gap
    }
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

  private resetDetail(): { d: { x: number; y: number; w: number; h: number }; res: number } {
    this.animTimer?.remove()
    this.animTimer = undefined
    this.jobGen++
    this.anatSplitGen++
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    this.detailScroll?.clear()
    this.previewImg = undefined
    this.frameKeys = []
    this.anat = undefined
    this.anatRowMeta = []
    return { d: this.detailRect(), res: textRes() }
  }

  private buildRecipeDetail(): void {
    const { d, res } = this.resetDetail()
    const set = animSetOf(this.recipeSel)
    if (!set) return
    const clip = set.clips.find((c) => c.id === this.clipSel) ?? set.clips[0]!
    this.clipSel = clip.id
    const portrait = this.layout === PORTRAIT
    const previewSize = portrait ? 280 : 320
    const cx = d.x + d.w / 2
    let y = d.y + 18
    this.spawnPreview(cx, y + previewSize / 2, previewSize, set.emoji)
    y += previewSize + 14
    if (set.clips.length > 1) y = this.buildClipChips(set, clip, cx, y, res) + 12
    y = this.buildControls(cx, y, res) + 18
    const recipe = clip
    const view = this.detailScroll
    view.setViewport({ x: d.x, y, w: d.w, h: d.y + d.h - y - 8 })
    let ly = 0
    const name = this.add
      .text(d.w / 2, ly, recipe.name, {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5, 0)
    ly += 50
    const desc = this.add
      .text(d.w / 2, ly, recipe.desc, {
        fontFamily: UI_FONT,
        fontSize: FONT.body,
        color: '#e8e8f2',
        resolution: res,
        align: 'center',
        wordWrap: { width: d.w - 72, useAdvancedWrap: true },
        lineSpacing: 8,
      })
      .setOrigin(0.5, 0)
    ly += desc.height + 14
    const anatomy = this.add
      .text(d.w / 2, ly, recipe.anatomy, {
        fontFamily: UI_FONT,
        fontSize: FONT.small,
        color: '#aab6cc',
        resolution: res,
        align: 'center',
        wordWrap: { width: d.w - 72, useAdvancedWrap: true },
        lineSpacing: 6,
      })
      .setOrigin(0.5, 0)
    view.add([name, desc, anatomy])
    view.setContentHeight(ly + anatomy.height + 8)
    this.startBake(
      clip,
      previewSize,
      `studio-anim-${set.emoji}-${clip.id}`,
      clip.frames,
    )
  }

  private buildClipChips(
    set: { clips: readonly AnimClip[] },
    current: AnimClip,
    cx: number,
    y: number,
    res: number,
  ): number {
    const labels: Record<string, string> = { idle: '{1f9d8} 待机', attack: '{2694} 攻击' }
    const chipH = 46
    const gap = 10
    const chipW = Math.min(170, (this.detailRect().w - 48 - (set.clips.length - 1) * gap) / set.clips.length)
    let x = cx - (set.clips.length * chipW + (set.clips.length - 1) * gap) / 2
    for (const c of set.clips) {
      const active = c.id === current.id
      const bg = this.add.graphics()
      roundRect(bg, x, y, chipW, chipH, 12, { fill: active ? 0xffffff : 0x000000, fillAlpha: active ? 0.18 : 0.25, strokeWidth: active ? 2 : 1, stroke: 0xffffff, strokeAlpha: active ? 0.9 : 0.12 })
      const label = emojiText(
        this,
        x + chipW / 2,
        y + chipH / 2,
        labels[c.id] ?? c.id,
        {
          fontFamily: UI_FONT,
          fontSize: FONT.body,
          color: '#ffffff',
          resolution: res,
        },
        { origin: 0.5 },
      ).setAlpha(active ? 1 : 0.7)
      const zone = this.add
        .zone(x, y, chipW, chipH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
          if (this.grid?.wasDragged || this.clipSel === c.id) return
          this.clipSel = c.id
          this.buildRecipeDetail()
        })
      this.detailObjs.push(bg, label, zone)
      x += chipW + gap
    }
    return y + chipH
  }

  private buildTemplateDetail(): void {
    const { d, res } = this.resetDetail()
    const tpl = animTemplateOf(this.tplId) ?? ANIM_TEMPLATES[0]!
    const portrait = this.layout === PORTRAIT
    const previewSize = portrait ? 260 : 295
    const cx = d.x + d.w / 2
    let y = d.y + 16
    this.spawnPreview(cx, y + previewSize / 2, previewSize, this.tplEmoji)
    y += previewSize + 14
    y = this.buildControls(cx, y, res) + 16

    const chipsTop = y
    const view = this.detailScroll
    view.setViewport({ x: d.x, y: chipsTop, w: d.w, h: d.y + d.h - chipsTop - 8 })
    const cols = portrait ? 5 : 5
    const chipW = (d.w - 40 - (cols - 1) * 10) / cols
    const chipH = 62
    ANIM_TEMPLATES.forEach((t, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const lx = 20 + col * (chipW + 10)
      const lcy = row * (chipH + 10)
      const active = t.id === this.tplId
      const bg = this.add.graphics()
      roundRect(bg, lx, lcy, chipW, chipH, 12, { fill: active ? 0xffffff : 0x000000, fillAlpha: active ? 0.18 : 0.25, strokeWidth: active ? 2 : 1, stroke: 0xffffff, strokeAlpha: active ? 0.9 : 0.1 })
      const icon = emojiImage(this, lx + chipW / 2, lcy + 22, t.icon, 35)
      const label = this.add
        .text(lx + chipW / 2, lcy + chipH - 15, t.name, {
          fontFamily: UI_FONT,
          fontSize: FONT.caption,
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0.5)
        .setAlpha(active ? 1 : 0.65)
      const zone = this.add
        .zone(lx, lcy, chipW, chipH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
          if (this.grid?.wasDragged || view.wasDragged || this.tplId === t.id) return
          this.tplId = t.id
          this.buildTemplateDetail()
        })
      view.add([bg, icon, label, zone])
    })
    let ly = Math.ceil(ANIM_TEMPLATES.length / cols) * (chipH + 10) + 8
    const desc = this.add
      .text(d.w / 2, ly, `${tpl.name}：${tpl.desc}`, {
        fontFamily: UI_FONT,
        fontSize: FONT.small,
        color: '#e8e8f2',
        resolution: res,
        align: 'center',
        wordWrap: { width: d.w - 72, useAdvancedWrap: true },
        lineSpacing: 6,
      })
      .setOrigin(0.5, 0)
    view.add(desc)
    ly += desc.height + 8
    view.setContentHeight(ly)

    const emoji = this.tplEmoji
    const gen = ++this.jobGen
    void emojiSvgText(emoji)
      .then((svg) => {
        if (gen !== this.jobGen) return
        const recipe = applyTemplate(tpl, emoji, svg)
        this.startBake(recipe, previewSize, `studio-tpl-${emoji}-${tpl.id}`)
      })
      .catch((err) => {
        console.error(`模板套用失败: ${String(err)}`)
      })
  }

  private buildAnatomyDetail(): void {
    const { d, res } = this.resetDetail()
    const portrait = this.layout === PORTRAIT
    const bigSize = portrait ? 300 : 240
    const emoji = this.anatEmoji
    const gen = ++this.jobGen

    const title = this.add
      .text(d.x + 24, d.y + 14, '结构树 · 点行显/隐', {
        fontFamily: UI_FONT,
        fontSize: FONT.small,
        color: '#aab6cc',
        resolution: res,
      })
      .setOrigin(0, 0)
    const reset = this.add
      .text(d.x + d.w - 24, d.y + 14, '↺ 复位', {
        fontFamily: UI_FONT,
        fontSize: FONT.small,
        color: '#ffdc5d',
        resolution: res,
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        if (this.grid?.wasDragged || this.anatDragMoved) return
        if (this.anatHidden.size === 0 && this.anatCollapsed.size === 0) return
        this.resetAnatState()
        this.rebuildAnatRows()
        this.refreshAnatInfo()
        void this.refreshAnatSplit()
      })
    this.detailObjs.push(title, reset)

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
        const colW = portrait ? 250 : 260
        const colCx = colX + colW / 2
        const treeArea = { x: colX + colW + 20, y: d.y + 52, w: d.w - 48 - colW - 20, h: d.h - 68 }

        const boxes = this.add.graphics()
        boxes.fillStyle(0x000000, 0.25)
        let cy = d.y + 52
        const capStyle = {
          fontFamily: UI_FONT,
          fontSize: FONT.caption,
          color: '#8f8f9a',
          resolution: res,
        }
        const capFull = this.add.text(colX + 2, cy, '完整', capStyle).setOrigin(0, 0)
        cy += 30
        const fullY = cy + bigSize / 2
        cy += bigSize + 14
        const capSplit = this.add.text(colX + 2, cy, '拆分', capStyle).setOrigin(0, 0)
        cy += 30
        const splitY = cy + bigSize / 2
        cy += bigSize + 14
        for (const iy of [fullY, splitY]) {
          boxes.fillRoundedRect(colCx - bigSize / 2 - 8, iy - bigSize / 2 - 8, bigSize + 16, bigSize + 16, 12)
        }
        const fullImg = this.add.image(colCx, fullY, fullKey).setDisplaySize(bigSize, bigSize)
        const splitImg = this.add.image(colCx, splitY, fullKey).setDisplaySize(bigSize, bigSize)
        const info = this.add
          .text(colCx, cy, '', {
            fontFamily: UI_FONT,
            fontSize: FONT.small,
            color: '#e8e8f2',
            resolution: res,
            align: 'center',
            wordWrap: { width: colW, useAdvancedWrap: true },
            lineSpacing: 6,
          })
          .setOrigin(0.5, 0)
        const caps = [capFull, capSplit]

        const treeBg = this.add.graphics()
        roundRect(treeBg, treeArea.x - 8, treeArea.y - 8, treeArea.w + 16, treeArea.h + 16, 12, { fill: 0x000000, fillAlpha: 0.16 })
        const mask = this.add.graphics().setVisible(false)
        mask.fillStyle(0xffffff, 1)
        mask.fillRect(treeArea.x, treeArea.y, treeArea.w, treeArea.h)
        const rowsBox = this.add.container(treeArea.x, treeArea.y)
        clipTo(rowsBox, mask)
        const treeZone = this.add
          .zone(treeArea.x, treeArea.y, treeArea.w, treeArea.h)
          .setOrigin(0)
          .setInteractive({ useHandCursor: true })
          .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (p: Phaser.Input.Pointer) => this.onTreeTap(p))

        this.detailObjs.push(treeBg, boxes, fullImg, splitImg, ...caps, info, mask, rowsBox, treeZone)
        this.anat = { tree, splitImg, fullKey, info, rowsBox, area: treeArea, rowObjs: [], res, bigSize }
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

  private anatContains(p: Phaser.Input.Pointer): boolean {
    const a = this.anat
    if (!a) return false
    const r = a.area
    return p.worldX >= r.x && p.worldX <= r.x + r.w && p.worldY >= r.y && p.worldY <= r.y + r.h
  }

  private anatScrollTo(y: number): void {
    const a = this.anat
    if (!a) return
    this.anatScroll = Math.max(0, Math.min(this.anatScrollMax, y))
    a.rowsBox.y = a.area.y - this.anatScroll
  }

  private rebuildAnatRows(): void {
    const a = this.anat
    if (!a) return
    for (const o of a.rowObjs) o.destroy()
    a.rowObjs = []
    const rows = flattenTree(a.tree, this.anatCollapsed)
    this.anatRowMeta = []
    this.anatScrollMax = Math.max(0, rows.length * ANAT_ROW - a.area.h)
    this.anatScroll = Math.max(0, Math.min(this.anatScrollMax, this.anatScroll))
    a.rowsBox.y = a.area.y - this.anatScroll

    rows.forEach((row, i) => {
      const y = i * ANAT_ROW
      const dim = this.anatEffHidden(row.path)
      const bg = this.add.graphics()
      roundRect(bg, 0, y + 3, a.area.w, ANAT_ROW - 6, 12, { fill: 0x000000, fillAlpha: dim ? 0.3 : 0.2 })
      bg.lineStyle(1, 0xffffff, dim ? 0.04 : 0.08)
      bg.strokeRoundedRect(1, y + 4, a.area.w - 2, ANAT_ROW - 8, 12)
      const parts: Phaser.GameObjects.GameObject[] = [bg]

      const indent = anatIndentOf(row.depth)
      if (row.container) {
        parts.push(
          this.add
            .text(indent, y + ANAT_ROW / 2, this.anatCollapsed.has(row.path) ? '▸' : '▾', {
              fontFamily: UI_FONT,
              fontSize: FONT.strong,
              color: '#c8c8d4',
              resolution: a.res,
            })
            .setOrigin(0, 0.5),
        )
      }
      let x = indent + 34
      if (row.paints) {
        parts.push(
          emojiImage(this, x + 16, y + ANAT_ROW / 2, this.anatHidden.has(row.path) ? '1f648' : '1f441', 32)
            .setAlpha(dim && !this.anatHidden.has(row.path) ? 0.4 : 1),
        )
        x += 48
      }
      if (row.fill && /^#[0-9a-fA-F]{6}$/.test(row.fill)) {
        const sw = this.add.graphics()
        roundRect(sw, x, y + ANAT_ROW / 2 - 10, 20, 20, 5, { fill: Number.parseInt(row.fill.slice(1), 16), stroke: 0xffffff, strokeAlpha: 0.25 })
        parts.push(sw)
        x += 32
      }
      const label = `#${row.path} <${row.tag}>${row.container ? ` ×${row.childCount}` : ''}${row.paints ? '' : ' 共享定义'}`
      parts.push(
        this.add
          .text(x, y + ANAT_ROW / 2, label, {
            fontFamily: UI_FONT,
            fontSize: FONT.body,
            color: dim ? '#787885' : '#e8e8f2',
            resolution: a.res,
          })
          .setOrigin(0, 0.5)
          .setAlpha(row.paints ? 1 : 0.75),
      )

      for (const o of parts) a.rowsBox.add(o)
      a.rowObjs.push(...parts)
      this.anatRowMeta.push(row)
    })
  }

  private onTreeTap(p: Phaser.Input.Pointer): void {
    const a = this.anat
    if (!a || this.grid?.wasDragged || this.anatDragMoved) return
    const i = Math.floor((p.worldY - a.area.y + this.anatScroll) / ANAT_ROW)
    const row = this.anatRowMeta[i]
    if (!row) return
    const localX = p.worldX - a.area.x
    const indent = anatIndentOf(row.depth)
    if (row.container && localX >= indent - 12 && localX < indent + 34) {
      if (this.anatCollapsed.has(row.path)) this.anatCollapsed.delete(row.path)
      else this.anatCollapsed.add(row.path)
      this.rebuildAnatRows()
      return
    }
    if (!row.paints) return
    if (this.anatHidden.has(row.path)) this.anatHidden.delete(row.path)
    else this.anatHidden.add(row.path)
    this.rebuildAnatRows()
    this.refreshAnatInfo()
    void this.refreshAnatSplit()
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
      a.splitImg.setTexture(a.fullKey).setDisplaySize(a.bigSize, a.bigSize)
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
      a.splitImg.setTexture(key).setDisplaySize(a.bigSize, a.bigSize)
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
    const img = this.add.image(cx, cy, '__DEFAULT').setVisible(false)
    this.previewImg = img
    this.previewSize = size
    this.detailObjs.push(img)
    void ensureEmoji(this, emoji)
      .then((key) => {
        if (this.previewImg !== img || this.frameKeys.length > 0 || !this.scene.isActive(SceneKey.Studio)) return
        img.setTexture(key).setDisplaySize(size, size).setVisible(true)
      })
      .catch((err) => console.warn(`预览加载失败 ${emoji}: ${String(err)}`))
  }

  private buildControls(cx: number, y: number, res: number): number {
    const defs: { id: string; icon?: () => string; onTap: () => void }[] = [
      { id: 'prev', icon: () => '23ee', onTap: () => this.stepFrame(-1) },
      {
        id: 'toggle',
        icon: () => (this.paused ? '25b6' : '23f8'),
        onTap: () => {
          this.paused = !this.paused
          this.restartTimer()
          this.refreshControls()
        },
      },
      { id: 'next', icon: () => '23ed', onTap: () => this.stepFrame(1) },
      {
        id: 'speed',
        onTap: () => {
          this.speedIdx = (this.speedIdx + 1) % SPEEDS.length
          this.restartTimer()
          this.refreshControls()
        },
      },
    ]
    const btnW = 68
    const btnH = 46
    const gap = 12
    let x = cx - (defs.length * btnW + (defs.length - 1) * gap) / 2
    this.controlToggle = undefined
    this.controlSpeed = undefined
    for (const def of defs) {
      const bg = this.add.graphics()
      roundRect(bg, x, y, btnW, btnH, 12, { fill: 0x000000, fillAlpha: 0.28, stroke: 0xffffff, strokeAlpha: 0.15 })
      let obj: Phaser.GameObjects.GameObject
      if (def.icon) {
        const icon = emojiImage(this, x + btnW / 2, y + btnH / 2, def.icon(), 32)
        if (def.id === 'toggle') this.controlToggle = icon
        obj = icon
      } else {
        const speed = this.add
          .text(x + btnW / 2, y + btnH / 2, `${SPEEDS[this.speedIdx]}×`, {
            fontFamily: UI_FONT,
            fontSize: FONT.head,
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0.5)
        this.controlSpeed = speed
        obj = speed
      }
      const zone = this.add
        .zone(x, y, btnW, btnH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
          if (this.grid?.wasDragged) return
          def.onTap()
        })
      this.detailObjs.push(bg, obj, zone)
      x += btnW + gap
    }
    return y + btnH
  }

  private controlToggle?: Phaser.GameObjects.Image
  private controlSpeed?: Phaser.GameObjects.Text

  private refreshControls(): void {
    this.controlToggle?.setTexture(emojiKey(this.paused ? '25b6' : '23f8'))
    this.controlSpeed?.setText(`${SPEEDS[this.speedIdx]}×`)
  }

  private stepFrame(dir: 1 | -1): void {
    if (this.frameKeys.length === 0) return
    if (!this.paused) {
      this.paused = true
      this.restartTimer()
      this.refreshControls()
    }
    this.frameIdx = (this.frameIdx + dir + this.frameKeys.length) % this.frameKeys.length
    this.previewImg?.setTexture(this.frameKeys[this.frameIdx]!).setDisplaySize(this.previewSize, this.previewSize)
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
        this.previewImg?.setTexture(this.frameKeys[this.frameIdx]!).setDisplaySize(this.previewSize, this.previewSize)
      },
    })
  }

  private startBake(recipe: AnimRecipe, size: number, keyPrefix?: string, frames?: number): void {
    const gen = ++this.jobGen
    void this.bakeAnimTextures(recipe, keyPrefix, frames ?? ANIM_DEF.frames)
      .then((keys) => {
        if (gen !== this.jobGen || !this.previewImg) return
        this.frameKeys = keys
        this.frameIdx = 0
        this.previewSize = size
        this.previewImg.setTexture(keys[0]!).setDisplaySize(size, size).setVisible(true)
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
}
