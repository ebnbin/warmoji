import type Phaser from 'phaser'
import { OUTLINE, outlineSvg, setSvgSize } from '../emoji/svg'
import type { OutlineKind } from '../emoji/svg'
import { keysOf } from '../util/record'
import { emojiSvgText, svgToImage } from '../emoji/textures'
import { animClipOf, bakeAnimFrame } from '../emoji/anim'
import type { AnimClipId } from '../types/anim'
import type { BattleSprites } from '../manifest'

const CELL = 256
const PAGE = 2048
const COLS = PAGE / CELL
const PER_PAGE = COLS * COLS
const MAX_FRAMES = 2048

type VariantKey = `${string}|${OutlineKind | ''}`

type ClipKey = `${VariantKey}|${AnimClipId}`

function variantKey(id: string, outline: OutlineKind | undefined): VariantKey {
  return `${id}|${outline ?? ''}`
}

function clipKey(id: string, outline: OutlineKind | undefined, clipId: AnimClipId): ClipKey {
  return `${variantKey(id, outline)}|${clipId}`
}

function rasterize(raw: string, outline: OutlineKind | undefined): Promise<HTMLImageElement> {
  const svg = outline ? outlineSvg(raw, OUTLINE.radius, OUTLINE.colors[outline]) : raw
  return svgToImage(setSvgSize(svg, CELL))
}

const NO_CLIP = { base: -1, frames: 0 }

interface Variant {
  readonly id: string
  readonly outline: OutlineKind | undefined
}

/** 要画的变体去重排好：先按描边、再是不描边的 */
function variantsOf(sprites: BattleSprites): Variant[] {
  const out: Variant[] = []
  const seen = new Set<VariantKey>()
  const take = (id: string, outline: OutlineKind | undefined): void => {
    const k = variantKey(id, outline)
    if (seen.has(k)) return
    seen.add(k)
    out.push({ id, outline })
  }
  for (const outline of keysOf(sprites.outlined)) for (const id of sprites.outlined[outline]) take(id, outline)
  for (const id of sprites.plain) take(id, undefined)
  return out
}

let atlasSerial = 0
let shared: EcsAtlas | undefined
let building: Promise<EcsAtlas> | undefined

export class EcsAtlas {
  private readonly uv: Float32Array
  private readonly pageOf: Int32Array
  private readonly keyToFrame = new Map<VariantKey, number>()
  private readonly reportedMissing = new Set<VariantKey>()
  private readonly pages: Phaser.Textures.CanvasTexture[] = []
  private readonly canvases: HTMLCanvasElement[] = []
  private readonly ctxs: CanvasRenderingContext2D[] = []
  private cursor = 0
  private scene?: Phaser.Scene
  private readonly serial = atlasSerial++
  private disposed = false

  dispose(): void {
    this.disposed = true
  }

  /** 换成别的图集时放掉图集页的纹理 */
  private release(scene: Phaser.Scene): void {
    this.disposed = true
    for (const p of this.pages) if (scene.textures.exists(p.key)) scene.textures.remove(p.key)
    this.pages.length = 0
    this.canvases.length = 0
    this.ctxs.length = 0
  }

  /** 收没收这一局要画的全部变体 */
  private covers(variants: readonly Variant[]): boolean {
    return variants.every((v) => this.keyToFrame.has(variantKey(v.id, v.outline)))
  }

  private rebind(scene: Phaser.Scene): void {
    this.scene = scene
    this.disposed = false
  }
  private readonly clips = new Map<ClipKey, { base: number; frames: number }>()
  private readonly baking = new Set<ClipKey>()

  private constructor() {
    this.uv = new Float32Array(MAX_FRAMES * 4)
    this.pageOf = new Int32Array(MAX_FRAMES)
  }

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
    if (!scene) return
    const key = `ecs-atlas-${this.serial}-${this.pages.length}`
    if (scene.textures.exists(key)) scene.textures.remove(key)
    this.pages.push(scene.textures.addCanvas(key, cv)!)
  }

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

  clip(id: string, outline: OutlineKind | undefined, clipId: AnimClipId): { base: number; frames: number } {
    const key = clipKey(id, outline, clipId)
    const hit = this.clips.get(key)
    if (hit) return hit
    if (!this.baking.has(key)) {
      this.baking.add(key)
      void this.bakeClip(id, outline, clipId, key)
        .catch(() => {
          this.clips.set(key, NO_CLIP)
        })
        .finally(() => this.baking.delete(key))
    }
    return NO_CLIP
  }

  private hasRoom(n: number): boolean {
    return this.cursor + n <= MAX_FRAMES
  }

  private async bakeClip(id: string, outline: OutlineKind | undefined, clipId: AnimClipId, key: ClipKey): Promise<void> {
    const clip = animClipOf(id, clipId)
    const scene = this.scene
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

  index(id: string, outline: OutlineKind | undefined): number {
    const k = variantKey(id, outline)
    const frame = this.keyToFrame.get(k)
    if (frame !== undefined) return frame
    if (!this.reportedMissing.has(k)) {
      this.reportedMissing.add(k)
      console.error(`图集未收录变体：${k}`)
    }
    return -1
  }

  /** 一帧在图集页上的 u0、v0、u1、v1；quad 非零时只取它的四分之一格 */
  uvInto(frame: number, out: Float32Array, quad = 0): void {
    const b = frame * 4
    out[0] = this.uv[b]!
    out[1] = this.uv[b + 1]!
    out[2] = this.uv[b + 2]!
    out[3] = this.uv[b + 3]!
    if (quad === 0) return
    const um = (out[0] + out[2]) / 2
    const vm = (out[1] + out[3]) / 2
    if (quad === 1 || quad === 3) out[2] = um
    else out[0] = um
    if (quad === 1 || quad === 2) out[3] = vm
    else out[1] = vm
  }

  get pageCount(): number {
    return this.pages.length
  }

  page(frame: number): number {
    return this.pageOf[frame]!
  }

  pageGlTexture(page: number): Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper {
    return this.pages[page]!.get().source.glTexture!
  }

  /** 这一局的图集：手上的收全了这一局要画的就接着用，否则只按这一局的重建，放掉原来的 */
  static async build(scene: Phaser.Scene, sprites: BattleSprites): Promise<EcsAtlas> {
    const variants = variantsOf(sprites)
    while (building) await building
    if (!shared?.covers(variants)) {
      const old = shared
      building = EcsAtlas.create(scene, variants)
        .then((a) => {
          old?.release(scene)
          return (shared = a)
        })
        .finally(() => {
          building = undefined
        })
      await building
    }
    const atlas = shared!
    atlas.rebind(scene)
    return atlas
  }

  private static async create(scene: Phaser.Scene, variants: readonly Variant[]): Promise<EcsAtlas> {
    if (variants.length > MAX_FRAMES) console.error(`图集放不下这一局要画的 ${variants.length} 个变体，上限 ${MAX_FRAMES}`)
    const atlas = new EcsAtlas()
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
    for (let i = 0; i < variants.length && atlas.hasRoom(1); i++) {
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
