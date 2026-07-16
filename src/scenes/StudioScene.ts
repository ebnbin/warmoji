import Phaser from 'phaser'
import { codepointsToEmoji, emojiCodepoints } from '../core/emoji'
import { packBaseKeys } from '../core/emojipack'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { setSvgSize } from '../core/svg'
import {
  ANIM_RECIPES,
  ANIM_SPEC,
  ANIM_TEMPLATES,
  animRecipeOf,
  animTemplateOf,
  applyTemplate,
  bakeAnimFrame,
  composeSvg,
  flattenTree,
  parseSvgTree,
} from '../core/studio'
import type { AnimRecipe, SvgTree, TreeRow } from '../core/studio'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { emojiImage, emojiSvgText, ensureEmoji, loadEmojiPack, svgToImage } from '../ui/emoji'
import { emojiThumbSize, emojiThumbsReady, prepareEmojiThumbs, releaseEmojiThumbs } from '../ui/emojiThumbs'
import { FONT, UI_FONT } from '../ui/fonts'
import { TAP_SLOP } from '../ui/grid'
import { VirtualEmojiGrid } from '../ui/virtualGrid'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

// Emoji Studio：twemoji 部件动画的游戏内工作台，三个 tab——
// 🎬 配方 = animations.json 里的精修动画预览；🧩 模板 = 任选 emoji × 通用
// 动画模板即选即看（铺量动画的试衣间）；🔬 解剖 = SVG 结构树工作台：
// 树镜像原文结构（顶层元素 + 组/defs 可下钻），任意节点显/隐/选中，
// 双大图对照（完整原图 vs 按状态合成的拆分图，选中项高亮、其余压幽灵）。
// 素材区 = feed 流虚拟网格：配方页列有配方的 emoji，模板/解剖页列全部
// 基础形态（两者对任意 SVG 通用）。预览区带暂停/逐帧/速度控制。内容按
// 保底画布设计、整体居中；studio- 纹理场景自管理，shutdown 全清，
// 缩略缓存真退出才释放。
interface StudioLayout {
  content: { w: number; h: number }
  headerY: number
  tabsY: number
  detail: { x: number; y: number; w: number; h: number }
  list: { x: number; y: number; w: number; h: number }
}

// 素材网格收窄（横屏 4 列 / 竖屏 5 行）：主体面积让给详情——大图展示与结构树
const LANDSCAPE: StudioLayout = {
  content: { w: 1280, h: 720 },
  headerY: 44,
  tabsY: 100,
  detail: { x: 40, y: 138, w: 856, h: 550 },
  list: { x: 920, y: 138, w: 320, h: 550 },
}

const PORTRAIT: StudioLayout = {
  content: { w: 720, h: 1280 },
  headerY: 52,
  tabsY: 112,
  detail: { x: 24, y: 152, w: 672, h: 700 },
  list: { x: 24, y: 868, w: 672, h: 388 },
}

const RASTER = 256
const SPEEDS = [1, 0.5, 0.25] as const
/** 解剖页结构树行高（逻辑 px） */
const ANAT_ROW = 38

type Tab = 'recipes' | 'templates' | 'anatomy'

/** 解剖页一次构建期的引用集合（切换选择/emoji 时随 detailObjs 整组销毁重建） */
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

/** 模板/解剖页的默认素材（任意 emoji 皆可选，这里只是进场的起点） */
const DEFAULT_SUBJECT = '🤹'

export class StudioScene extends Phaser.Scene {
  private preserveOnRestart = false
  private palette?: Palette
  private tab: Tab = 'recipes'
  private recipeSel = ANIM_RECIPES[0]!.emoji
  private tplEmoji = DEFAULT_SUBJECT
  private tplId = ANIM_TEMPLATES[0]!.id
  private anatEmoji = DEFAULT_SUBJECT
  /** 全部基础形态码点清单（打包资源就绪后填充） */
  private allKeys: string[] = []

  // 解剖页结构树工作台状态（换 emoji 归零；旋转 restart 保留）
  private anat?: AnatUi
  private anatSelected: string | null = null
  private anatHidden = new Set<string>()
  private anatCollapsed = new Set<string>()
  private anatScroll = 0
  private anatScrollMax = 0
  /** 全展开行（信息行计数/选中查找用；视图行见 anatRowMeta） */
  private anatAllRows: TreeRow[] = []
  private anatRowMeta: { row: TreeRow; eyeX: number | null }[] = []
  /** 拆分图光栅化竞态令牌与滚动纹理键（新帧就绪才替换/回收旧帧） */
  private anatSplitGen = 0
  private anatLiveCounter = 0
  private anatLiveKey?: string
  private anatDragging = false
  private anatDragMoved = false
  private anatDragStartY = 0
  private anatDragStartScroll = 0
  private anatResetRect = { x: 0, y: 0, w: 0, h: 0 }
  private anatFullRect = { x: 0, y: 0, w: 0, h: 0 }
  private anatSplitRect = { x: 0, y: 0, w: 0, h: 0 }

