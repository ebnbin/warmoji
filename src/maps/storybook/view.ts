import Phaser from 'phaser'
import { query } from 'bitecs'
import { UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { AWAY } from '../../data/light'
import { playSfx } from '../../audio/sfx'
import { Alive, Depth, ENEMY_SET, Transform } from '../../ecs/components'
import { LYING_Z, UNDER_Z } from '../../ecs/render/bands'
import { canvasTexture } from '../textures'
import { FRAME, FRAME_MID } from '../frame'
import { drawFace, drawRoof, faceSize, FLAT_U_PER_M, roofSize, STAND_U_PER_M } from './art'
import { textureSize } from './backdrop'
import { canvasUv, QuadLayer } from './layer'
import { arrival, inked, laid, stageStarts, sweepOf } from './model'
import { StorybookPainter } from './painter'
import { paintPrint, PRINT_PPU } from './print'
import { bookFor, pageAt } from './world'
import type { Quad } from './layer'
import type { Book, BookClock, Page, Piece } from './model'
import type { PaintScene, PixelRect } from './backdrop'
import type { StorybookState } from './world'
import type { StorybookConfig } from '../../types/maps'
import type { Framing } from '../../ecs/lens'
import type { MapView, ViewCtx } from '../../ecs/views'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'

/** 方框外的底色：桌子底下的暗处 */
const BG = 0x1c120c
const BACK_KEY = 'storybook-back'
/** 书页范围里的白纸：擦掉旧画露出来的 */
const PAPER_KEY = 'storybook-paper'
/** 开局最多几个线程分着画；贴图按这么多像素高的条分块交给线程 */
const PAINT_THREADS = 4
const STRIP_PX = 64
/** 各层的深度：页面、平躺的布景、书签带、橡皮屑、布景投的影子、立着的布景 */
const SPREAD_DEPTH = -0.9
const FLAT_DEPTH = -0.6
const CRUMB_DEPTH = -0.45
const SHADOW_DEPTH = -0.4
const RIBBON_DEPTH = -0.5
const STAND_DEPTH = 2.7
/** 影子的浓度，每米高的东西影子铺多长（格） */
const SHADOW_ALPHA = 0.3
const SHADOW_PER_M = STAND_U_PER_M * 0.75
const SHADOW_COLOR = 0x3b2614
/** 卡纸的厚度在画面上露出多少，格 */
const CARD_EDGE_U = 0.06
/** 换页时页面上一块块地擦、描、涂：每隔多远（格）一块，一块里来回几笔、每笔多长、笔与笔隔多远、笔多宽（格） */
const PATCH_U = 1.7
const ERASE = { legs: 6, len: 2.8, step: 0.42, w: 1.05, lines: 5 } as const
const PENCIL = { legs: 5, len: 2.6, step: 0.5, w: 0.75, lines: 2 } as const
const CRAYON = { legs: 10, len: 2.5, step: 0.26, w: 0.3, lines: 1 } as const
/** 一笔在它那一段里占多久（比例）、最晚晚开始多久（比例）；蜡笔涂两遍，第二遍斜着交叉过去补上缝 */
const STROKE_SPAN = { erase: 0.5, pencil: 0.5, crayon: 0.42 } as const
const STROKE_LAG = { erase: 0.3, pencil: 0.2, crayon: 0.12 } as const
const CRAYON_CROSS = 1.1
/** 橡皮屑：一笔擦过撒几粒，擦完多久（毫秒）散干净 */
const CRUMBS_PER_STROKE = 4
const CRUMB_MS = 500
const CRUMB_COLORS = [0xe9cfc6, 0xd9b8b0, 0xc9c2d2] as const
/** 换页时正在擦、正在画的那张页面 */
const LIVE_KEY = 'storybook-live'
/** 草稿：铅笔的颜色，描边多重，暗处排斜线的间距（像素）与起排的暗度 */
const GRAPHITE = [72, 70, 82] as const
const SKETCH_EDGE = 2.4
const HATCH_PX = 7
const HATCH_DARK = 0.32
/** 图集的宽，像素；每件之间空几像素 */
const ATLAS_W = 2048
const ATLAS_GAP = 4


/** 图集里的一块：像素位置与大小 */
interface Cell {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** 一页画好的东西：印好的页面（画布与贴图名），换页时先画上的铅笔草稿，布景的图集，每件的正面、顶面在图集里的位置 */
interface Sheet {
  readonly page: Page
  readonly spread: HTMLCanvasElement
  readonly spreadKey: string
  readonly sketchKey: string
  readonly atlas: HTMLCanvasElement
  readonly atlasKey: string
  readonly faces: Cell[]
  readonly roofs: (Cell | null)[]
  readonly white: Cell
}

/** 一件布景此刻在画面上的样子：正面底边两头、顶边两头，盒子的后底边两头与顶面后边两头（像素） */
interface Pose {
  readonly A: Point
  readonly B: Point
  readonly TA: Point
  readonly TB: Point
  readonly C: Point
  readonly D: Point
  readonly TC: Point
  readonly TD: Point
  /** 正面的朝向（单位向量）与这一刻往后倒了多远、抬起多高（像素） */
  readonly fx: number
  readonly fy: number
  readonly back: number
  readonly up: number
}

/** 一件布景按倒下的程度摆出来 */
function poseOf(p: Piece, lay: number): Pose {
  const phi = lay * (Math.PI / 2)
  const ux = Math.cos(p.a)
  const uy = Math.sin(p.a)
  const fx = -uy
  const fy = ux
  const back = p.h * FLAT_U_PER_M * Math.sin(phi) * UNIT
  const up = p.h * STAND_U_PER_M * Math.cos(phi) * UNIT
  const A = { x: (p.x - (ux * p.w) / 2) * UNIT, y: (p.y - (uy * p.w) / 2) * UNIT }
  const B = { x: (p.x + (ux * p.w) / 2) * UNIT, y: (p.y + (uy * p.w) / 2) * UNIT }
  const d = p.box ? p.d * UNIT : 0
  const C = { x: A.x - fx * d, y: A.y - fy * d }
  const D = { x: B.x - fx * d, y: B.y - fy * d }
  const top = (q: Point): Point => ({ x: q.x - fx * back, y: q.y - fy * back - up })
  return { A, B, TA: top(A), TB: top(B), C, D, TC: top(C), TD: top(D), fx, fy, back, up }
}

function quad(key: string, tl: Point, bl: Point, tr: Point, br: Point, cell: Cell, tw: number, th: number, color = 0xffffff, alpha = 1, fill = false): Quad {
  const uv = canvasUv(tw, th, cell.x, cell.y, cell.w, cell.h)
  return { key, x: [tl.x, bl.x, tr.x, br.x], y: [tl.y, bl.y, tr.y, br.y], ...uv, color, alpha, fill }
}

type Tool = 'erase' | 'pencil' | 'crayon'
type Shape = { readonly legs: number; readonly len: number; readonly step: number; readonly w: number; readonly lines: number }

/**
 * 一笔：用哪种笔，画布上的一串折点（像素，x、y 交替）与走到每个折点时走了多远，几时起笔几时收笔（换页开始后的毫秒），
 * 笔宽（像素），并排几道、并排的方向，种子
 */
interface Stroke {
  readonly tool: Tool
  readonly pts: readonly number[]
  readonly len: readonly number[]
  readonly t0: number
  readonly t1: number
  readonly w: number
  readonly lines: number
  readonly nx: number
  readonly ny: number
  readonly seed: number
}

/** 一笔上走了 d 像素的地方 */
function pointAt(s: Stroke, d: number): Point {
  const n = s.len.length
  for (let i = 1; i < n; i++) {
    if (d <= s.len[i]! || i === n - 1) {
      const t = Math.min(1, Math.max(0, (d - s.len[i - 1]!) / (s.len[i]! - s.len[i - 1]! || 1)))
      return { x: s.pts[i * 2 - 2]! + (s.pts[i * 2]! - s.pts[i * 2 - 2]!) * t, y: s.pts[i * 2 - 1]! + (s.pts[i * 2 + 1]! - s.pts[i * 2 - 1]!) * t }
    }
  }
  return { x: s.pts[0]!, y: s.pts[1]! }
}

/** 把一笔从走了 a 像素到走了 b 像素的那段描成路径，整段挪 (ox, oy) */
function trace(ctx: CanvasRenderingContext2D, s: Stroke, a: number, b: number, ox: number, oy: number): void {
  const p = pointAt(s, a)
  ctx.beginPath()
  ctx.moveTo(p.x + ox, p.y + oy)
  for (let i = 1; i < s.len.length; i++) if (s.len[i]! > a && s.len[i]! < b) ctx.lineTo(s.pts[i * 2]! + ox, s.pts[i * 2 + 1]! + oy)
  const q = pointAt(s, b)
  ctx.lineTo(q.x + ox, q.y + oy)
}

/** 整数对上的哈希，落在 [0, 1) */
function hash01(a: number, b: number, salt: number): number {
  let h = Math.imul(a ^ Math.imul(salt, 0x9e3779b9), 0x27d4eb2d) ^ Math.imul(b, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

function grey(k: number): number {
  const v = Math.round(255 * Math.max(0, Math.min(1, k)))
  return (v << 16) | (v << 8) | v
}

/** 点在多边形里 */
function inside(poly: readonly Point[], x: number, y: number): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

/**
 * 立体书：桌面、封面、纸边与纸面是开局在后台线程画好的贴图；每一页的插画印在白底上、乘到纸面上，是一张贴图；
 * 布景的正面与盒子的顶面画进每页一张图集，按倒下的程度贴在四边形上：立着的画在身体后面，平躺的贴着页面，影子画在页面上、整层按一个浓度叠。
 * 站在立着的布景背后、被它的正面挡住的身体挪到最底下那一层，露出来的只有高过布景的那截。
 * 换页时一道前沿扫过两页：前沿过处旧画被擦成白纸、落下橡皮屑，新画先出铅笔草稿再上色，布景跟着折平与弹起
 */
export class StorybookView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private painter?: StorybookPainter
  private book?: Book
  private back?: HTMLCanvasElement
  private readonly sheets = new Map<number, Sheet>()
  private spreadA?: Phaser.GameObjects.Image
  private live?: Phaser.Textures.CanvasTexture
  private strokes: Stroke[] = []
  private livePage = -1
  private liveAt = 0
  private crumbs?: Phaser.GameObjects.Graphics
  private flat?: QuadLayer
  private stand?: QuadLayer
  private shadow?: QuadLayer
  private readonly scratch = document.createElement('canvas')
  private readonly print = document.createElement('canvas')
  private lastPhase = ''
  private readonly flipped = new Set<string>()
  private ready = false
  private serial = 0

  layout(): { w: number; h: number; origin: Point } {
    return { w: FRAME.w, h: FRAME.h, origin: FRAME_MID }
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-2)))
  }

  /** 页面上的小东西都印在插画里了 */
  decor(): void {}

  private cfg(v: ViewCtx): StorybookConfig {
    return v.def.storybook!
  }

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const st = sim.worldState.storybook
    if (!st) return
    const scene = v.scene
    const book = bookFor(this.cfg(v), v.run.decorSeed)
    this.book = book
    const sc: PaintScene = { x0: book.x0, x1: book.x1, y0: book.y0, y1: book.y1, gx: book.gx, seed: book.seed }
    const size = textureSize()
    const tex = canvasTexture(scene, BACK_KEY, size.w, size.h)
    const painter = new StorybookPainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const rects: PixelRect[] = []
    for (let y = 0; y < size.h; y += STRIP_PX) rects.push({ x0: 0, y0: y, x1: size.w, y1: Math.min(size.h, y + STRIP_PX) })
    await painter.paint(rects, (p) => {
      tex.getContext().putImageData(new ImageData(p.pixels, p.rect.x1 - p.rect.x0, p.rect.y1 - p.rect.y0), p.rect.x0, p.rect.y0)
    })
    painter.close()
    if (this.painter !== painter) return
    this.painter = undefined
    tex.refresh()
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
    this.back = tex.getSourceImage() as HTMLCanvasElement
    this.visuals.push(scene.add.image(0, 0, BACK_KEY).setOrigin(0, 0).setDisplaySize((size.w / GROUND_PPU) * UNIT, (size.h / GROUND_PPU) * UNIT).setDepth(-1))
    const at = (x: number, y: number): Phaser.GameObjects.Image => scene.add.image(x, y, '__WHITE').setOrigin(0, 0).setDepth(SPREAD_DEPTH)
    this.spreadA = at(book.x0 * UNIT, book.y0 * UNIT)
    canvasTexture(scene, PAPER_KEY, Math.round((book.x1 - book.x0) * PRINT_PPU), Math.round((book.y1 - book.y0) * PRINT_PPU), (ctx) => {
      ctx.drawImage(this.back!, book.x0 * GROUND_PPU, book.y0 * GROUND_PPU, (book.x1 - book.x0) * GROUND_PPU, (book.y1 - book.y0) * GROUND_PPU, 0, 0, ctx.canvas.width, ctx.canvas.height)
    })
    this.live = canvasTexture(scene, LIVE_KEY, Math.round((book.x1 - book.x0) * PRINT_PPU), Math.round((book.y1 - book.y0) * PRINT_PPU))
    this.crumbs = scene.add.graphics().setDepth(CRUMB_DEPTH)
    this.flat = new QuadLayer(scene, FLAT_DEPTH)
    this.shadow = new QuadLayer(scene, SHADOW_DEPTH, SHADOW_ALPHA)
    this.stand = new QuadLayer(scene, STAND_DEPTH)
    this.visuals.push(this.spreadA, this.crumbs, this.flat, this.shadow, this.stand, this.ribbon(scene, book))
    const c = st.clock
    this.sheet(v, st, c.page)
    if (c.phase === 'redraw') this.sheet(v, st, c.page - 1)
    this.lastPhase = c.phase
    this.ready = true
    v.lens.screen.vignette(0.8, 0.22, 0x140a04)
  }

  /** 书签带：从书脊上头的堵头布垂下来，弯弯地搭在右页上，尾巴剪成燕尾；平躺在页面上，谁都踩得过 */
  private ribbon(scene: Phaser.Scene, book: Book): Phaser.GameObjects.Graphics {
    const g = scene.add.graphics().setDepth(RIBBON_DEPTH)
    const pts: Point[] = []
    const n = 40
    const len = 9.5
    for (let i = 0; i <= n; i++) {
      const t = i / n
      pts.push({ x: (book.gx + 0.12 + Math.sin(t * Math.PI * 1.3) * 1.1 + t * 1.6) * UNIT, y: (book.y0 - 0.35 + t * len) * UNIT })
    }
    const half = 0.17 * UNIT
    const side = (k: number, off: number): Point[] =>
      pts.map((p, i) => {
        const q = pts[Math.min(n, i + 1)]!
        const r = pts[Math.max(0, i - 1)]!
        const dx = q.x - r.x
        const dy = q.y - r.y
        const l = Math.hypot(dx, dy) || 1
        return { x: p.x - (dy / l) * half * k + off, y: p.y + (dx / l) * half * k + off }
      })
    const strip = (off: number, color: number, alpha: number): void => {
      const a = side(1, off)
      const b = side(-1, off).reverse()
      const end = pts[n]!
      g.fillStyle(color, alpha)
      g.beginPath()
      g.moveTo(a[0]!.x, a[0]!.y)
      for (const p of a) g.lineTo(p.x, p.y)
      g.lineTo(end.x + off, end.y - half * 1.2 + off)
      for (const p of b) g.lineTo(p.x, p.y)
      g.closePath()
      g.fillPath()
    }
    strip(0.08 * UNIT, SHADOW_COLOR, 0.25)
    strip(0, 0xa52f38, 1)
    g.lineStyle(0.03 * UNIT, 0xd86a6f, 0.8)
    g.beginPath()
    pts.forEach((p, i) => (i === 0 ? g.moveTo(p.x - 2, p.y) : g.lineTo(p.x - 2, p.y)))
    g.strokePath()
    for (const k of [1, -1]) {
      g.lineStyle(0.025 * UNIT, 0x5e171d, 0.9)
      g.beginPath()
      side(k, 0).forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)))
      g.strokePath()
    }
    return g
  }

  /** 第几页画好的东西：没画过就现画 */
  private sheet(v: ViewCtx, st: StorybookState, index: number): Sheet {
    let s = this.sheets.get(index)
    if (s) return s
    const book = this.book!
    const page = pageAt(st, this.cfg(v), index)
    const n = this.serial++
    const w = Math.round((book.x1 - book.x0) * PRINT_PPU)
    const h = Math.round((book.y1 - book.y0) * PRINT_PPU)
    paintPrint(page, book, this.print)
    const spreadKey = `storybook-spread-${n}`
    const spreadTex = canvasTexture(v.scene, spreadKey, w, h, (ctx) => {
      ctx.drawImage(this.back!, book.x0 * GROUND_PPU, book.y0 * GROUND_PPU, w, h, 0, 0, w, h)
      ctx.globalCompositeOperation = 'multiply'
      ctx.drawImage(this.print, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
    })
    // 图集：左上角一小块纯白（填色用），再一排排放正面与顶面
    const faces: Cell[] = []
    const roofs: (Cell | null)[] = []
    const want: { w: number; h: number }[] = []
    for (const p of page.pieces) {
      want.push(faceSize(p))
      if (p.box) want.push(roofSize(p))
    }
    let x = 16
    let y = 0
    let row = 16
    const cells: Cell[] = []
    for (const r of want) {
      if (x + r.w > ATLAS_W) {
        x = 0
        y += row + ATLAS_GAP
        row = 0
      }
      cells.push({ x, y, w: r.w, h: r.h })
      x += r.w + ATLAS_GAP
      row = Math.max(row, r.h)
    }
    const ah = y + row + ATLAS_GAP
    const atlasKey = `storybook-atlas-${n}`
    let k = 0
    const atlasTex = canvasTexture(v.scene, atlasKey, ATLAS_W, ah, (ctx) => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 12, 12)
      for (const p of page.pieces) {
        const f = cells[k++]!
        faces.push(f)
        drawFace(ctx, p, f.x, f.y, f.w, f.h, this.scratch)
        if (p.box) {
          const r = cells[k++]!
          roofs.push(r)
          drawRoof(ctx, p, r.x, r.y, r.w, r.h)
        } else roofs.push(null)
      }
    })
    const sketchKey = `storybook-sketch-${n}`
    this.sketch(v, sketchKey, page, cells, atlasTex.getSourceImage() as HTMLCanvasElement)
    s = {
      page,
      spread: spreadTex.getSourceImage() as HTMLCanvasElement,
      spreadKey,
      sketchKey,
      atlas: atlasTex.getSourceImage() as HTMLCanvasElement,
      atlasKey,
      faces,
      roofs,
      white: { x: 2, y: 2, w: 8, h: 8 },
    }
    this.sheets.set(index, s)
    return s
  }

  /** 用不着的页丢掉：只留上一页、此刻这一页与下一页 */
  private prune(v: ViewCtx, keep: number): void {
    for (const [i, s] of this.sheets) {
      if (i === keep || i === keep + 1 || i === keep - 1) continue
      for (const key of [s.spreadKey, s.sketchKey, s.atlasKey]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
      this.sheets.delete(i)
    }
  }

  /**
   * 新一页的铅笔草稿：插画连同平躺的布景描出轮廓，暗处排几道斜线，画在白纸上。
   * 须紧接着 paintPrint 调用：this.print 里还是这一页的插画
   */
  private sketch(v: ViewCtx, key: string, page: Page, cells: readonly Cell[], atlas: HTMLCanvasElement): void {
    const book = this.book!
    const w = this.print.width
    const h = this.print.height
    const src = Object.assign(document.createElement('canvas'), { width: w, height: h })
    const sc = src.getContext('2d', { willReadFrequently: true })!
    sc.drawImage(this.print, 0, 0)
    // 平躺的布景按页面上的样子贴进去，图集里正面与顶面挨着排，与 sheet 里的次序一样
    let k = 0
    const to = (q: Point): Point => ({ x: (q.x / UNIT - book.x0) * PRINT_PPU, y: (q.y / UNIT - book.y0) * PRINT_PPU })
    const lay = (cell: Cell, tl: Point, bl: Point, tr: Point): void => {
      const a = to(tl)
      const b = to(bl)
      const c = to(tr)
      sc.setTransform((c.x - a.x) / cell.w, (c.y - a.y) / cell.w, (b.x - a.x) / cell.h, (b.y - a.y) / cell.h, a.x, a.y)
      sc.drawImage(atlas, cell.x, cell.y, cell.w, cell.h, 0, 0, cell.w, cell.h)
      sc.setTransform(1, 0, 0, 1, 0, 0)
    }
    for (const p of page.pieces) {
      const o = poseOf(p, 1)
      const face = cells[k++]!
      if (p.box) lay(cells[k++]!, o.TC, o.TA, o.TD)
      lay(face, o.TA, o.A, o.TB)
    }
    const ink = sc.getImageData(0, 0, w, h).data
    const lum = new Float32Array(w * h)
    for (let i = 0; i < w * h; i++) {
      const a = ink[i * 4 + 3]! / 255
      lum[i] = 1 - a + (a * (ink[i * 4]! * 0.3 + ink[i * 4 + 1]! * 0.59 + ink[i * 4 + 2]! * 0.11)) / 255
    }
    canvasTexture(v.scene, key, w, h, (ctx) => {
      ctx.drawImage(v.scene.textures.get(PAPER_KEY).getSourceImage() as HTMLCanvasElement, 0, 0)
      const img = ctx.getImageData(0, 0, w, h)
      const d = img.data
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x
          const gx = lum[i + 1]! - lum[i - 1]! + 0.5 * (lum[i - w + 1]! - lum[i - w - 1]! + lum[i + w + 1]! - lum[i + w - 1]!)
          const gy = lum[i + w]! - lum[i - w]! + 0.5 * (lum[i + w - 1]! - lum[i - w - 1]! + lum[i + w + 1]! - lum[i - w + 1]!)
          const dark = 1 - lum[i]!
          const hatch = dark > HATCH_DARK && (x + y) % HATCH_PX === 0 ? 0.25 + dark * 0.4 : 0
          const a = Math.min(0.85, Math.hypot(gx, gy) * SKETCH_EDGE + hatch + dark * 0.06)
          const o = i * 4
          d[o] = d[o]! * (1 - a) + GRAPHITE[0] * a
          d[o + 1] = d[o + 1]! * (1 - a) + GRAPHITE[1] * a
          d[o + 2] = d[o + 2]! * (1 - a) + GRAPHITE[2] * a
        }
      }
      ctx.putImageData(img, 0, 0)
    })
  }

  step(v: ViewCtx, sim: Sim, _delta: number): void {
    const st = sim.worldState.storybook
    if (!st || !this.ready || !this.book) return
    const cfg = this.cfg(v)
    const c = st.clock
    const cur = this.sheet(v, st, c.page)
    const old = c.phase === 'redraw' ? this.sheet(v, st, c.page - 1) : null
    // 立着的时候把下一页先画好，换页时就不用现画
    if (c.phase === 'stand' && c.at > 1500) this.sheet(v, st, c.page + 1)
    this.prune(v, c.page)
    this.wipe(cfg, c, cur, old)
    this.spreadA!.setTexture(old ? LIVE_KEY : cur.spreadKey).setDisplaySize((this.book.x1 - this.book.x0) * UNIT, (this.book.y1 - this.book.y0) * UNIT)
    const shown = old ? [old, cur] : [cur]
    this.pieces(cfg, c, shown)
    this.sounds(cfg, c, shown)
    this.hide(sim, cfg, c, shown)
  }

  /** 这一刻要画的布景：立着的、正在倒或正在弹的画在身体后面，平躺的贴着页面、按印上去的浓淡，都投影子 */
  private pieces(cfg: StorybookConfig, c: BookClock, shown: readonly Sheet[]): void {
    const flat: Quad[] = []
    const stand: Quad[] = []
    const shade: Quad[] = []
    const book = this.book!
    for (const sh of shown) {
      sh.page.pieces.forEach((p, i) => {
        const lay = laid(cfg, c, book, sh.page.index, p)
        const lying = lay > 0.97
        const alpha = lying ? inked(cfg, c, book, sh.page.index, p) : 1
        if (alpha <= 0.002) return
        this.piece(sh, p, i, lay, lying ? flat : stand, shade, alpha)
      })
    }
    this.flat!.quads = flat
    this.stand!.quads = stand
    this.shadow!.quads = shade
  }

  /** 一件布景的几块：影子、卡纸的厚边、盒子的侧面与顶面、正面；alpha 是印在页面上有多浓 */
  private piece(sh: Sheet, p: Piece, i: number, lay: number, out: Quad[], shade: Quad[], alpha: number): void {
    const tw = sh.atlas.width
    const th = sh.atlas.height
    const key = sh.atlasKey
    const f = sh.faces[i]!
    const o = poseOf(p, lay)
    const cos = Math.cos(lay * (Math.PI / 2))
    // 影子：顶边顺着背光的方向铺到地上
    const sl = p.h * SHADOW_PER_M * Math.max(0, cos) * UNIT
    if (sl > 0.5) {
      const sx = AWAY.x * sl
      const sy = AWAY.y * sl
      const g = (q: Point): Point => ({ x: q.x - o.fx * o.back + sx, y: q.y - o.fy * o.back + sy })
      shade.push(quad(key, g(o.A), o.A, g(o.B), o.B, f, tw, th, SHADOW_COLOR, alpha, true))
      if (p.box) {
        shade.push(quad(key, g(o.C), o.C, g(o.D), o.D, f, tw, th, SHADOW_COLOR, alpha, true))
        shade.push(quad(key, g(o.C), g(o.A), g(o.D), g(o.B), sh.white, tw, th, SHADOW_COLOR, alpha, true))
        shade.push(quad(key, o.C, o.A, o.D, o.B, sh.white, tw, th, SHADOW_COLOR, alpha, true))
        shade.push(quad(key, g(o.D), o.D, g(o.B), o.B, sh.white, tw, th, SHADOW_COLOR, alpha, true))
      }
    }
    // 迎着灯的面亮：立着的正面朝外偏一点就暗一点，平躺着最亮
    const lit = 0.84 + 0.16 * (1 - cos) + 0.05 * Math.max(0, -o.fx)
    if (p.box) {
      const r = sh.roofs[i]!
      out.push(quad(key, o.TC, o.TA, o.TD, o.TB, r, tw, th, grey(1.02), alpha))
      const right = o.fy > 0 && Math.sin(p.a) > 0.01
      const left = Math.sin(p.a) < -0.01
      if (right) out.push(quad(key, o.TD, o.D, o.TB, o.B, sh.white, tw, th, 0x8f7a68, alpha, true))
      if (left) out.push(quad(key, o.TA, o.A, o.TC, o.C, sh.white, tw, th, 0x8f7a68, alpha, true))
    } else {
      // 卡纸的厚度：往后挪一点的同一张剪影，填成纸芯的颜色，露在顶边上
      const t = CARD_EDGE_U * UNIT
      const e = (q: Point): Point => ({ x: q.x - o.fx * t + 1, y: q.y - o.fy * t - t * 0.3 })
      out.push(quad(key, e(o.TA), e(o.A), e(o.TB), e(o.B), f, tw, th, 0xe9dcc0, alpha, true))
    }
    out.push(quad(key, o.TA, o.A, o.TB, o.B, f, tw, th, grey(lit), alpha))
  }

  /**
   * 换页时一块块的笔画：前沿到了一块，先用橡皮来回蹭，再用铅笔来回描出草稿，最后用蜡笔顺着一个方向来回涂上色。
   * 橡皮一笔是几道并排的细条、每道擦得不一样干净；蜡笔一笔窄、宽窄不一，笔与笔之间留着缝
   */
  private strokesFor(cfg: StorybookConfig, cur: Sheet): Stroke[] {
    const book = this.book!
    const sw = sweepOf(book, cur.page.index)
    const t = cfg.turn
    const st = stageStarts(cfg)
    const seed = cur.page.seed
    const k = PRINT_PPU
    const front = Math.atan2(sw.ux, -sw.uy)
    const hatch = hash01(seed, 7, 3) * Math.PI
    const out: Stroke[] = []
    let n = 0
    const make = (tool: Tool, cx: number, cy: number, ang: number, shape: Shape, t0: number, span: number): void => {
      const ux = Math.cos(ang)
      const uy = Math.sin(ang)
      const pts: number[] = []
      for (let i = 0; i < shape.legs; i++) {
        const along = (i % 2 === 0 ? -0.5 : 0.5) * shape.len * (0.85 + 0.3 * hash01(n, i, 11))
        const across = (i - (shape.legs - 1) / 2) * shape.step
        pts.push((cx + ux * along - uy * across - book.x0) * k, (cy + uy * along + ux * across - book.y0) * k)
      }
      const len = [0]
      for (let i = 2; i < pts.length; i += 2) len.push(len[len.length - 1]! + Math.hypot(pts[i]! - pts[i - 2]!, pts[i + 1]! - pts[i - 1]!))
      out.push({ tool, pts, len, t0, t1: t0 + span, w: shape.w * k * (tool === 'crayon' ? 0.75 + 0.5 * hash01(n, 5, 13) : 1), lines: shape.lines, nx: -uy, ny: ux, seed: n })
    }
    for (let gy = book.y0 - 0.3; gy < book.y1 + 0.3; gy += PATCH_U) {
      for (let gx = book.x0 - 0.3; gx < book.x1 + 0.3; gx += PATCH_U) {
        n++
        const cx = gx + (hash01(n, seed, 1) - 0.5) * PATCH_U * 0.7
        const cy = gy + (hash01(n, seed, 2) - 0.5) * PATCH_U * 0.7
        const a = arrival(cfg, sw, Math.min(book.x1, Math.max(book.x0, cx)), Math.min(book.y1, Math.max(book.y0, cy)))
        const r = (salt: number): number => hash01(n, seed, salt)
        make('erase', cx, cy, front + (r(3) - 0.5) * 0.9, ERASE, a + r(4) * STROKE_LAG.erase * t.eraseMs, STROKE_SPAN.erase * t.eraseMs)
        make('pencil', cx, cy, front + (r(5) - 0.5) * 1.2, PENCIL, a + st.sketch + r(6) * STROKE_LAG.pencil * t.sketchMs, STROKE_SPAN.pencil * t.sketchMs)
        for (const pass of [0, 1]) {
          const t0 = a + st.color + (pass * (STROKE_SPAN.crayon + STROKE_LAG.crayon) + r(8 + pass) * STROKE_LAG.crayon) * t.colorMs
          make('crayon', cx, cy, hatch + pass * CRAYON_CROSS + (r(7) - 0.5) * 0.25, CRAYON, t0, STROKE_SPAN.crayon * t.colorMs)
        }
      }
    }
    return out.sort((p, q) => p.t0 - q.t0)
  }

  /**
   * 换页：在一张页面上一笔笔地擦和画——开头铺上旧页，此后每帧把上一帧到这一帧之间走过的那段笔画画上去：
   * 橡皮带出白纸、铅笔带出草稿、蜡笔带出新画；橡皮擦过的地方撒着橡皮屑，一会儿就散了
   */
  private wipe(cfg: StorybookConfig, c: BookClock, cur: Sheet, old: Sheet | null): void {
    const g = this.crumbs!.clear()
    if (!old) {
      this.livePage = -1
      return
    }
    const tex = this.live!
    const ctx = tex.getContext()
    if (this.livePage !== c.page || c.at < this.liveAt) {
      this.livePage = c.page
      this.liveAt = 0
      this.strokes = this.strokesFor(cfg, cur)
      ctx.drawImage(old.spread, 0, 0)
    }
    const from = this.liveAt
    const to = c.at
    this.liveAt = to
    const src: Record<Tool, CanvasPattern> = {
      erase: ctx.createPattern(this.canvasOf(PAPER_KEY), 'no-repeat')!,
      pencil: ctx.createPattern(this.canvasOf(cur.sketchKey), 'no-repeat')!,
      crayon: ctx.createPattern(cur.spread, 'no-repeat')!,
    }
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    let drew = false
    for (const s of this.strokes) {
      if (s.t0 >= to) break
      if (s.t1 <= from) continue
      const span = s.t1 - s.t0
      const total = s.len[s.len.length - 1]!
      const a = Math.max(0, (from - s.t0) / span) * total
      const b = Math.min(1, (to - s.t0) / span) * total
      if (b <= a) continue
      drew = true
      for (let l = 0; l < s.lines; l++) {
        const off = (l - (s.lines - 1) / 2) * (s.w / s.lines)
        ctx.globalAlpha = s.tool === 'erase' ? 0.45 + 0.45 * hash01(s.seed, l, 21) : 0.95
        ctx.strokeStyle = src[s.tool]
        ctx.lineWidth = (s.w / s.lines) * (s.lines > 1 ? 1.35 : 1)
        trace(ctx, s, a, b, s.nx * off, s.ny * off)
        ctx.stroke()
      }
      // 橡皮蹭过的地方留一层淡淡的灰
      if (s.tool === 'erase' && hash01(s.seed, 1, 23) < 0.35) {
        ctx.globalAlpha = 0.06
        ctx.strokeStyle = '#55505e'
        ctx.lineWidth = s.w
        trace(ctx, s, a, b, 0, 0)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
    if (drew) tex.refresh()
    const book = this.book!
    const k = UNIT / PRINT_PPU
    for (const s of this.strokes) {
      if (s.t0 >= to) break
      if (s.tool !== 'erase' || to > s.t1 + CRUMB_MS) continue
      const total = s.len[s.len.length - 1]!
      const reach = Math.min(1, (to - s.t0) / (s.t1 - s.t0)) * total
      const fade = to > s.t1 ? 1 - (to - s.t1) / CRUMB_MS : 1
      for (let i = 0; i < CRUMBS_PER_STROKE; i++) {
        const at = hash01(s.seed, i, 31) * total
        if (at > reach) continue
        const p = pointAt(s, at)
        const r1 = hash01(s.seed, i, 33)
        const r2 = hash01(s.seed, i, 35)
        const x = book.x0 * UNIT + p.x * k + (r1 - 0.5) * s.w * k * 1.6
        const y = book.y0 * UNIT + p.y * k + (r2 - 0.5) * s.w * k * 1.6
        g.fillStyle(CRUMB_COLORS[i % CRUMB_COLORS.length]!, 0.95 * fade)
        g.fillEllipse(x, y, (0.08 + r1 * 0.08) * UNIT, (0.05 + r2 * 0.06) * UNIT)
      }
    }
  }

  /** 贴图名对应的画布 */
  private canvasOf(key: string): HTMLCanvasElement {
    return this.live!.manager.get(key).getSourceImage() as HTMLCanvasElement
  }

  /** 每进一段响一声：开始换页时沙沙一声；每件布景折平、弹起时各响一下 */
  private sounds(cfg: StorybookConfig, c: BookClock, shown: readonly Sheet[]): void {
    if (c.phase !== this.lastPhase) {
      this.lastPhase = c.phase
      if (c.phase === 'redraw') playSfx('rustle')
      this.flipped.clear()
    }
    if (c.phase !== 'redraw') return
    const book = this.book!
    for (const sh of shown) {
      const fresh = sh.page.index === c.page
      sh.page.pieces.forEach((p, i) => {
        const key = `${sh.page.index}:${i}`
        if (this.flipped.has(key)) return
        const lay = laid(cfg, c, book, sh.page.index, p)
        if (fresh ? lay < 0.5 : lay > 0.5) {
          this.flipped.add(key)
          playSfx(fresh ? 'pop' : 'fold')
        }
      })
    }
  }

  /** 站在立着的布景背后、被它的正面或顶面挡住的身体挪到最底下那一层画 */
  private hide(sim: Sim, cfg: StorybookConfig, c: BookClock, shown: readonly Sheet[]): void {
    const polys: { poly: Point[]; ax: number; ay: number; fx: number; fy: number }[] = []
    const book = this.book!
    for (const sh of shown) {
      for (const p of sh.page.pieces) {
        const lay = laid(cfg, c, book, sh.page.index, p)
        if (lay > 0.9) continue
        const o = poseOf(p, lay)
        const poly = p.box ? [o.A, o.B, o.TB, o.TD, o.TC, o.TA] : [o.A, o.B, o.TB, o.TA]
        polys.push({ poly, ax: o.A.x, ay: o.A.y, fx: o.fx, fy: o.fy })
      }
    }
    if (polys.length === 0) return
    const test = (eid: number): void => {
      const z = Depth.z[eid]!
      if (z < LYING_Z) return
      const x = Transform.x[eid]!
      const y = Transform.y[eid]!
      const hw = Transform.w[eid]! * 0.35
      for (const g of polys) {
        if ((x - g.ax) * g.fx + (y - g.ay) * g.fy >= 0) continue
        if (inside(g.poly, x, y) || inside(g.poly, x - hw, y) || inside(g.poly, x + hw, y)) {
          Depth.z[eid] = UNDER_Z - 1000 + z
          return
        }
      }
    }
    for (const m of sim.characters) if (Alive.v[m]) test(m)
    for (const e of query(sim.world, ENEMY_SET)) if (Alive.v[e]) test(e)
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    v.decor.length = 0
    this.ready = false
    for (const s of this.sheets.values()) for (const key of [s.spreadKey, s.sketchKey, s.atlasKey]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
    this.sheets.clear()
    for (const k of [BACK_KEY, PAPER_KEY, LIVE_KEY]) if (v.scene.textures.exists(k)) v.scene.textures.remove(k)
  }
}
