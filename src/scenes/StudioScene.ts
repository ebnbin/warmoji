import Phaser from 'phaser'
import { emojiCodepoints } from '../core/emoji'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { setSvgSize } from '../core/svg'
import {
  ANIM_RECIPES,
  MERGE_POOL,
  animRecipeOf,
  bakeAnimFrame,
  findMergeRecipe,
  mergeSvg,
} from '../core/studio'
import type { AnimRecipe } from '../core/studio'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { emojiImage, emojiSvgUrl, ensureEmoji, svgToImage } from '../ui/emoji'
import { EmojiGrid } from '../ui/grid'
import { FONT, UI_FONT } from '../ui/fonts'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

// Emoji Studio：twemoji 源码级改造的游戏内试验台。
// 「动画」tab = 部件动画配方预览（core/studio 烘焙 N 帧 → N 张纹理循环播放，
// 正是未来游戏内落地的同一条管线）；「合并」tab = 任选两个 emoji 合成新形象
// （精品配方命中则出调参过的效果，未命中走通用徽章叠加兜底）。
// 所有 studio- 前缀纹理本场景自管理，shutdown 全量清理，不挤占 emoji LRU。
interface StudioLayout {
  headerY: number
  tabsY: number
  detail: { x: number; y: number; w: number; h: number }
  list: { x: number; y: number; w: number; h: number }
}

const LANDSCAPE: StudioLayout = {
  headerY: 44,
  tabsY: 102,
  detail: { x: 40, y: 140, w: 620, h: 548 },
  list: { x: 700, y: 140, w: 540, h: 548 },
}

const PORTRAIT: StudioLayout = {
  headerY: 52,
  tabsY: 116,
  detail: { x: 24, y: 212, w: 672, h: 470 },
  list: { x: 24, y: 700, w: 672, h: 552 },
}

const RASTER = 256

type Tab = 'anim' | 'merge'

// SVG 文本缓存（模块级：跨场景重启复用，twemoji 文件不可变）
const svgTextCache = new Map<string, Promise<string>>()

