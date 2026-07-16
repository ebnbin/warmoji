import Phaser from 'phaser'
import { emojiCodepoints } from '../core/emoji'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { setSvgSize } from '../core/svg'
import { ANIM_RECIPES, ANIM_SPEC, animRecipeOf, bakeAnimFrame } from '../core/studio'
import type { AnimRecipe } from '../core/studio'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { emojiImage, emojiSvgUrl, ensureEmoji, svgToImage } from '../ui/emoji'
import { EmojiGrid } from '../ui/grid'
import { FONT, UI_FONT } from '../ui/fonts'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

// Emoji Studio：twemoji 部件动画的游戏内试验台。
// 配方由 core/studio 定义（部件关键帧 + fx 程序化新 path），此处按统一规格
// 烘焙成 N 帧纹理循环播放——正是未来战斗内落地的同一条管线。
// 内容按保底画布设计、整体居中（同 Wiki 的 content+origin 机制）；
// 所有 studio- 前缀纹理本场景自管理，shutdown 全量清理，不挤占 emoji LRU。
interface StudioLayout {
  content: { w: number; h: number }
  headerY: number
  detail: { x: number; y: number; w: number; h: number }
  list: { x: number; y: number; w: number; h: number }
}

const LANDSCAPE: StudioLayout = {
  content: { w: 1280, h: 720 },
  headerY: 44,
  detail: { x: 40, y: 104, w: 620, h: 584 },
  list: { x: 700, y: 104, w: 540, h: 584 },
}

const PORTRAIT: StudioLayout = {
  content: { w: 720, h: 1280 },
  headerY: 52,
  detail: { x: 24, y: 108, w: 672, h: 530 },
  list: { x: 24, y: 668, w: 672, h: 588 },
}

const RASTER = 256

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
  private selected = ANIM_RECIPES[0]!.emoji

  private layout!: StudioLayout
  private origin = { x: 0, y: 0 }
  private grid?: EmojiGrid
  private previewImg?: Phaser.GameObjects.Image
  private previewState: 'idle' | 'loading' | 'ready' = 'idle'
  private animTimer?: Phaser.Time.TimerEvent
  /** 异步烘焙的竞态令牌：切换选择后旧任务作废 */
  private jobGen = 0
  /** 本场景创建的纹理，shutdown 全量移除 */
  private ownedKeys = new Set<string>()
  /** 详情面板动态内容（切换配方时整组销毁重建） */
  private detailObjs: Phaser.GameObjects.GameObject[] = []
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
    if (!preserved) this.selected = ANIM_RECIPES[0]!.emoji
    this.previewState = 'idle'
    this.detailObjs = []
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
      .text(Math.max(ox + 40, safeInsets.left + 24), oy + L.headerY, '← 返回', {
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

    this.grid = new EmojiGrid(this, G, { cellSize: 96 })
    this.grid.onTap = (key) => {
      if (key === this.selected) return
      this.selected = key
      this.grid?.setSelected(key)
      this.buildDetail()
      this.report()
    }
    this.grid.onScroll = () => this.report()

    // 配方 emoji 可能不在预载集：先 ensure 再填充网格
    void Promise.all(
      ANIM_RECIPES.map((r) => ensureEmoji(this, r.emoji).catch(() => '')),
    ).then(() => {
      if (!this.scene.isActive('studio')) return
      this.grid?.setItems(ANIM_RECIPES.map((r) => ({ key: r.emoji, emoji: r.emoji })))
      this.grid?.setSelected(this.selected)
      this.buildDetail()
      this.report()
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

  /** 详情面板：上图下文，全部居中 */
  private buildDetail(): void {
    this.animTimer?.remove()
    this.animTimer = undefined
    this.jobGen++
    for (const o of this.detailObjs) o.destroy()
    this.detailObjs = []
    this.previewImg = undefined
    const d = this.detailRect()
    const res = textRes()
    const recipe = animRecipeOf(this.selected)
    if (!recipe) return
    const portrait = this.layout === PORTRAIT
    const previewSize = portrait ? 220 : 260
    const cx = d.x + d.w / 2

    let y = d.y + (portrait ? 24 : 34)
    this.previewImg = emojiImage(this, cx, y + previewSize / 2, recipe.emoji, previewSize)
    this.detailObjs.push(this.previewImg)
    y += previewSize + 12
    const frameInfo = this.add
      .text(cx, y, `统一规格：${ANIM_SPEC.frames} 帧 · ${(ANIM_SPEC.durMs / 1000).toFixed(0)} 秒循环`, {
        fontFamily: UI_FONT,
        fontSize: FONT.caption,
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(0.5, 0)
      .setAlpha(0.45)
    y += 36
    const name = this.add
      .text(cx, y, `${recipe.emoji} ${recipe.name}`, {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5, 0)
    y += 54
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
    y += desc.height + 18
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

    this.previewState = 'loading'
    const gen = ++this.jobGen
    void this.bakeAnimTextures(recipe)
      .then((keys) => {
        if (gen !== this.jobGen || !this.previewImg) return
        this.previewState = 'ready'
        this.playFrames(keys, previewSize)
        this.report()
      })
      .catch((err) => {
        console.error(`动画烘焙失败: ${String(err)}`)
        if (gen === this.jobGen) this.previewState = 'idle'
      })
    this.report()
  }

  /** 动画配方 → 统一规格 N 帧纹理（已存在的帧直接复用；返回按帧序的纹理 key） */
  private async bakeAnimTextures(recipe: AnimRecipe): Promise<string[]> {
    const svg = await fetchSvgText(recipe.emoji)
    const keys: string[] = []
    for (let k = 0; k < ANIM_SPEC.frames; k++) {
      const key = `studio-anim-${emojiCodepoints(recipe.emoji)}-${k}`
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

  /** 帧循环播放：timer 逐帧 setTexture */
  private playFrames(keys: string[], size: number): void {
    if (!this.previewImg || keys.length === 0) return
    let idx = 0
    this.previewImg.setTexture(keys[0]!).setDisplaySize(size, size)
    this.animTimer?.remove()
    this.animTimer = this.time.addEvent({
      delay: Math.max(30, ANIM_SPEC.durMs / keys.length),
      loop: true,
      callback: () => {
        idx = (idx + 1) % keys.length
        this.previewImg?.setTexture(keys[idx]!).setDisplaySize(size, size)
      },
    })
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
        items: this.grid?.cellRects() ?? [],
        selected: this.selected,
        preview: this.previewState,
        back: this.backRect,
      },
    })
  }
}
