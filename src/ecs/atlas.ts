import type Phaser from 'phaser'
import { OUTLINE, outlineSvg, setSvgSize } from '../emoji/svg'
import type { OutlineKind } from '../emoji/svg'
import { emojiSvgText, svgToImage } from '../emoji/textures'
import { animClipOf, bakeAnimFrame } from '../emoji/anim'

// 光栅化复用 emoji SVG 管线，与非图集路径逐像素一致；页数 ≤ 16 才能一次 flush

const CELL = 256 // 单格像素
const PAGE = 2048 // 页边长，须为 POT
const COLS = PAGE / CELL
const PER_PAGE = COLS * COLS
// 帧位上限：静态变体 + 惰性烘焙的动画帧
const MAX_FRAMES = 2048

/** outline undefined = 不描边 */
function variantKey(id: string, outline: OutlineKind | undefined): string {
  return `${id}|${outline ?? ''}`
}

function clipKey(id: string, outline: OutlineKind | undefined, clipId: string): string {
  return `${id}|${outline ?? ''}|${clipId}`
}

function rasterize(raw: string, outline: OutlineKind | undefined): Promise<HTMLImageElement> {
  const svg = outline ? outlineSvg(raw, OUTLINE.radius, OUTLINE.colors[outline]) : raw
  return svgToImage(setSvgSize(svg, CELL))
}

const NO_CLIP = { base: -1, frames: 0 }

/** 页纹理键按实例唯一 */
let atlasSerial = 0
/** 跨局复用 */
let shared: EcsAtlas | undefined
/** 首建进行中；期间再来的调用等它，不另建一份 */
let building: Promise<EcsAtlas> | undefined

export class EcsAtlas {
  /** frame*4 → u0,v0,u1,v1 */
  private readonly uv: Float32Array
  /** frame → 页索引 */
  private readonly pageOf: Int32Array
  private readonly keyToFrame = new Map<string, number>()
  private readonly pages: Phaser.Textures.CanvasTexture[] = []
  private readonly canvases: HTMLCanvasElement[] = []
  private readonly ctxs: CanvasRenderingContext2D[] = []
  /** 下一个空闲格位 */
  private cursor = 0
  private scene?: Phaser.Scene
  private readonly serial = atlasSerial++
  /** 场景已关闭，在途烘焙作废 */
  private disposed = false

  /** 场景关闭时调用；图集本体与 clip 缓存跨局保留 */
  dispose(): void {
    this.disposed = true
  }

  /** 新一局接手 */
  private rebind(scene: Phaser.Scene): void {
    this.scene = scene
    this.disposed = false
  }
  /** 帧数 0 = 无此 clip */
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
    const key = `ecs-atlas-${this.serial}-${this.pages.length}`
    if (scene.textures.exists(key)) scene.textures.remove(key)
    this.pages.push(scene.textures.addCanvas(key, cv)!)
  }

  /** V 轴按 GL 朝向，原点在下 */
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

  /** 首次询问即后台烘焙；未就绪返回 frames = 0，调用方保持静态帧 */
  clip(id: string, outline: OutlineKind | undefined, clipId: string): { base: number; frames: number } {
    const key = clipKey(id, outline, clipId)
    const hit = this.clips.get(key)
    if (hit) return hit
    if (!this.baking.has(key)) {
      this.baking.add(key)
      void this.bakeClip(id, outline, clipId, key)
        .catch(() => {
          // 失败记为无此 clip，不再重试
          this.clips.set(key, NO_CLIP)
        })
        .finally(() => this.baking.delete(key))
    }
    return NO_CLIP
  }

  private hasRoom(n: number): boolean {
    return this.cursor + n <= MAX_FRAMES
  }

  /** 整套帧连续落格 */
  private async bakeClip(id: string, outline: OutlineKind | undefined, clipId: string, key: string): Promise<void> {
    const clip = animClipOf(id, clipId)
    const scene = this.scene
    // 场景已关闭则不记结果，下一局再问时重烘
    if (!scene || this.disposed) return
    if (!clip || !this.hasRoom(clip.frames)) {
      this.clips.set(key, NO_CLIP)
      return
    }
    const raw = await emojiSvgText(id)
    const recipe = { ...clip, viewBox: undefined }
    const imgs = await Promise.all(
      Array.from({ length: clip.frames }, (_, i) => rasterize(bakeAnimFrame(raw, recipe, i / clip.frames), outline)),
    )
    if (this.disposed || !scene.textures) return
    if (!this.hasRoom(imgs.length)) {
      this.clips.set(key, NO_CLIP)
      return
    }
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

  /** 未收录返回 -1 */
  index(id: string, outline: OutlineKind | undefined): number {
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

  page(frame: number): number {
    return this.pageOf[frame]!
  }

  pageGlTexture(page: number): Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper {
    return this.pages[page]!.get().source.glTexture!
  }

  get pageCount(): number {
    return this.pages.length
  }

  /** 一个进程只建一次，跨局复用；交出前绑到本次调用的场景 */
  static async build(
    scene: Phaser.Scene,
    outlined: Record<OutlineKind, readonly string[]>,
    plain: readonly string[],
  ): Promise<EcsAtlas> {
    if (!shared) {
      // 失败即清掉，下次重建
      building ??= EcsAtlas.create(scene, outlined, plain)
        .then((a) => (shared = a))
        .finally(() => {
          building = undefined
        })
      await building
    }
    const atlas = shared!
    atlas.rebind(scene)
    return atlas
  }

  private static async create(
    scene: Phaser.Scene,
    outlined: Record<OutlineKind, readonly string[]>,
    plain: readonly string[],
  ): Promise<EcsAtlas> {
    const variants: { id: string; outline: OutlineKind | undefined }[] = []
    const seen = new Set<string>()
    const take = (id: string, outline: OutlineKind | undefined): void => {
      const k = variantKey(id, outline)
      if (seen.has(k)) return
      seen.add(k)
      variants.push({ id, outline })
    }
    for (const outline of Object.keys(outlined) as OutlineKind[]) {
      for (const id of outlined[outline]) take(id, outline)
    }
    for (const id of plain) take(id, undefined)

    const atlas = new EcsAtlas()
    // 单个变体失败不拦开战：只记错误，该变体不入表
    const imgs = await Promise.all(
      variants.map(async ({ id, outline }) => {
        try {
          return await rasterize(await emojiSvgText(id), outline)
        } catch (e) {
          console.error(`图集变体光栅化失败：${variantKey(id, outline)}`, e)
          return undefined
        }
      }),
    )
    for (let i = 0; i < variants.length; i++) {
      const img = imgs[i]
      if (!img) continue
      const { id, outline } = variants[i]!
      const frame = atlas.alloc()
      atlas.place(frame, img)
      atlas.keyToFrame.set(variantKey(id, outline), frame)
    }
    atlas.scene = scene
    for (let p = 0; p < atlas.canvases.length; p++) {
      const key = `ecs-atlas-${atlas.serial}-${p}`
      if (scene.textures.exists(key)) scene.textures.remove(key)
      atlas.pages.push(scene.textures.addCanvas(key, atlas.canvases[p]!)!)
    }
    return atlas
  }
}