  private layout!: StudioLayout
  private origin = { x: 0, y: 0 }
  private grid?: VirtualEmojiGrid
  private reportAt = 0
  private previewImg?: Phaser.GameObjects.Image
  private previewState: 'idle' | 'loading' | 'ready' = 'idle'
  // 播放控制：暂停 + 逐帧步进 + 速度（跨选择保留，换 tab 重置暂停）
  private paused = false
  private speedIdx = 0
  private frameKeys: string[] = []
  private frameIdx = 0
  private previewSize = 0
  private animTimer?: Phaser.Time.TimerEvent
  /** 异步烘焙的竞态令牌：切换选择后旧任务作废 */
  private jobGen = 0
  /** 本场景创建的纹理，shutdown 全量移除 */
  private ownedKeys = new Set<string>()
  /** 详情面板动态内容（切换选择时整组销毁重建） */
  private detailObjs: Phaser.GameObjects.GameObject[] = []
  private tabObjs: Phaser.GameObjects.GameObject[] = []
  private tabRects: { id: Tab; x: number; y: number; w: number; h: number }[] = []
  private tplRects: { id: string; x: number; y: number; w: number; h: number }[] = []
  private controlRects: Record<string, { x: number; y: number; w: number; h: number }> = {}
  private backRect = { x: 0, y: 0, w: 0, h: 0 }

