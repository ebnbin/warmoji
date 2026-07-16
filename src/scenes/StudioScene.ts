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
  dissectSvg,
} from '../core/studio'
import type { AnimRecipe } from '../core/studio'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { emojiImage, emojiSvgText, ensureEmoji, loadEmojiPack, svgToImage } from '../ui/emoji'
import { emojiThumbSize, emojiThumbsReady, prepareEmojiThumbs, releaseEmojiThumbs } from '../ui/emojiThumbs'
import { FONT, UI_FONT } from '../ui/fonts'
import { VirtualEmojiGrid } from '../ui/virtualGrid'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

// Emoji Studio：twemoji 部件动画的游戏内工作台，三个 tab——
// 🎬 配方 = animations.json 里的精修动画预览；🧩 模板 = 任选 emoji × 通用
// 动画模板即选即看（铺量动画的试衣间）；🔬 解剖 = 逐元素独显 + 下标/填色
// 情报（写专属配方的 X 光）。素材区 = feed 流虚拟网格：配方页列有配方的
// emoji，模板/解剖页列全部基础形态（模板与解剖对任意 SVG 通用）。
// 预览区带暂停/逐帧/速度控制，检查烘焙质量。内容按保底画布设计、整体
// 居中；studio- 纹理场景自管理，shutdown 全清，缩略缓存真退出才释放。
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
  detail: { x: 40, y: 138, w: 620, h: 550 },
  list: { x: 700, y: 138, w: 540, h: 550 },
}

const PORTRAIT: StudioLayout = {
  content: { w: 720, h: 1280 },
  headerY: 52,
  tabsY: 112,
  detail: { x: 24, y: 152, w: 672, h: 522 },
  list: { x: 24, y: 704, w: 672, h: 552 },
}

const RASTER = 256
const SPEEDS = [1, 0.5, 0.25] as const