function fetchSvgText(emoji: string): Promise<string> {
  let p = svgTextCache.get(emoji)
  if (!p) {
    p = fetch(emojiSvgUrl(emoji)).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status} ${emojiSvgUrl(emoji)}`)
      return res.text()
    })
    p.catch(() => svgTextCache.delete(emoji))
    svgTextCache.set(emoji, p)
  }
  return p
}

export class StudioScene extends Phaser.Scene {
  private preserveOnRestart = false
  private palette?: Palette
  private tab: Tab = 'anim'
  private animSelected = ANIM_RECIPES[0]!.emoji
  private slotA: string | null = '🧟'
  private slotB: string | null = '🤠'
  private activeSlot: 'a' | 'b' = 'a'

  private layout!: StudioLayout
  private grid?: EmojiGrid
  private previewImg?: Phaser.GameObjects.Image
  private previewState: 'idle' | 'loading' | 'ready' = 'idle'
  private animTimer?: Phaser.Time.TimerEvent
  /** 异步烘焙/合成的竞态令牌：切换选择后旧任务作废 */
  private jobGen = 0
  /** 本场景创建的纹理，shutdown 全量移除 */
  private ownedKeys = new Set<string>()
  private detailFrameDrawn = false

  private nameText?: Phaser.GameObjects.Text
  private descText?: Phaser.GameObjects.Text
  private anatomyText?: Phaser.GameObjects.Text
  private frameInfoText?: Phaser.GameObjects.Text
  private slotObjs: Phaser.GameObjects.GameObject[] = []
  private tabRects: { id: Tab; x: number; y: number; w: number; h: number }[] = []
  private slotRects = {
    a: { x: 0, y: 0, w: 0, h: 0 },
    b: { x: 0, y: 0, w: 0, h: 0 },
  }
  private backRect = { x: 0, y: 0, w: 0, h: 0 }
  private tabObjs: Phaser.GameObjects.GameObject[] = []

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
      this.tab = 'anim'
      this.animSelected = ANIM_RECIPES[0]!.emoji
      this.slotA = '🧟'
      this.slotB = '🤠'
      this.activeSlot = 'a'
    }
    this.previewState = 'idle'
    this.detailFrameDrawn = false
    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    this.layout = w >= h ? LANDSCAPE : PORTRAIT
    const res = textRes()

    // 顶栏：返回 + 标题
    const backText = this.add
      .text(safeInsets.left + 24, this.layout.headerY, '← 返回', {
        fontFamily: UI_FONT,
        fontSize: FONT.head,
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(0, 0.5)
      .setAlpha(0.75)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.scene.start('menu'))
    this.backRect = {
      x: backText.x - 8,
      y: backText.y - 24,
      w: backText.width + 16,
      h: 48,
    }
    const title = this.add
      .text(w / 2, this.layout.headerY, 'Emoji Studio', {
        fontFamily: UI_FONT,
        fontSize: FONT.title,
        fontStyle: 'bold',
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(0.5)
    emojiImage(this, title.x - title.width / 2 - 34, this.layout.headerY, '🧪', 40)

    this.buildTabs(w, res)
    this.grid = new EmojiGrid(this, this.layout.list, { cellSize: 96 })
    this.grid.onTap = (key) => this.onGridTap(key)
    this.grid.onScroll = () => this.report()

    // 候选 emoji 可能不在预载集：先 ensure 再填充网格
    const need = new Set<string>([...MERGE_POOL, ...ANIM_RECIPES.map((r) => r.emoji)])
    void Promise.all([...need].map((e) => ensureEmoji(this, e).catch(() => ''))).then(() => {
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
    })
    this.report()
  }

  // ── tab 与网格 ──────────────────────────────────────────────

  private buildTabs(w: number, res: number): void {
    const defs: { id: Tab; label: string }[] = [
      { id: 'anim', label: '🎬 部件动画' },
      { id: 'merge', label: '🧬 emoji 合并' },
    ]
    for (const o of this.tabObjs) o.destroy()
    this.tabObjs = []
    this.tabRects = []
    const chipW = 240
    const chipH = 56
    const gap = 20
    const total = defs.length * chipW + (defs.length - 1) * gap
    let x = w / 2 - total / 2
    for (const d of defs) {
      const active = this.tab === d.id
      const bg = this.add.graphics()
      bg.fillStyle(active ? 0xffffff : 0x000000, active ? 0.22 : 0.2)
      bg.fillRoundedRect(x, this.layout.tabsY - chipH / 2, chipW, chipH, chipH / 2)
      bg.lineStyle(2, 0xffffff, active ? 0.9 : 0.12)
      bg.strokeRoundedRect(x, this.layout.tabsY - chipH / 2, chipW, chipH, chipH / 2)
      const label = this.add
        .text(x + chipW / 2, this.layout.tabsY, d.label, {
          fontFamily: UI_FONT,
          fontSize: FONT.strong,
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0.5)
        .setAlpha(active ? 1 : 0.62)
      const zone = this.add
        .zone(x, this.layout.tabsY - chipH / 2, chipW, chipH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (this.tab === d.id || this.grid?.wasDragged) return
          this.tab = d.id
          this.buildTabs(viewport.logicalWidth, textRes())
          this.applyTab()
        })
      this.tabRects.push({ id: d.id, x, y: this.layout.tabsY - chipH / 2, w: chipW, h: chipH })
      this.tabObjs.push(bg, label, zone)
      x += chipW + gap
    }
  }

  /** tab 生效：重建网格条目 + 详情面板 */
  private applyTab(): void {
    if (this.tab === 'anim') {
      this.grid?.setItems(ANIM_RECIPES.map((r) => ({ key: r.emoji, emoji: r.emoji })))
      this.grid?.setSelected(this.animSelected)
      this.buildAnimDetail()
    } else {
      this.grid?.setItems(MERGE_POOL.map((e) => ({ key: e, emoji: e })))
      this.grid?.setSelected(this.activeSlot === 'a' ? this.slotA : this.slotB)
      this.buildMergeDetail()
    }
    this.report()
  }

  private onGridTap(key: string): void {
    if (this.tab === 'anim') {
      if (key === this.animSelected) return
      this.animSelected = key
      this.grid?.setSelected(key)
      this.buildAnimDetail()
    } else {
      if (this.activeSlot === 'a') {
        this.slotA = key
        this.activeSlot = 'b'
      } else {
        this.slotB = key
        this.activeSlot = 'a'
      }
      this.grid?.setSelected(this.activeSlot === 'a' ? this.slotA : this.slotB)
      this.buildMergeDetail()
    }
    this.report()
  }

  // ── 详情面板 ────────────────────────────────────────────────

  /** 清空并重画详情面板骨架，返回复用的排版锚点 */
  private resetDetail(): { d: StudioLayout['detail']; res: number } {
    const d = this.layout.detail
    const res = textRes()
    this.animTimer?.remove()
    this.animTimer = undefined
    this.jobGen++
    for (const o of [
      this.previewImg,
      this.nameText,
      this.descText,
      this.anatomyText,
      this.frameInfoText,
      ...this.slotObjs,
    ]) {
      o?.destroy()
    }
    this.slotObjs = []
    this.previewImg = undefined
    if (!this.detailFrameDrawn) {
      const frame = this.add.graphics()
      frame.fillStyle(0x000000, 0.18)
      frame.fillRoundedRect(d.x - 8, d.y - 8, d.w + 16, d.h + 16, 14)
      this.detailFrameDrawn = true
    }
    return { d, res }
  }

  private buildAnimDetail(): void {
    const { d, res } = this.resetDetail()
    const recipe = animRecipeOf(this.animSelected)
    if (!recipe) return
    const previewSize = Math.min(d.w * 0.44, d.h * 0.5, 270)
    const cx = d.x + d.w / 2
    this.previewImg = emojiImage(this, cx, d.y + previewSize / 2 + 14, recipe.emoji, previewSize)
    this.previewState = 'loading'

    let ty = d.y + previewSize + 44
    this.nameText = this.add
      .text(cx, ty, `${recipe.emoji} ${recipe.name}`, {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(0.5, 0)
    ty += 52
    this.descText = this.add
      .text(d.x + 28, ty, recipe.desc, {
        fontFamily: UI_FONT,
        fontSize: FONT.body,
        color: '#e8e8f2',
        resolution: res,
        wordWrap: { width: d.w - 56, useAdvancedWrap: true },
        lineSpacing: 8,
      })
      .setOrigin(0, 0)
    ty += this.descText.height + 18
    this.anatomyText = this.add
      .text(d.x + 28, ty, `🔬 部件拆解：${recipe.anatomy}`, {
        fontFamily: UI_FONT,
        fontSize: FONT.small,
        color: '#aab6cc',
        resolution: res,
        wordWrap: { width: d.w - 56, useAdvancedWrap: true },
        lineSpacing: 6,
      })
      .setOrigin(0, 0)
    this.frameInfoText = this.add
      .text(d.x + d.w - 20, d.y + 16, `${recipe.frames} 帧 · ${recipe.durMs}ms 循环`, {
        fontFamily: UI_FONT,
        fontSize: FONT.caption,
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(1, 0)
      .setAlpha(0.45)

    const gen = ++this.jobGen
    void this.bakeAnimTextures(recipe)
      .then((keys) => {
        if (gen !== this.jobGen || !this.previewImg) return
        this.previewState = 'ready'
        this.playFrames(keys, recipe.durMs, previewSize)
        this.report()
      })
      .catch((err) => {
        console.error(`动画烘焙失败: ${String(err)}`)
        if (gen === this.jobGen) this.previewState = 'idle'
      })
    this.report()
  }

  private buildMergeDetail(): void {
    const { d, res } = this.resetDetail()
    const a = this.slotA
    const b = this.slotB
    const recipe = a && b ? findMergeRecipe(a, b) : null
    const previewSize = Math.min(d.w * 0.4, d.h * 0.4, 240)
    const cx = d.x + d.w / 2
    const previewY = d.y + previewSize / 2 + 10

    // 结果预览：合成完成前先显示 A（或占位问号）
    this.previewImg = emojiImage(this, cx, previewY, a ?? '❓', previewSize).setAlpha(a && b ? 0.35 : 0.8)
    this.previewState = a && b ? 'loading' : 'idle'

    // 结果角标 + A/B 槽位行（+ 号居中）
    const resultTag = this.add
      .text(cx, d.y + previewSize + 18, '↑ 合并结果', {
        fontFamily: UI_FONT,
        fontSize: FONT.caption,
        color: '#ffd54f',
        resolution: res,
      })
      .setOrigin(0.5)
      .setAlpha(0.7)
    const slotSize = 96
    const rowY = d.y + previewSize + 18 + 54
    const slotGap = 130
    this.buildSlot('a', cx - slotGap, rowY, slotSize, res)
    this.buildSlot('b', cx + slotGap, rowY, slotSize, res)
    const plus = this.add
      .text(cx, rowY, '+', {
        fontFamily: UI_FONT,
        fontSize: FONT.big,
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(0.5)
      .setAlpha(0.5)
    this.slotObjs.push(resultTag, plus)

    const nameY = rowY + slotSize / 2 + 52
    this.nameText = this.add
      .text(
        cx,
        nameY,
        recipe ? `${recipe.name} ·「${recipe.method}」` : '从下方选择两个 emoji',
        {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: res,
        },
      )
      .setOrigin(0.5, 0)
    if (recipe) {
      this.descText = this.add
        .text(d.x + 28, nameY + 44, recipe.desc, {
          fontFamily: UI_FONT,
          fontSize: FONT.body,
          color: '#e8e8f2',
          resolution: res,
          wordWrap: { width: d.w - 56, useAdvancedWrap: true },
          lineSpacing: 8,
        })
        .setOrigin(0, 0)
    }

    if (a && b && recipe) {
      const gen = ++this.jobGen
      void this.composeMergeTexture(a, b)
        .then((key) => {
          if (gen !== this.jobGen || !this.previewImg) return
          this.previewImg.setTexture(key).setDisplaySize(previewSize, previewSize).setAlpha(1)
          this.previewState = 'ready'
          this.report()
        })
        .catch((err) => {
          console.error(`emoji 合并失败: ${String(err)}`)
          if (gen === this.jobGen) this.previewState = 'idle'
        })
    }
    this.report()
  }

  private buildSlot(which: 'a' | 'b', cx: number, cy: number, size: number, res: number): void {
    const emoji = which === 'a' ? this.slotA : this.slotB
    const active = this.activeSlot === which
    const bg = this.add.graphics()
    bg.fillStyle(active ? 0xffffff : 0x000000, active ? 0.18 : 0.28)
    bg.fillRoundedRect(cx - size / 2, cy - size / 2, size, size, 18)
    bg.lineStyle(active ? 3 : 1, active ? 0xffd54f : 0xffffff, active ? 1 : 0.14)
    bg.strokeRoundedRect(cx - size / 2, cy - size / 2, size, size, 18)
    this.slotObjs.push(bg)
    if (emoji) {
      this.slotObjs.push(emojiImage(this, cx, cy, emoji, size - 26))
    } else {
      this.slotObjs.push(
        this.add
          .text(cx, cy, '?', {
            fontFamily: UI_FONT,
            fontSize: FONT.big,
            color: '#ffffff',
            resolution: res,
          })
          .setOrigin(0.5)
          .setAlpha(0.3),
      )
    }
    const tag = this.add
      .text(cx, cy + size / 2 + 20, which === 'a' ? '素材 A' : '素材 B', {
        fontFamily: UI_FONT,
        fontSize: FONT.caption,
        color: active ? '#ffd54f' : '#ffffff',
        resolution: res,
      })
      .setOrigin(0.5)
      .setAlpha(active ? 1 : 0.45)
    const zone = this.add
      .zone(cx - size / 2, cy - size / 2, size, size)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (this.grid?.wasDragged || this.activeSlot === which) return
        this.activeSlot = which
        this.grid?.setSelected(which === 'a' ? this.slotA : this.slotB)
        this.buildMergeDetail()
        this.report()
      })
    this.slotObjs.push(tag, zone)
    this.slotRects[which] = { x: cx - size / 2, y: cy - size / 2, w: size, h: size }
  }

  // ── 纹理烘焙 ────────────────────────────────────────────────

  /** 动画配方 → N 帧纹理（已存在的帧直接复用；返回按帧序的纹理 key） */
  private async bakeAnimTextures(recipe: AnimRecipe): Promise<string[]> {
    const svg = await fetchSvgText(recipe.emoji)
    const keys: string[] = []
    for (let k = 0; k < recipe.frames; k++) {
      const key = `studio-anim-${emojiCodepoints(recipe.emoji)}-${k}`
      keys.push(key)
      if (this.textures.exists(key)) continue
      const frame = bakeAnimFrame(svg, recipe, k / recipe.frames)
      const img = await svgToImage(setSvgSize(frame, RASTER))
      if (!this.textures.exists(key)) {
        this.textures.addImage(key, img)
        this.ownedKeys.add(key)
      }
    }
    return keys
  }

  /** 帧循环播放：timer 逐帧 setTexture */
  private playFrames(keys: string[], durMs: number, size: number): void {
    if (!this.previewImg || keys.length === 0) return
    let idx = 0
    this.previewImg.setTexture(keys[0]!).setDisplaySize(size, size)
    this.animTimer?.remove()
    this.animTimer = this.time.addEvent({
      delay: Math.max(30, durMs / keys.length),
      loop: true,
      callback: () => {
        idx = (idx + 1) % keys.length
        this.previewImg?.setTexture(keys[idx]!).setDisplaySize(size, size)
      },
    })
  }

  /** 合并两 emoji → 一张纹理（key 含双方 codepoints，重复合成直接复用） */
  private async composeMergeTexture(a: string, b: string): Promise<string> {
    const key = `studio-merge-${emojiCodepoints(a)}-${emojiCodepoints(b)}`
    if (this.textures.exists(key)) return key
    const recipe = findMergeRecipe(a, b)
    // 配方登记方向可能与槽位相反：素材按配方的 a/b 取
    const [svgA, svgB] = await Promise.all([fetchSvgText(recipe.a), fetchSvgText(recipe.b)])
    const merged = mergeSvg(svgA, svgB, recipe)
    const img = await svgToImage(setSvgSize(merged, RASTER))
    if (!this.textures.exists(key)) {
      this.textures.addImage(key, img)
      this.ownedKeys.add(key)
    }
    return key
  }

  // ── 杂项 ────────────────────────────────────────────────────

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.data.remove('detailFrame')
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
        selected: this.tab === 'anim' ? this.animSelected : ((this.activeSlot === 'a' ? this.slotA : this.slotB) ?? ''),
        slots: { a: this.slotA, b: this.slotB, active: this.activeSlot },
        slotRects: this.slotRects,
        preview: this.previewState,
        back: this.backRect,
      },
    })
  }
}
