import type Phaser from 'phaser'
import { OUTLINE, outlineSvg, setSvgSize } from '../../emoji/svg'
import type { OutlineKind } from '../../emoji/svg'
import { emojiSvgText, svgToImage } from '../../emoji/textures'
import { animClipOf, bakeAnimFrame } from '../../emoji/studio'

// ECS 自绘渲染的 emoji 图集(atlas):把所有实体会用到的 emoji×描边变体一次性光栅化,
// 网格打包进若干 POT 页纹理,记录每个变体的 UV。渲染时全场实体共享这几张页纹理,
// MultiPipeline 多纹理批处理(≤16 页可一次 flush),从而 entity 数与 draw call 解绑。
// 光栅化完全复用旧的 emoji SVG 管线(emojiSvgText→outlineSvg→setSvgSize→svgToImage),
// 保证每个 glyph 与旧路径逐像素一致。

const CELL = 256 // 单格像素(与旧 RASTER 一致,保证清晰度)
const PAGE = 2048 // 页边长(POT)
const COLS = PAGE / CELL // 每行格数 = 8
const PER_PAGE = COLS * COLS // 每页格数 = 64
// 帧位上限:静态变体 + 惰性烘焙的动画帧(按需增页,一局只烘真正登场的那几种)
const MAX_FRAMES = 2048

function variantKey(id: string, outline: OutlineKind): string {
  return `${id}|${outline}`
}

function clipKey(id: string, outline: OutlineKind, clipId: string): string {
  return `${id}|${outline}|${clipId}`
}

const NO_CLIP = { base: -1, frames: 0 }

export class EcsAtlas {
  /** frame*4 → u0,v0,u1,v1 */
  private readonly uv: Float32Array
  /** frame → 页索引 */
  private readonly pageOf: Int32Array
  private readonly keyToFrame = new Map<string, number>()
  private readonly pages: Phaser.Textures.CanvasTexture[] = []
  private readonly canvases: HTMLCanvasElement[] = []
  private readonly ctxs: CanvasRenderingContext2D[] = []
  /** 下一个空闲格位(静态变体铺完后即动画帧的起点) */
  private cursor = 0
  private scene?: Phaser.Scene
  /** clip → 帧基址与帧数;帧数 0 表示该 emoji 无此 clip(问过一次就不再问) */
  private readonly clips = new Map<string, { base: number; frames: number }>()
  /** 正在烘焙中的 clip(去重) */
  private readonly baking = new Set<string>()

  private constructor() {
    this.uv = new Float32Array(MAX_FRAMES * 4)
    this.pageOf = new Int32Array(MAX_FRAMES)
  }

  /** 取一个空闲格位,必要时开新页 */
  private alloc(): number {
    const frame = this.cursor++
    const page = Math.floor(frame / PER_PAGE)
    while (this.canvases.length <= page) this.addPage()
    return frame
  }

  private addPage(): void {
    const cv = document.createElement('canvas')
    cv.width = PAGE
    cv.height = PAGE
    this.canvases.push(cv)
    this.ctxs.push(cv.getContext('2d')!)
    const scene = this.scene
    if (!scene) return // build 期先建画布,末尾统一登记纹理
    const key = `ecs-atlas-${this.pages.length}`
    if (scene.textures.exists(key)) scene.textures.remove(key)
    this.pages.push(scene.textures.addCanvas(key, cv)!)
  }

  /** 把一张光栅图落进某格并记 UV(V 轴按 GL 朝向,原点在下) */
  private place(frame: number, img: HTMLImageElement | HTMLCanvasElement): void {
    const page = Math.floor(frame / PER_PAGE)
    const local = frame % PER_PAGE
    const px = (local % COLS) * CELL
    const py = Math.floor(local / COLS) * CELL
    this.ctxs[page]!.drawImage(img, px, py, CELL, CELL)
    const b = frame * 4
    this.uv[b] = px / PAGE
    this.uv[b + 1] = 1 - py / PAGE
    this.uv[b + 2] = (px + CELL) / PAGE
    this.uv[b + 3] = 1 - (py + CELL) / PAGE
    this.pageOf[frame] = page
  }