type Tab = 'recipes' | 'templates' | 'anatomy'

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
  private anatIndex = 0
  /** 全部基础形态码点清单（打包资源就绪后填充） */
  private allKeys: string[] = []

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
  private anatRects: { index: number; x: number; y: number; w: number; h: number }[] = []
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
      this.anatIndex = 0
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
      this.anatIndex = 0
      this.grid?.setSelected(cp)
      this.buildAnatomyDetail()
    }
    this.report()
  }

  // ── 详情面板（三种形态共用清场逻辑） ────────────────────────

  private resetDetail(): { d: { x: number; y: number; w: number; h: number }; res: number } {
    this.animTimer?.remove()
    this.animTimer = undefined
    this.jobGen++
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    this.previewImg = undefined
    this.frameKeys = []
    this.tplRects = []
    this.anatRects = []
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

  /** 🔬 解剖页：选中元素大图 + 信息行 + 元素缩略网格 */
  private buildAnatomyDetail(): void {
    const { d, res } = this.resetDetail()
    const portrait = this.layout === PORTRAIT
    const bigSize = portrait ? 150 : 170
    const cx = d.x + d.w / 2
    const emoji = this.anatEmoji
    const gen = ++this.jobGen
    this.previewState = 'loading'

    const title = this.add
      .text(cx, d.y + 14, `${emoji} 部件解剖 · 点击缩略图独显该元素`, {
        fontFamily: UI_FONT,
        fontSize: FONT.small,
        color: '#aab6cc',
        resolution: res,
      })
      .setOrigin(0.5, 0)
    this.detailObjs.push(title)

    void emojiSvgText(emoji)
      .then(async (svg) => {
        if (gen !== this.jobGen) return
        const parts = dissectSvg(svg)
        this.anatIndex = Math.min(this.anatIndex, parts.length - 1)
        // 逐元素独显纹理（一次全烘，供大图与缩略共用）
        const keys: string[] = []
        for (const part of parts) {
          const key = `studio-anat-${emojiCodepoints(emoji)}-${part.index}`
          keys.push(key)
          if (!this.textures.exists(key)) {
            const img = await svgToImage(setSvgSize(part.svg, 128))
            if (!this.textures.exists(key)) {
              this.textures.addImage(key, img)
              this.ownedKeys.add(key)
            }
          }
        }
        if (gen !== this.jobGen || !this.scene.isActive('studio')) return

        // 大图 + 信息行
        const bigY = d.y + 46 + bigSize / 2
        const bigBg = this.add.graphics()
        bigBg.fillStyle(0x000000, 0.25)
        bigBg.fillRoundedRect(cx - bigSize / 2 - 10, bigY - bigSize / 2 - 10, bigSize + 20, bigSize + 20, 14)
        const bigImg = this.add.image(cx, bigY, keys[this.anatIndex]!).setDisplaySize(bigSize, bigSize)
        const info = this.add
          .text(cx, bigY + bigSize / 2 + 18, '', {
            fontFamily: UI_FONT,
            fontSize: FONT.small,
            color: '#e8e8f2',
            resolution: res,
          })
          .setOrigin(0.5, 0)
        const setInfo = (i: number): void => {
          const p = parts[i]!
          info.setText(`#${p.index} · <${p.tag}> · fill ${p.fill ?? '(无)'} · 共 ${parts.length} 个元素`)
        }
        setInfo(this.anatIndex)
        this.detailObjs.push(bigBg, bigImg, info)

        // 缩略网格
        const thumb = 52
        const gap = 8
        const cols = Math.floor((d.w - 40 + gap) / (thumb + gap))
        const gridW = cols * (thumb + gap) - gap
        const x0 = d.x + (d.w - gridW) / 2
        const y0 = bigY + bigSize / 2 + 52
        const thumbRedraws: (() => void)[] = []
        parts.forEach((part, i) => {
          const x = x0 + (i % cols) * (thumb + gap)
          const ty = y0 + Math.floor(i / cols) * (thumb + gap)
          const bg = this.add.graphics()
          const drawThumb = (): void => {
            bg.clear()
            const active = i === this.anatIndex
            bg.fillStyle(active ? 0xffffff : 0x000000, active ? 0.2 : 0.28)
            bg.fillRoundedRect(x, ty, thumb, thumb, 8)
            bg.lineStyle(active ? 2 : 1, 0xffffff, active ? 0.9 : 0.1)
            bg.strokeRoundedRect(x, ty, thumb, thumb, 8)
          }
          drawThumb()
          const img = this.add.image(x + thumb / 2, ty + thumb / 2, keys[i]!).setDisplaySize(thumb - 10, thumb - 10)
          const num = this.add
            .text(x + thumb - 3, ty + 1, String(part.index), {
              fontFamily: UI_FONT,
              fontSize: FONT.caption,
              color: '#ffd54f',
              resolution: res,
            })
            .setOrigin(1, 0)
          const zone = this.add
            .zone(x, ty, thumb, thumb)
            .setOrigin(0)
            .setInteractive({ useHandCursor: true })
            .on('pointerup', () => {
              if (this.grid?.wasDragged || this.anatIndex === i) return
              this.anatIndex = i
              bigImg.setTexture(keys[i]!).setDisplaySize(bigSize, bigSize)
              setInfo(i)
              // 重画全部缩略选中框（数量小，直接全刷）
              this.buildAnatomyDetailThumbs?.()
              this.report()
            })
          this.anatRects.push({ index: i, x, y: ty, w: thumb, h: thumb })
          this.detailObjs.push(bg, img, num, zone)
          // 登记重绘钩子：选中态变化时全刷（数量小）
          thumbRedraws.push(drawThumb)
        })
        this.buildAnatomyDetailThumbs = () => thumbRedraws.forEach((f) => f())
        this.previewState = 'ready'
        this.report()
      })
      .catch((err) => {
        console.error(`解剖失败: ${String(err)}`)
        if (gen === this.jobGen) this.previewState = 'idle'
      })
  }

  private buildAnatomyDetailThumbs?: () => void

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
        anatomyIndex: this.anatIndex,
        anatomyParts: this.anatRects,
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
