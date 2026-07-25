import type Phaser from 'phaser'
import { OUTLINE, outlineSvg, setSvgSize } from '../../emoji/svg'
import type { OutlineKind } from '../../emoji/svg'
import { emojiSvgText, svgToImage } from '../../emoji/textures'

// ECS 自绘渲染的 emoji 图集(atlas):把所有实体会用到的 emoji×描边变体一次性光栅化,
// 网格打包进若干 POT 页纹理,记录每个变体的 UV。渲染时全场实体共享这几张页纹理,
// MultiPipeline 多纹理批处理(≤16 页可一次 flush),从而 entity 数与 draw call 解绑。
// 光栅化完全复用旧的 emoji SVG 管线(emojiSvgText→outlineSvg→setSvgSize→svgToImage),
// 保证每个 glyph 与旧路径逐像素一致。

const CELL = 256 // 单格像素(与旧 RASTER 一致,保证清晰度)
const PAGE = 2048 // 页边长(POT)
const COLS = PAGE / CELL // 每行格数 = 8
const PER_PAGE = COLS * COLS // 每页格数 = 64

function variantKey(id: string, outline: OutlineKind): string {
  return `${id}|${outline}`
}

export class EcsAtlas {
  /** frame*4 → u0,v0,u1,v1 */
  private readonly uv: Float32Array
  /** frame → 页索引 */
  private readonly pageOf: Int32Array
  private readonly keyToFrame = new Map<string, number>()
  private readonly pages: Phaser.Textures.CanvasTexture[] = []

  private constructor(count: number) {
    this.uv = new Float32Array(count * 4)
    this.pageOf = new Int32Array(count)
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

    const atlas = new EcsAtlas(variants.length)
    const pageCount = Math.max(1, Math.ceil(variants.length / PER_PAGE))
    const canvases: HTMLCanvasElement[] = []
    const ctxs: CanvasRenderingContext2D[] = []
    for (let p = 0; p < pageCount; p++) {
      const cv = document.createElement('canvas')
      cv.width = PAGE
      cv.height = PAGE
      canvases.push(cv)
      ctxs.push(cv.getContext('2d')!)
    }

    // 并行光栅化,顺序落格
    const imgs = await Promise.all(
      variants.map(async ({ id, outline }) => {
        const raw = await emojiSvgText(id)
        const svg = outlineSvg(raw, OUTLINE.radius, OUTLINE.colors[outline])
        return svgToImage(setSvgSize(svg, CELL))
      }),
    )

    for (let frame = 0; frame < variants.length; frame++) {
      const { id, outline } = variants[frame]!
      const page = Math.floor(frame / PER_PAGE)
      const local = frame % PER_PAGE
      const col = local % COLS
      const row = Math.floor(local / COLS)
      const px = col * CELL
      const py = row * CELL
      ctxs[page]!.drawImage(imgs[frame]!, px, py, CELL, CELL)
      const b = frame * 4
      // V 轴按 GL 朝向（原点在下）：Phaser 4 起 TextureSource 的 flipY 默认为 true，
      // canvas 页是自下而上上传的，沿用 v3 的左上原点算法会让整页图集上下镜像
      atlas.uv[b] = px / PAGE
      atlas.uv[b + 1] = 1 - py / PAGE
      atlas.uv[b + 2] = (px + CELL) / PAGE
      atlas.uv[b + 3] = 1 - (py + CELL) / PAGE
      atlas.pageOf[frame] = page
      atlas.keyToFrame.set(variantKey(id, outline), frame)
    }

    for (let p = 0; p < pageCount; p++) {
      const key = `ecs-atlas-${p}`
      if (scene.textures.exists(key)) scene.textures.remove(key)
      atlas.pages.push(scene.textures.addCanvas(key, canvases[p]!)!)
    }
    return atlas
  }
}
