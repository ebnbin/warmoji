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
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

// Emoji Studio：twemoji 源码级改造的游戏内试验台。
// 「动画」tab = 部件动画配方预览（core/studio 烘焙 N 帧 → N 张纹理循环播放，
// 正是未来游戏内落地的同一条管线）；「合并」tab = 横排公式 [A]+[B]=[结果]，
// 从素材库点选依次填入 A/B（🅰️🅱️ 角标标注原料，金框呼吸 = 下一次点选填入的槽）。
// 内容按保底画布设计、整体居中（同 Wiki 的 content+origin 机制）；
// 所有 studio- 前缀纹理本场景自管理，shutdown 全量清理，不挤占 emoji LRU。
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
  tabsY: 102,
  detail: { x: 40, y: 140, w: 620, h: 548 },
  list: { x: 700, y: 140, w: 540, h: 548 },
}

const PORTRAIT: StudioLayout = {
  content: { w: 720, h: 1280 },
  headerY: 52,
  tabsY: 116,
  detail: { x: 24, y: 164, w: 672, h: 500 },
  list: { x: 24, y: 694, w: 672, h: 562 },
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
  private origin = { x: 0, y: 0 }
  private grid?: EmojiGrid
  private previewImg?: Phaser.GameObjects.Image
  private previewState: 'idle' | 'loading' | 'ready' = 'idle'
  private animTimer?: Phaser.Time.TimerEvent
  /** 异步烘焙/合成的竞态令牌：切换选择后旧任务作废 */
  private jobGen = 0
  /** 本场景创建的纹理，shutdown 全量移除 */
  private ownedKeys = new Set<string>()

  /** 详情面板动态内容（切换配方/槽位时整组销毁重建） */
  private detailObjs: Phaser.GameObjects.GameObject[] = []
  private slotPulse?: Phaser.Tweens.Tween
  private tabObjs: Phaser.GameObjects.GameObject[] = []
  private tabRects: { id: Tab; x: number; y: number; w: number; h: number }[] = []
  private slotRects = {
    a: { x: 0, y: 0, w: 0, h: 0 },
    b: { x: 0, y: 0, w: 0, h: 0 },
  }
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
      this.tab = 'anim'
      this.animSelected = ANIM_RECIPES[0]!.emoji
      this.slotA = '🧟'
      this.slotB = '🤠'
      this.activeSlot = 'a'
    }
    this.previewState = 'idle'
    this.detailObjs = []
    this.tabObjs = []
    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const L = (this.layout = h > w ? PORTRAIT : LANDSCAPE)
    // 内容按保底画布设计，视口更大时整体居中
    this.origin = { x: (w - L.content.w) / 2, y: (h - L.content.h) / 2 }
    const ox = this.origin.x
    const oy = this.origin.y
    const res = textRes()

    // 顶栏：返回 + 标题
    const backText = this.add
      .text(ox + 40, oy + L.headerY, '← 返回', {
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
      .text(w / 2, oy + L.headerY, '🧪 Emoji Studio', {
        fontFamily: UI_FONT,
        fontSize: FONT.title,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)

    // 面板底框（静态，一次绘制）
    const frames = this.add.graphics()
    frames.fillStyle(0x000000, 0.18)
    const D = this.detailRect()
    const G = this.listRect()
    frames.fillRoundedRect(D.x - 8, D.y - 8, D.w + 16, D.h + 16, 14)
    frames.fillRoundedRect(G.x - 8, G.y - 8, G.w + 16, G.h + 16, 14)

    this.buildTabs(res)
    this.grid = new EmojiGrid(this, G, { cellSize: 96 })
    this.grid.onTap = (key) => this.onGridTap(key)
    this.grid.onScroll = () => this.report()

    // 候选 emoji 可能不在预载集：先 ensure 再填充网格（🅰️🅱️ 为素材角标，❓ 为空槽占位）
    const need = new Set<string>([
      ...MERGE_POOL,
      ...ANIM_RECIPES.map((r) => r.emoji),
      '🅰️',
      '🅱️',
      '❓',
    ])
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

  /** detail/list 面板的绝对矩形（布局坐标 + 居中偏移） */
  private detailRect(): { x: number; y: number; w: number; h: number } {
    const d = this.layout.detail
    return { x: this.origin.x + d.x, y: this.origin.y + d.y, w: d.w, h: d.h }
  }

  private listRect(): { x: number; y: number; w: number; h: number } {
    const l = this.layout.list
    return { x: this.origin.x + l.x, y: this.origin.y + l.y, w: l.w, h: l.h }
  }

  // ── tab 与网格 ──────────────────────────────────────────────

  private buildTabs(res: number): void {
    const defs: { id: Tab; label: string }[] = [
      { id: 'anim', label: '🎬 部件动画' },
      { id: 'merge', label: '🧬 emoji 合并' },
    ]
    for (const o of this.tabObjs) o.destroy()
    this.tabObjs = []
    this.tabRects = []
    const cx = this.origin.x + this.layout.content.w / 2
    const y = this.origin.y + this.layout.tabsY
    const chipW = 250
    const chipH = 56
    const gap = 24
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
          this.buildTabs(textRes())
          this.applyTab()
        })
      this.tabRects.push({ id: d.id, x, y: y - chipH / 2, w: chipW, h: chipH })
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
      this.refreshMergeGrid()
      this.buildMergeDetail()
    }
    this.report()
  }

  /** 合并素材库：🅰️🅱️ 角标标注两份原料，不用选中白框（避免高亮乱跳） */
  private refreshMergeGrid(): void {
    this.grid?.setItems(
      MERGE_POOL.map((e) => ({
        key: e,
        emoji: e,
        badge: e === this.slotA ? '🅰️' : e === this.slotB ? '🅱️' : undefined,
      })),
    )
    this.grid?.setSelected(null)
  }

  private onGridTap(key: string): void {
    if (this.tab === 'anim') {
      if (key === this.animSelected) return
      this.animSelected = key
      this.grid?.setSelected(key)
      this.buildAnimDetail()
    } else {
      // 填入呼吸金框所指的槽位，然后轮到另一个槽
      if (this.activeSlot === 'a') {
        this.slotA = key
        this.activeSlot = 'b'
      } else {
        this.slotB = key
        this.activeSlot = 'a'
      }
      this.refreshMergeGrid()
      this.buildMergeDetail()
    }
    this.report()
  }

  // ── 详情面板 ────────────────────────────────────────────────

  /** 清空详情面板动态内容（面板底框保留） */
  private resetDetail(): { d: { x: number; y: number; w: number; h: number }; res: number } {
    this.animTimer?.remove()
    this.animTimer = undefined
    this.jobGen++
    this.slotPulse?.remove()
    this.slotPulse = undefined
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    this.previewImg = undefined
    return { d: this.detailRect(), res: textRes() }
  }

  /** 动画详情：上图下文，全部居中 */
  private buildAnimDetail(): void {
    const { d, res } = this.resetDetail()
    const recipe = animRecipeOf(this.animSelected)
    if (!recipe) return
    const portrait = this.layout === PORTRAIT
    const previewSize = portrait ? 200 : 240
    const cx = d.x + d.w / 2

    let y = d.y + (portrait ? 20 : 30)
    this.previewImg = emojiImage(this, cx, y + previewSize / 2, recipe.emoji, previewSize)
    this.detailObjs.push(this.previewImg)
    y += previewSize + 10
    const frameInfo = this.add
      .text(cx, y, `${recipe.frames} 帧 · ${(recipe.durMs / 1000).toFixed(1)} 秒循环`, {
        fontFamily: UI_FONT,
        fontSize: FONT.caption,
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(0.5, 0)
      .setAlpha(0.45)
    y += 34
    const name = this.add
      .text(cx, y, `${recipe.emoji} ${recipe.name}`, {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5, 0)
    y += 52
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
    y += desc.height + 16
    const anatomy = this.add
      .text(cx, y, `🔬 部件拆解：${recipe.anatomy}`, {
        fontFamily: UI_FONT,
        fontSize: FONT.small,
        color: '#aab6cc',
        resolution: res,
        align: 'center',
        wordWrap: { width: d.w - 72, useAdvancedWrap: true },
        lineSpacing: 6,
      })
      .setOrigin(0.5, 0)
    this.detailObjs.push(frameInfo, name, desc, anatomy)
    // 底部提示只在剩余空间够时显示，避免与拆解文字打架
    if (y + anatomy.height + 44 < d.y + d.h - 16) {
      const hint = this.add
        .text(cx, d.y + d.h - 16, '更多动画配方陆续添加，落地后角色与敌人将在战场上活起来', {
          fontFamily: UI_FONT,
          fontSize: FONT.caption,
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0.5, 1)
        .setAlpha(0.3)
      this.detailObjs.push(hint)
    }

    this.previewState = 'loading'
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

  /** 合并详情：横排公式 [A] + [B] = [结果]，名称与描述居中在下 */
  private buildMergeDetail(): void {
    const { d, res } = this.resetDetail()
    const a = this.slotA
    const b = this.slotB
    const recipe = a && b ? findMergeRecipe(a, b) : null
    const portrait = this.layout === PORTRAIT
    const cx = d.x + d.w / 2

    // 公式行：槽 96、结果 168/188，行内各元素以 rowY 垂直居中
    const slotSize = 96
    const resultSize = portrait ? 168 : 188
    const opW = 44
    const gap = portrait ? 18 : 26
    const totalW = slotSize * 2 + opW * 2 + resultSize + gap * 4
    const rowY = d.y + (portrait ? 30 : 50) + resultSize / 2
    let x = cx - totalW / 2

    this.buildSlot('a', x + slotSize / 2, rowY, slotSize, res)
    x += slotSize + gap
    const plus = this.add
      .text(x + opW / 2, rowY, '＋', {
        fontFamily: UI_FONT,
        fontSize: FONT.big,
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(0.5)
      .setAlpha(0.55)
    x += opW + gap
    this.buildSlot('b', x + slotSize / 2, rowY, slotSize, res)
    x += slotSize + gap
    const eq = this.add
      .text(x + opW / 2, rowY, '＝', {
        fontFamily: UI_FONT,
        fontSize: FONT.big,
        color: '#ffd54f',
        resolution: res,
      })
      .setOrigin(0.5)
      .setAlpha(0.85)
    x += opW + gap

    // 结果框 + 预览（合成完成前半透明占位）
    const resultCx = x + resultSize / 2
    const resultBg = this.add.graphics()
    resultBg.fillStyle(0xffd54f, 0.1)
    resultBg.fillRoundedRect(resultCx - resultSize / 2, rowY - resultSize / 2, resultSize, resultSize, 20)
    resultBg.lineStyle(2, 0xffd54f, 0.55)
    resultBg.strokeRoundedRect(resultCx - resultSize / 2, rowY - resultSize / 2, resultSize, resultSize, 20)
    this.previewImg = emojiImage(this, resultCx, rowY, a ?? '❓', resultSize - 24).setAlpha(a && b ? 0.3 : 0.6)
    const resultTag = this.add
      .text(resultCx, rowY + resultSize / 2 + 12, '合并结果', {
        fontFamily: UI_FONT,
        fontSize: FONT.caption,
        color: '#ffd54f',
        resolution: res,
      })
      .setOrigin(0.5, 0)
      .setAlpha(0.85)
    this.detailObjs.push(plus, eq, resultBg, this.previewImg, resultTag)

    // 名称 + 手法 + 描述（居中）
    let y = rowY + resultSize / 2 + 52
    const name = this.add
      .text(cx, y, recipe ? `${recipe.name} ·「${recipe.method}」` : '从素材库点选两个 emoji', {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5, 0)
    this.detailObjs.push(name)
    y += 52
    let contentBottom = y
    if (recipe) {
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
      this.detailObjs.push(desc)
      contentBottom = y + desc.height
    }
    if (contentBottom + 44 < d.y + d.h - 16) {
      const hint = this.add
        .text(cx, d.y + d.h - 16, '从素材库点选，填入正在呼吸的金框槽位', {
          fontFamily: UI_FONT,
          fontSize: FONT.caption,
          color: '#ffffff',
          resolution: res,
        })
        .setOrigin(0.5, 1)
        .setAlpha(0.3)
      this.detailObjs.push(hint)
    }

    this.previewState = a && b ? 'loading' : 'idle'
    if (a && b && recipe) {
      const gen = ++this.jobGen
      void this.composeMergeTexture(a, b)
        .then((key) => {
          if (gen !== this.jobGen || !this.previewImg) return
          this.previewImg
            .setTexture(key)
            .setDisplaySize(resultSize - 24, resultSize - 24)
            .setAlpha(1)
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

  /** A/B 素材槽：活跃槽金框呼吸提示「下一次点选填这里」，点击可切换 */
  private buildSlot(which: 'a' | 'b', cx: number, cy: number, size: number, res: number): void {
    const emoji = which === 'a' ? this.slotA : this.slotB
    const active = this.activeSlot === which
    const bg = this.add.graphics()
    bg.fillStyle(0x000000, 0.28)
    bg.fillRoundedRect(cx - size / 2, cy - size / 2, size, size, 18)
    bg.lineStyle(3, active ? 0xffd54f : 0xffffff, active ? 1 : 0.16)
    bg.strokeRoundedRect(cx - size / 2, cy - size / 2, size, size, 18)
    this.detailObjs.push(bg)
    if (active) {
      this.slotPulse = this.tweens.add({
        targets: bg,
        alpha: 0.45,
        duration: 620,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }
    if (emoji) this.detailObjs.push(emojiImage(this, cx, cy, emoji, size - 22))
    const tag = this.add
      .text(cx, cy + size / 2 + 12, which === 'a' ? '素材 A' : '素材 B', {
        fontFamily: UI_FONT,
        fontSize: FONT.caption,
        color: active ? '#ffd54f' : '#ffffff',
        resolution: res,
      })
      .setOrigin(0.5, 0)
      .setAlpha(active ? 1 : 0.5)
    const zone = this.add
      .zone(cx - size / 2, cy - size / 2, size, size)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (this.grid?.wasDragged || this.activeSlot === which) return
        this.activeSlot = which
        this.buildMergeDetail()
        this.report()
      })
    this.detailObjs.push(tag, zone)
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
          this.tab === 'anim'
            ? this.animSelected
            : ((this.activeSlot === 'a' ? this.slotA : this.slotB) ?? ''),
        slots: { a: this.slotA, b: this.slotB, active: this.activeSlot },
        slotRects: this.slotRects,
        preview: this.previewState,
        back: this.backRect,
      },
    })
  }
}