  /** 某 emoji 某 clip 的帧基址与帧数(整套帧连续排布)。
   * 首次询问即在后台烘焙,未就绪返回 frames=0——调用方保持静态帧,烘好后再问即接上
   *(渐进增强,与旧 clipFramesLive 同策略) */
  clip(id: string, outline: OutlineKind, clipId: string): { base: number; frames: number } {
    const key = clipKey(id, outline, clipId)
    const hit = this.clips.get(key)
    if (hit) return hit
    if (!this.baking.has(key)) {
      this.baking.add(key)
      void this.bakeClip(id, outline, clipId, key)
    }
    return NO_CLIP
  }

  /** 惰性烘焙:整套帧连续落格(必要时增页),完成后刷新受影响的页纹理 */
  private async bakeClip(id: string, outline: OutlineKind, clipId: string, key: string): Promise<void> {
    const clip = animClipOf(id, clipId)
    const scene = this.scene
    if (!clip || !scene) {
      this.clips.set(key, NO_CLIP)
      return
    }
    const raw = await emojiSvgText(id)
    const recipe = { ...clip, viewBox: undefined }
    const imgs = await Promise.all(
      Array.from({ length: clip.frames }, (_, i) => {
        const svg = outlineSvg(bakeAnimFrame(raw, recipe, i / clip.frames), OUTLINE.radius, OUTLINE.colors[outline])
        return svgToImage(setSvgSize(svg, CELL))
      }),
    )
    // 光栅化是异步的:场景可能已切换,此时静默丢弃
    if (!scene.textures) return
    const base = this.cursor
    const touched = new Set<number>()
    for (const img of imgs) {
      const frame = this.alloc()
      this.place(frame, img)
      touched.add(Math.floor(frame / PER_PAGE))
    }
    for (const p of touched) this.pages[p]?.refresh()
    this.clips.set(key, { base, frames: clip.frames })
  }

  /** 变体索引(id + 描边阵营)→ frame;未收录返回 -1 */
  index(id: string, outline: OutlineKind): number {
    return this.keyToFrame.get(variantKey(id, outline)) ?? -1
  }

  /** frame → UV(写入 out[0..3] = u0,v0,u1,v1) */
  uvInto(frame: number, out: Float32Array): void {
    const b = frame * 4
    out[0] = this.uv[b]!
    out[1] = this.uv[b + 1]!
    out[2] = this.uv[b + 2]!
    out[3] = this.uv[b + 3]!
  }

  /** frame 所在页 */
  page(frame: number): number {
    return this.pageOf[frame]!
  }

  /** 页的 GL 纹理句柄(供 MultiPipeline.batchQuad 绑定) */
  pageGlTexture(page: number): Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper {
    return this.pages[page]!.get().source.glTexture!
  }

  get pageCount(): number {
    return this.pages.length
  }

  /** 从「阵营→emoji 列表」清单构建图集(复用旧 emoji 光栅化,逐 glyph 一致) */
  static async build(
    scene: Phaser.Scene,
    outlined: Record<OutlineKind, readonly string[]>,
  ): Promise<EcsAtlas> {
    // 收集去重后的全部变体(id,outline)
    const variants: { id: string; outline: OutlineKind }[] = []
    const seen = new Set<string>()
    for (const outline of Object.keys(outlined) as OutlineKind[]) {
      for (const id of outlined[outline]) {
        const k = variantKey(id, outline)
        if (seen.has(k)) continue
        seen.add(k)
        variants.push({ id, outline })
      }
    }

    const atlas = new EcsAtlas()
    // 并行光栅化,顺序落格
    const imgs = await Promise.all(
      variants.map(async ({ id, outline }) => {
        const raw = await emojiSvgText(id)
        const svg = outlineSvg(raw, OUTLINE.radius, OUTLINE.colors[outline])
        return svgToImage(setSvgSize(svg, CELL))
      }),
    )
    for (let i = 0; i < variants.length; i++) {
      const { id, outline } = variants[i]!
      const frame = atlas.alloc()
      atlas.place(frame, imgs[i]!)
      atlas.keyToFrame.set(variantKey(id, outline), frame)
    }
    // 页纹理统一登记(此后 scene 就位,增页即时登记)
    atlas.scene = scene
    for (let p = 0; p < atlas.canvases.length; p++) {
      const key = `ecs-atlas-${p}`
      if (scene.textures.exists(key)) scene.textures.remove(key)
      atlas.pages.push(scene.textures.addCanvas(key, atlas.canvases[p]!)!)
    }
    return atlas
  }
}
