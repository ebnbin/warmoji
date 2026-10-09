import type Phaser from 'phaser'
import { setSvgSize } from '../emoji/svg'
import { emojiSvgText, svgToImage } from '../emoji/textures'

const CELL = 256
const PAGE = 2048
const COLS = PAGE / CELL
const PER_PAGE = COLS * COLS
const MAX_FRAMES = 2048

function rasterize(raw: string): Promise<HTMLImageElement> {
  return svgToImage(setSvgSize(raw, CELL))
}

/** 一团中间实、往外渐渐淡没的白：染成什么颜色就是什么颜色的光晕 */
function glowCell(): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = CELL
  cv.height = CELL
  const g = cv.getContext('2d')
  if (!g) throw new Error('光晕拿不到 2D 画布')
  const r = CELL / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.75)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, CELL, CELL)
  return cv
}

let atlasSerial = 0
let shared: EcsAtlas | undefined
let building: Promise<EcsAtlas> | undefined

export class EcsAtlas {
  private readonly uv: Float32Array
  private readonly pageOf: Int32Array
  private readonly keyToFrame = new Map<string, number>()
  private readonly reportedMissing = new Set<string>()
  /** 光晕那一格 */
  readonly glow: number
  private readonly pages: Phaser.Textures.CanvasTexture[] = []
  private readonly canvases: HTMLCanvasElement[] = []
  private readonly ctxs: CanvasRenderingContext2D[] = []
  private cursor = 0
  private readonly serial = atlasSerial++

  /** 换成别的图集时放掉图集页的纹理 */
  private release(scene: Phaser.Scene): void {
    for (const p of this.pages) if (scene.textures.exists(p.key)) scene.textures.remove(p.key)
    this.pages.length = 0
    this.canvases.length = 0
    this.ctxs.length = 0
  }

  /** 收没收这一局要画的全部 emoji */
  private covers(ids: readonly string[]): boolean {
    return ids.every((id) => this.keyToFrame.has(id))
  }

  private constructor() {
    this.uv = new Float32Array(MAX_FRAMES * 4)
    this.pageOf = new Int32Array(MAX_FRAMES)
    this.glow = this.alloc()
    this.place(this.glow, glowCell())
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

  index(id: string): number {
    const frame = this.keyToFrame.get(id)
    if (frame !== undefined) return frame
    if (!this.reportedMissing.has(id)) {
      this.reportedMissing.add(id)
      console.error(`图集未收录：${id}`)
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
  static async build(scene: Phaser.Scene, ids: readonly string[]): Promise<EcsAtlas> {
    while (building) await building
    if (!shared?.covers(ids)) {
      const old = shared
      building = EcsAtlas.create(scene, ids)
        .then((a) => {
          old?.release(scene)
          return (shared = a)
        })
        .finally(() => {
          building = undefined
        })
      await building
    }
    return shared!
  }

  private static async create(scene: Phaser.Scene, ids: readonly string[]): Promise<EcsAtlas> {
    if (ids.length + 1 > MAX_FRAMES) console.error(`图集放不下这一局要画的 ${ids.length} 个 emoji，上限 ${MAX_FRAMES - 1}`)
    const atlas = new EcsAtlas()
    const imgs = await Promise.all(
      ids.map(async (id) => {
        try {
          return await rasterize(await emojiSvgText(id))
        } catch (e) {
          console.error(`图集光栅化失败：${id}`, e)
          return undefined
        }
      }),
    )
    for (let i = 0; i < ids.length && atlas.cursor < MAX_FRAMES; i++) {
      const img = imgs[i]
      if (!img) continue
      const frame = atlas.alloc()
      atlas.place(frame, img)
      atlas.keyToFrame.set(ids[i]!, frame)
    }
    for (let p = 0; p < atlas.canvases.length; p++) {
      const key = `ecs-atlas-${atlas.serial}-${p}`
      if (scene.textures.exists(key)) scene.textures.remove(key)
      atlas.pages.push(scene.textures.addCanvas(key, atlas.canvases[p]!)!)
    }
    return atlas
  }
}