  constructor() {
    super('studio')
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
    // 缩略图档位按设备渲染缩放定（52 逻辑 px 格子的物理像素 1:1）；同档复用缓存
    prepareEmojiThumbs(this, emojiThumbSize(52, viewport.renderScale))
    this.previewState = 'idle'
    this.detailObjs = []
    this.tabObjs = []
    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const L = (this.layout = h > w ? PORTRAIT : LANDSCAPE)
    this.origin = { x: (w - L.content.w) / 2, y: (h - L.content.h) / 2 }
    const res = textRes()

    const backText = this.add
      .text(Math.max(this.origin.x + 40, safeInsets.left + 24), this.origin.y + L.headerY, '← 返回', {
        fontFamily: UI_FONT,
        fontSize: FONT.strong,
        color: '#c8c8d4',
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!(this.grid?.wasDragged ?? false)) this.scene.start('menu')
      })
    this.backRect = {
      x: backText.x,
      y: backText.y - backText.height / 2,
      w: backText.width,
      h: backText.height,
    }
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('menu'))
    this.add
      .text(w / 2, this.origin.y + L.headerY, '🧪 Emoji Studio', {
        fontFamily: UI_FONT,
        fontSize: FONT.title,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)

    const frames = this.add.graphics()
    frames.fillStyle(0x000000, 0.18)
    const D = this.detailRect()
    const G = this.listRect()
    frames.fillRoundedRect(D.x - 8, D.y - 8, D.w + 16, D.h + 16, 14)
    frames.fillRoundedRect(G.x - 8, G.y - 8, G.w + 16, G.h + 16, 14)

    this.buildTabs(res)
    const grid = (this.grid = new VirtualEmojiGrid(this, G))
    grid.onTap = (cp) => this.onGridTap(cp)
    grid.onScrolled = (settled) => {
      if (settled || this.time.now - this.reportAt > 120) this.report()
    }
    grid.onThumbsProgress = () => this.report()

    // 解剖结构树滚动：滚轮 + 拖动（命中区与素材网格不重叠；挂 scene.input 随场景重启自清）
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.anatContains(p)) this.anatScrollTo(this.anatScroll + dy * 0.6)
    })
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.anatDragMoved = false
      // 恒赋值：手势异常结束不能把拖动态卡住
      this.anatDragging = this.anatContains(p)
      if (this.anatDragging) {
        this.anatDragStartY = p.worldY
        this.anatDragStartScroll = this.anatScroll
      }
    })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.anatDragging || !p.isDown) return
      const dy = this.anatDragStartY - p.worldY
      if (this.anatScrollMax > 0 && Math.abs(dy) > TAP_SLOP) this.anatDragMoved = true
      if (this.anatDragMoved) this.anatScrollTo(this.anatDragStartScroll + dy)
    })
    const releaseTree = (): void => {
      this.anatDragging = false
    }
    this.input.on('pointerup', releaseTree)
    this.input.on('pointerupoutside', releaseTree)

    // 模板 chips 的图标走常规纹理需预载；素材网格与预览均按需异步
    const need = new Set<string>(ANIM_TEMPLATES.map((t) => t.icon))
    void Promise.all([
      Promise.all([...need].map((e) => ensureEmoji(this, e).catch(() => ''))),
      loadEmojiPack()
        .then((p) => {
          this.allKeys = packBaseKeys(p)
        })
        .catch((err) => console.error(`emoji 清单加载失败: ${String(err)}`)),
    ]).then(() => {
      if (!this.scene.isActive('studio')) return
      this.applyTab()
    })

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      this.animTimer?.remove()
      this.jobGen++
      for (const key of this.ownedKeys) this.textures.remove(key)
      this.ownedKeys.clear()
      // 真退出 Studio 才释放缩略缓存；旋转的内部 restart 保留（同档位复用）
      if (!this.preserveOnRestart) releaseEmojiThumbs(this)
    })
    this.report()
  }

  private detailRect(): { x: number; y: number; w: number; h: number } {
    const d = this.layout.detail
    return { x: this.origin.x + d.x, y: this.origin.y + d.y, w: d.w, h: d.h }
  }

  private listRect(): { x: number; y: number; w: number; h: number } {
    const l = this.layout.list
    return { x: this.origin.x + l.x, y: this.origin.y + l.y, w: l.w, h: l.h }
  }

  // ── tab 与素材网格 ──────────────────────────────────────────

  private buildTabs(res: number): void {
    const defs: { id: Tab; label: string }[] = [
      { id: 'recipes', label: '🎬 配方' },
      { id: 'templates', label: '🧩 模板' },
      { id: 'anatomy', label: '🔬 解剖' },
    ]
    for (const o of this.tabObjs) o.destroy()
    this.tabObjs = []
    this.tabRects = []
    const cx = this.origin.x + this.layout.content.w / 2
    const y = this.origin.y + this.layout.tabsY
    const chipW = 176
    const chipH = 54
    const gap = 18
    let x = cx - (defs.length * chipW + (defs.length - 1) * gap) / 2
    for (const d of defs) {
      const active = this.tab === d.id
      const bg = this.add.graphics()
      bg.fillStyle(active ? 0xffffff : 0x000000, active ? 0.22 : 0.2)
      bg.fillRoundedRect(x, y - chipH / 2, chipW, chipH, chipH / 2)
      bg.lineStyle(2, 0xffffff, active ? 0.9 : 0.12)
      bg.strokeRoundedRect(x, y - chipH / 2, chipW, chipH, chipH / 2)
      const label = this.add
        .text(x + chipW / 2, y, d.label, {
          fontFamily: UI_FONT,
          fontSize: FONT.strong,
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0.5)
        .setAlpha(active ? 1 : 0.62)
      const zone = this.add
        .zone(x, y - chipH / 2, chipW, chipH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (this.tab === d.id || this.grid?.wasDragged) return
          this.tab = d.id
          this.paused = false
          this.buildTabs(textRes())
          this.applyTab()
        })
      this.tabRects.push({ id: d.id, x, y: y - chipH / 2, w: chipW, h: chipH })
      this.tabObjs.push(bg, label, zone)
      x += chipW + gap
    }
  }

  /** 素材清单：配方页 = 有配方的 emoji；模板/解剖页 = 全部基础形态（通用操作） */
  private applyTab(): void {
    const grid = this.grid
    if (grid) {
      if (this.tab === 'recipes') {
        grid.setItems(ANIM_RECIPES.map((r) => emojiCodepoints(r.emoji)))
        grid.setSelected(emojiCodepoints(this.recipeSel))
      } else {
        grid.setItems(this.allKeys)
        grid.setSelected(emojiCodepoints(this.tab === 'templates' ? this.tplEmoji : this.anatEmoji))
      }
      grid.ensureVisible()
    }
    if (this.tab === 'recipes') this.buildRecipeDetail()
    else if (this.tab === 'templates') this.buildTemplateDetail()
    else this.buildAnatomyDetail()
    this.report()
  }

  private onGridTap(cp: string): void {
    if (this.tab === 'recipes') {
      const recipe = ANIM_RECIPES.find((r) => emojiCodepoints(r.emoji) === cp)
      if (!recipe || recipe.emoji === this.recipeSel) return
      this.recipeSel = recipe.emoji
      this.grid?.setSelected(cp)
      this.buildRecipeDetail()
    } else if (this.tab === 'templates') {
      const emoji = codepointsToEmoji(cp)
      if (emoji === this.tplEmoji) return
      this.tplEmoji = emoji
      this.grid?.setSelected(cp)
      this.buildTemplateDetail()
    } else {
      const emoji = codepointsToEmoji(cp)
      if (emoji === this.anatEmoji) return
      this.anatEmoji = emoji
      this.resetAnatState()
      this.grid?.setSelected(cp)
      this.buildAnatomyDetail()
    }
    this.report()
  }

  /** 解剖工作台状态归零（换 emoji / 进场重置） */
  private resetAnatState(): void {
    this.anatSelected = null
    this.anatHidden = new Set()
    this.anatCollapsed = new Set()
    this.anatScroll = 0
  }

  // ── 详情面板（三种形态共用清场逻辑） ────────────────────────

  private resetDetail(): { d: { x: number; y: number; w: number; h: number }; res: number } {
    this.animTimer?.remove()
    this.animTimer = undefined
    this.jobGen++
    this.anatSplitGen++
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    this.previewImg = undefined
    this.frameKeys = []
    this.tplRects = []
    this.anat = undefined
    this.anatRowMeta = []
    this.controlRects = {}
    return { d: this.detailRect(), res: textRes() }
  }

  /** 🎬 配方页：动画预览 + 播放控制 + 名称/描述/拆解 */
  private buildRecipeDetail(): void {
    const { d, res } = this.resetDetail()
    const recipe = animRecipeOf(this.recipeSel)
    if (!recipe) return
    const portrait = this.layout === PORTRAIT
    const previewSize = portrait ? 210 : 240
    const cx = d.x + d.w / 2
    let y = d.y + 18
    this.spawnPreview(cx, y + previewSize / 2, previewSize, recipe.emoji)
    y += previewSize + 14
    y = this.buildControls(cx, y, res) + 18
    const name = this.add
      .text(cx, y, `${recipe.emoji} ${recipe.name}`, {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5, 0)
    y += 50
    const desc = this.add
      .text(cx, y, recipe.desc, {
        fontFamily: UI_FONT,
        fontSize: FONT.body,
        color: '#e8e8f2',
        resolution: res,
        align: 'center',
        wordWrap: { width: d.w - 72, useAdvancedWrap: true },
        lineSpacing: 8,
      })
      .setOrigin(0.5, 0)
    y += desc.height + 14
    const anatomy = this.add
      .text(cx, y, `🔬 ${recipe.anatomy}`, {
        fontFamily: UI_FONT,
        fontSize: FONT.small,
        color: '#aab6cc',
        resolution: res,
        align: 'center',
        wordWrap: { width: d.w - 72, useAdvancedWrap: true },
        lineSpacing: 6,
      })
      .setOrigin(0.5, 0)
    this.detailObjs.push(name, desc, anatomy)
    this.startBake(recipe, previewSize)
  }

  /** 🧩 模板页：套用预览 + 播放控制 + 模板 chips */
  private buildTemplateDetail(): void {
    const { d, res } = this.resetDetail()
    const tpl = animTemplateOf(this.tplId) ?? ANIM_TEMPLATES[0]!
    const portrait = this.layout === PORTRAIT
    const previewSize = portrait ? 196 : 220
    const cx = d.x + d.w / 2
    let y = d.y + 16
    this.spawnPreview(cx, y + previewSize / 2, previewSize, this.tplEmoji)
    y += previewSize + 14
    y = this.buildControls(cx, y, res) + 16

    // 模板 chips：两行网格，点选即换装
    const cols = portrait ? 5 : 5
    const chipW = (d.w - 40 - (cols - 1) * 10) / cols
    const chipH = 62
    ANIM_TEMPLATES.forEach((t, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = d.x + 20 + col * (chipW + 10)
      const cy = y + row * (chipH + 10)
      const active = t.id === this.tplId
      const bg = this.add.graphics()
      bg.fillStyle(active ? 0xffffff : 0x000000, active ? 0.18 : 0.25)
      bg.fillRoundedRect(x, cy, chipW, chipH, 12)
      bg.lineStyle(active ? 2 : 1, 0xffffff, active ? 0.9 : 0.1)
      bg.strokeRoundedRect(x, cy, chipW, chipH, 12)
      const icon = emojiImage(this, x + chipW / 2, cy + 22, t.icon, 26)
      const label = this.add
        .text(x + chipW / 2, cy + chipH - 15, t.name, {
          fontFamily: UI_FONT,
          fontSize: FONT.caption,
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0.5)
        .setAlpha(active ? 1 : 0.65)
      const zone = this.add
        .zone(x, cy, chipW, chipH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (this.grid?.wasDragged || this.tplId === t.id) return
          this.tplId = t.id
          this.buildTemplateDetail()
          this.report()
        })
      this.tplRects.push({ id: t.id, x, y: cy, w: chipW, h: chipH })
      this.detailObjs.push(bg, icon, label, zone)
    })
    y += Math.ceil(ANIM_TEMPLATES.length / cols) * (chipH + 10) + 8
    const desc = this.add
      .text(cx, y, `${tpl.name}：${tpl.desc}`, {
        fontFamily: UI_FONT,
        fontSize: FONT.small,
        color: '#e8e8f2',
        resolution: res,
        align: 'center',
        wordWrap: { width: d.w - 72, useAdvancedWrap: true },
        lineSpacing: 6,
      })
      .setOrigin(0.5, 0)
    this.detailObjs.push(desc)

    // 套用模板需要目标 SVG 的元素数：异步取文本后构配方烘焙
    const emoji = this.tplEmoji
    const gen = ++this.jobGen
    this.previewState = 'loading'
    void emojiSvgText(emoji)
      .then((svg) => {
        if (gen !== this.jobGen) return
        const recipe = applyTemplate(tpl, emoji, svg)
        this.startBake(recipe, previewSize, `studio-tpl-${emojiCodepoints(emoji)}-${tpl.id}`)
      })
      .catch((err) => {
        console.error(`模板套用失败: ${String(err)}`)
        if (gen === this.jobGen) this.previewState = 'idle'
      })
  }

  /** 🔬 解剖页：双大图（完整原图 vs 按显隐+选中合成的拆分图）+ SVG 结构树。
   * 横屏树在右侧竖排整列（一眼十多行），竖屏树在大图下方全宽 */
  private buildAnatomyDetail(): void {
    const { d, res } = this.resetDetail()
    const portrait = this.layout === PORTRAIT
    const bigSize = portrait ? 240 : 232
    const emoji = this.anatEmoji
    const gen = ++this.jobGen
    this.previewState = 'loading'

    const title = this.add
      .text(d.x + 24, d.y + 14, portrait ? `${emoji} 结构树 · 点行选中 · 👁 显/隐` : `${emoji} 结构树`, {
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
        color: '#ffd54f',
        resolution: res,
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (this.grid?.wasDragged || this.anatDragMoved) return
        if (this.anatHidden.size === 0 && this.anatSelected === null && this.anatCollapsed.size === 0) return
        this.resetAnatState()
        this.rebuildAnatRows()
        this.refreshAnatInfo()
        void this.refreshAnatSplit()
        this.report()
      })
    this.anatResetRect = { x: reset.x - reset.width, y: reset.y, w: reset.width, h: reset.height }
    this.detailObjs.push(title, reset)

    void emojiSvgText(emoji)
      .then(async (svg) => {
        if (gen !== this.jobGen) return
        const tree = parseSvgTree(svg)
        // 完整大图纹理：每 emoji 只烘一次
        const fullKey = `studio-anat-full-${emojiCodepoints(emoji)}`
        if (!this.textures.exists(fullKey)) {
          const img = await svgToImage(setSvgSize(svg, RASTER))
          if (!this.textures.exists(fullKey)) {
            this.textures.addImage(fullKey, img)
            this.ownedKeys.add(fullKey)
          }
        }
        if (gen !== this.jobGen || !this.scene.isActive('studio')) return

        // 布局：横屏 = 大图区居左 + 树列居右；竖屏 = 大图在上 + 树全宽在下
        const treeArea = portrait
          ? { x: d.x + 24, y: d.y + 52 + bigSize + 74, w: d.w - 48, h: d.h - (52 + bigSize + 74) - 16 }
          : { x: d.x + d.w - 312, y: d.y + 48, w: 288, h: d.h - 64 }
        const zoneW = portrait ? d.w : d.w - 324
        const pairW = bigSize * 2 + 20
        const startX = d.x + (zoneW - pairW) / 2
        const cxAll = startX + bigSize / 2
        const cxSplit = startX + bigSize + 20 + bigSize / 2
        const midX = (cxAll + cxSplit) / 2
        const imgY = d.y + 52 + bigSize / 2

        // 双大图：左完整 | 右拆分（初始无状态 = 同图）
        const boxes = this.add.graphics()
        boxes.fillStyle(0x000000, 0.25)
        for (const bx of [cxAll, cxSplit]) {
          boxes.fillRoundedRect(bx - bigSize / 2 - 8, imgY - bigSize / 2 - 8, bigSize + 16, bigSize + 16, 12)
        }
        const fullImg = this.add.image(cxAll, imgY, fullKey).setDisplaySize(bigSize, bigSize)
        const splitImg = this.add.image(cxSplit, imgY, fullKey).setDisplaySize(bigSize, bigSize)
        const caps = (['完整', '拆分'] as const).map((label, i) =>
          this.add
            .text(i === 0 ? cxAll : cxSplit, imgY + bigSize / 2 + 20, label, {
              fontFamily: UI_FONT,
              fontSize: FONT.caption,
              color: '#8f8f9a',
              resolution: res,
            })
            .setOrigin(0.5),
        )
        const info = this.add
          .text(midX, imgY + bigSize / 2 + 38, '', {
            fontFamily: UI_FONT,
            fontSize: FONT.small,
            color: '#e8e8f2',
            resolution: res,
          })
          .setOrigin(0.5, 0)
        if (!portrait) {
          // 横屏大图下方富余空间放操作说明（竖屏紧凑，靠标题一句话）
          const legend = this.add
            .text(midX, imgY + bigSize / 2 + 82, '👁 显 · 🙈 隐 · ▸▾ 展开收起\n点行选中，再点取消 · ↺ 复位', {
              fontFamily: UI_FONT,
              fontSize: FONT.caption,
              color: '#8f8f9a',
              resolution: res,
              align: 'center',
              lineSpacing: 8,
            })
            .setOrigin(0.5, 0)
          this.detailObjs.push(legend)
        }

        // 结构树列表：遮罩 + 滚动（遮罩不裁输入，行内自校验可见性）
        const treeBg = this.add.graphics()
        treeBg.fillStyle(0x000000, 0.16)
        treeBg.fillRoundedRect(treeArea.x - 8, treeArea.y - 8, treeArea.w + 16, treeArea.h + 16, 12)
        const mask = this.add.graphics().setVisible(false)
        mask.fillStyle(0xffffff, 1)
        mask.fillRect(treeArea.x, treeArea.y, treeArea.w, treeArea.h)
        const rowsBox = this.add.container(treeArea.x, treeArea.y)
        rowsBox.setMask(mask.createGeometryMask())

        this.detailObjs.push(treeBg, boxes, fullImg, splitImg, ...caps, info, mask, rowsBox)
        this.anat = { tree, splitImg, fullKey, info, rowsBox, area: treeArea, rowObjs: [], res, bigSize }
        this.anatAllRows = flattenTree(tree, new Set())
        this.anatFullRect = { x: cxAll - bigSize / 2, y: imgY - bigSize / 2, w: bigSize, h: bigSize }
        this.anatSplitRect = { x: cxSplit - bigSize / 2, y: imgY - bigSize / 2, w: bigSize, h: bigSize }
        this.rebuildAnatRows()
        this.refreshAnatInfo()
        void this.refreshAnatSplit()
        this.previewState = 'ready'
        this.report()
      })
      .catch((err) => {
        console.error(`解剖失败: ${String(err)}`)
        if (gen === this.jobGen) this.previewState = 'idle'
      })
  }

  /** path 自身或任一祖先被隐藏（行置灰与上报共用） */
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
    if (this.time.now - this.reportAt > 120) this.report()
  }

  /** 结构树行列表全量重建（行数小；选中/显隐/展开任一变化都走这里） */
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
      const selected = row.path === this.anatSelected
      const dim = this.anatEffHidden(row.path)
      const bg = this.add.graphics()
      bg.fillStyle(selected ? 0xffffff : 0x000000, selected ? 0.16 : 0.2)
      bg.fillRoundedRect(0, y + 2, a.area.w, ANAT_ROW - 4, 10)
      bg.lineStyle(selected ? 2 : 1, selected ? 0xffd54f : 0xffffff, selected ? 0.9 : 0.08)
      bg.strokeRoundedRect(1, y + 3, a.area.w - 2, ANAT_ROW - 6, 10)
      const parts: Phaser.GameObjects.GameObject[] = [bg]

      // 树列较窄（横屏 288px），缩进克制些给标签留宽
      const indent = 12 + row.depth * 22
      if (row.container) {
        parts.push(
          this.add
            .text(indent, y + ANAT_ROW / 2, this.anatCollapsed.has(row.path) ? '▸' : '▾', {
              fontFamily: UI_FONT,
              fontSize: FONT.small,
              color: '#c8c8d4',
              resolution: a.res,
            })
            .setOrigin(0, 0.5),
        )
      }
      let x = indent + 26
      let eyeX: number | null = null
      if (row.paints) {
        eyeX = x
        parts.push(
          this.add
            .text(x, y + ANAT_ROW / 2, this.anatHidden.has(row.path) ? '🙈' : '👁', {
              fontFamily: UI_FONT,
              fontSize: FONT.small,
              resolution: a.res,
            })
            .setOrigin(0, 0.5)
            .setAlpha(dim && !this.anatHidden.has(row.path) ? 0.4 : 1),
        )
        x += 36
      }
      if (row.fill && /^#[0-9a-fA-F]{6}$/.test(row.fill)) {
        const sw = this.add.graphics()
        sw.fillStyle(Number.parseInt(row.fill.slice(1), 16), 1)
        sw.fillRoundedRect(x, y + ANAT_ROW / 2 - 8, 16, 16, 4)
        sw.lineStyle(1, 0xffffff, 0.25)
        sw.strokeRoundedRect(x, y + ANAT_ROW / 2 - 8, 16, 16, 4)
        parts.push(sw)
        x += 26
      }
      const label = `#${row.path} <${row.tag}>${row.container ? ` ×${row.childCount}` : ''}${row.paints ? '' : ' 共享定义'}`
      parts.push(
        this.add
          .text(x, y + ANAT_ROW / 2, label, {
            fontFamily: UI_FONT,
            fontSize: FONT.small,
            color: dim ? '#787885' : '#e8e8f2',
            resolution: a.res,
          })
          .setOrigin(0, 0.5)
          .setAlpha(row.paints ? 1 : 0.75),
      )

      // 单行一个命中区，按点击 x 分派：展开箭头 / 眼睛 / 选中
      const zone = this.add
        .zone(0, y, a.area.w, ANAT_ROW)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', (p: Phaser.Input.Pointer) => {
          if (this.grid?.wasDragged || this.anatDragMoved) return
          const relY = y - this.anatScroll
          if (relY + ANAT_ROW < 0 || relY > a.area.h) return
          const localX = p.worldX - a.area.x
          if (row.container && localX >= indent - 8 && localX < indent + 24) {
            if (this.anatCollapsed.has(row.path)) this.anatCollapsed.delete(row.path)
            else this.anatCollapsed.add(row.path)
            this.rebuildAnatRows()
            this.report()
            return
          }
          if (eyeX !== null && localX >= eyeX - 8 && localX < eyeX + 32) {
            if (this.anatHidden.has(row.path)) this.anatHidden.delete(row.path)
            else this.anatHidden.add(row.path)
            this.rebuildAnatRows()
            this.refreshAnatInfo()
            void this.refreshAnatSplit()
            this.report()
            return
          }
          this.anatSelected = this.anatSelected === row.path ? null : row.path
          this.rebuildAnatRows()
          this.refreshAnatInfo()
          void this.refreshAnatSplit()
          this.report()
        })
      parts.push(zone)

      for (const o of parts) a.rowsBox.add(o)
      a.rowObjs.push(...parts)
      this.anatRowMeta.push({ row, eyeX })
    })
  }

  private refreshAnatInfo(): void {
    const a = this.anat
    if (!a) return
    const sel = this.anatSelected ? this.anatAllRows.find((r) => r.path === this.anatSelected) : undefined
    if (sel) {
      a.info.setText(
        `#${sel.path} <${sel.tag}> · fill ${sel.fill ?? '(无)'}` +
          `${sel.container ? ` · ${sel.childCount} 子元素` : ''}${this.anatEffHidden(sel.path) ? ' · 已隐藏' : ''}`,
      )
      return
    }
    const paintCount = this.anatAllRows.filter((r) => r.paints).length
    a.info.setText(`共 ${paintCount} 个绘制节点 · 已隐藏 ${this.anatHidden.size} · 点行选中/👁 显隐`)
  }

  /** 拆分大图重光栅化：无状态时直接复用完整图纹理；有状态时合成 → 烘新帧 →
   * 就绪才替换并回收上一帧纹理（竞态凭代数自弃） */
  private async refreshAnatSplit(): Promise<void> {
    const a = this.anat
    if (!a) return
    const detailGen = this.jobGen
    const gen = ++this.anatSplitGen
    if (this.anatHidden.size === 0 && this.anatSelected === null) {
      a.splitImg.setTexture(a.fullKey).setDisplaySize(a.bigSize, a.bigSize)
      this.dropAnatLive(undefined)
      return
    }
    const svg = composeSvg(a.tree, { hidden: this.anatHidden, focus: this.anatSelected })
    try {
      const img = await svgToImage(setSvgSize(svg, RASTER))
      if (gen !== this.anatSplitGen || detailGen !== this.jobGen || !this.scene.isActive('studio')) return
      const key = `studio-anat-live-${++this.anatLiveCounter}`
      this.textures.addImage(key, img)
      this.ownedKeys.add(key)
      a.splitImg.setTexture(key).setDisplaySize(a.bigSize, a.bigSize)
      this.dropAnatLive(key)
    } catch (err) {
      console.warn(`拆分图渲染失败: ${String(err)}`)
    }
  }

  /** 回收上一帧拆分纹理，记录新帧 key（undefined = 只回收） */
  private dropAnatLive(next: string | undefined): void {
    if (this.anatLiveKey && this.anatLiveKey !== next && this.textures.exists(this.anatLiveKey)) {
      this.textures.remove(this.anatLiveKey)
      this.ownedKeys.delete(this.anatLiveKey)
    }
    this.anatLiveKey = next
  }

  // ── 预览与播放控制 ──────────────────────────────────────────

  /** 预览 Image：全量网格任选的 emoji 纹理未必就绪——先占位隐藏，
   * 静态图异步浮现垫底（烘焙帧若先到位则不再回退到静态图） */
  private spawnPreview(cx: number, cy: number, size: number, emoji: string): void {
    const img = this.add.image(cx, cy, '__DEFAULT').setVisible(false)
    this.previewImg = img
    this.previewSize = size
    this.detailObjs.push(img)
    void ensureEmoji(this, emoji)
      .then((key) => {
        if (this.previewImg !== img || this.frameKeys.length > 0 || !this.scene.isActive('studio')) return
        img.setTexture(key).setDisplaySize(size, size).setVisible(true)
      })
      .catch((err) => console.warn(`预览加载失败 ${emoji}: ${String(err)}`))
  }

  /** 播放控制条：⏮ ⏯ ⏭ 速度；返回控制条底部 y */
  private buildControls(cx: number, y: number, res: number): number {
    const defs: { id: string; label: () => string; onTap: () => void }[] = [
      {
        id: 'prev',
        label: () => '⏮',
        onTap: () => this.stepFrame(-1),
      },
      {
        id: 'toggle',
        label: () => (this.paused ? '▶️' : '⏸'),
        onTap: () => {
          this.paused = !this.paused
          this.restartTimer()
          this.refreshControls()
        },
      },
      {
        id: 'next',
        label: () => '⏭',
        onTap: () => this.stepFrame(1),
      },
      {
        id: 'speed',
        label: () => `${SPEEDS[this.speedIdx]}×`,
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
    this.controlLabels = {}
    for (const def of defs) {
      const bg = this.add.graphics()
      bg.fillStyle(0x000000, 0.28)
      bg.fillRoundedRect(x, y, btnW, btnH, 12)
      bg.lineStyle(1, 0xffffff, 0.15)
      bg.strokeRoundedRect(x, y, btnW, btnH, 12)
      const label = this.add
        .text(x + btnW / 2, y + btnH / 2, def.label(), {
          fontFamily: UI_FONT,
          fontSize: FONT.head,
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0.5)
      const zone = this.add
        .zone(x, y, btnW, btnH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (this.grid?.wasDragged) return
          def.onTap()
        })
      this.controlRects[def.id] = { x, y, w: btnW, h: btnH }
      this.controlLabels[def.id] = { label, render: def.label }
      this.detailObjs.push(bg, label, zone)
      x += btnW + gap
    }
    return y + btnH
  }

  private controlLabels: Record<string, { label: Phaser.GameObjects.Text; render: () => string }> = {}

  private refreshControls(): void {
    for (const { label, render } of Object.values(this.controlLabels)) label.setText(render())
    this.report()
  }

  /** 逐帧步进（自动暂停） */
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

  /** 按当前暂停/速度状态重建播放 timer */
  private restartTimer(): void {
    this.animTimer?.remove()
    this.animTimer = undefined
    if (this.paused || this.frameKeys.length === 0) return
    this.animTimer = this.time.addEvent({
      delay: Math.max(30, ANIM_SPEC.durMs / ANIM_SPEC.frames / SPEEDS[this.speedIdx]!),
      loop: true,
      callback: () => {
        this.frameIdx = (this.frameIdx + 1) % this.frameKeys.length
        this.previewImg?.setTexture(this.frameKeys[this.frameIdx]!).setDisplaySize(this.previewSize, this.previewSize)
      },
    })
  }

  /** 烘焙配方帧并进入播放（keyPrefix 缺省按配方 emoji 命名） */
  private startBake(recipe: AnimRecipe, size: number, keyPrefix?: string): void {
    const gen = ++this.jobGen
    this.previewState = 'loading'
    void this.bakeAnimTextures(recipe, keyPrefix)
      .then((keys) => {
        if (gen !== this.jobGen || !this.previewImg) return
        this.previewState = 'ready'
        this.frameKeys = keys
        this.frameIdx = 0
        this.previewSize = size
        this.previewImg.setTexture(keys[0]!).setDisplaySize(size, size).setVisible(true)
        this.restartTimer()
        this.report()
      })
      .catch((err) => {
        console.error(`动画烘焙失败: ${String(err)}`)
        if (gen === this.jobGen) this.previewState = 'idle'
      })
  }

  private async bakeAnimTextures(recipe: AnimRecipe, keyPrefix?: string): Promise<string[]> {
    const svg = await emojiSvgText(recipe.emoji)
    const prefix = keyPrefix ?? `studio-anim-${emojiCodepoints(recipe.emoji)}`
    const keys: string[] = []
    for (let k = 0; k < ANIM_SPEC.frames; k++) {
      const key = `${prefix}-${k}`
      keys.push(key)
      if (this.textures.exists(key)) continue
      const frame = bakeAnimFrame(svg, recipe, k / ANIM_SPEC.frames)
      const img = await svgToImage(setSvgSize(frame, RASTER))
      if (!this.textures.exists(key)) {
        this.textures.addImage(key, img)
        this.ownedKeys.add(key)
      }
    }
    return keys
  }

  // ── 杂项 ────────────────────────────────────────────────────

  /** 解剖工作台调试上报：完整可见的行（含眼睛命中区）+ 状态 + 关键矩形 */
  private anatReport(): NonNullable<WarmojiStudioDebug['anatomy']> | undefined {
    const a = this.anat
    if (this.tab !== 'anatomy' || !a) return undefined
    return {
      selected: this.anatSelected,
      hidden: [...this.anatHidden],
      rows: this.anatRowMeta
        .map(({ row, eyeX }, i) => ({
          path: row.path,
          tag: row.tag,
          depth: row.depth,
          container: row.container,
          expanded: row.container ? !this.anatCollapsed.has(row.path) : null,
          hidden: this.anatEffHidden(row.path),
          x: a.area.x,
          y: a.area.y + i * ANAT_ROW - this.anatScroll,
          w: a.area.w,
          h: ANAT_ROW,
          eye: eyeX === null ? null : { x: a.area.x + eyeX, y: a.area.y + i * ANAT_ROW - this.anatScroll, w: 32, h: ANAT_ROW },
        }))
        .filter((r) => r.y >= a.area.y && r.y + r.h <= a.area.y + a.area.h),
      reset: this.anatResetRect,
      full: this.anatFullRect,
      split: this.anatSplitRect,
    }
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }

  private report(): void {
    reportDebug({
      scene: 'studio',
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
      studio: {
        tab: this.tab,
        tabs: this.tabRects.map((t) => ({ id: t.id, x: t.x, y: t.y, w: t.w, h: t.h })),
        items: this.grid?.cellRects() ?? [],
        selected:
          this.tab === 'recipes' ? this.recipeSel : this.tab === 'templates' ? this.tplEmoji : this.anatEmoji,
        template: this.tplId,
        templates: this.tplRects,
        anatomy: this.anatReport(),
        controls: this.controlRects,
        paused: this.paused,
        speed: SPEEDS[this.speedIdx]!,
        preview: this.previewState,
        thumbsReady: emojiThumbsReady(),
        back: this.backRect,
      },
    })
    this.reportAt = this.time.now
  }
}
