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
import { brushAt, brushPhase, inked, laid, sweepOf } from './model'
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
/** 开局最多几个线程分着画；贴图按这么多像素高的条分块交给线程 */
const PAINT_THREADS = 4
const STRIP_PX = 64
/** 各层的深度：页面、平躺的布景、书签带、布景投的影子、立着的布景 */
const SPREAD_DEPTH = -0.9
const FLAT_DEPTH = -0.6
const SHADOW_DEPTH = -0.4
const RIBBON_DEPTH = -0.5
const STAND_DEPTH = 2.7
/** 影子的浓度，每米高的东西影子铺多长（格） */
const SHADOW_ALPHA = 0.3
const SHADOW_PER_M = STAND_U_PER_M * 0.75
const SHADOW_COLOR = 0x3b2614
/** 卡纸的厚度在画面上露出多少，格 */
const CARD_EDGE_U = 0.06
/** 刷痕：笔宽是道距的几倍（相邻两道叠一点），一笔里并排多少根刷毛，刷毛每段多长（格）；收笔前从几成起刷毛开叉断开 */
const BRUSH_WIDE = 1.3
const BRISTLES = 18
const BRISTLE_SEG_U = 0.25
const DRY_FROM = 0.92
/** 换页时正在刷的那张页面；刷完以后多久（毫秒）淡成印好的新一页 */
const LIVE_KEY = 'storybook-live'
const LIVE_FADE_MS = 700
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

/** 一页画好的东西：印好的页面（画布与贴图名），布景的图集，每件的正面、顶面在图集里的位置 */
interface Sheet {
  readonly page: Page
  readonly spread: HTMLCanvasElement
  readonly spreadKey: string
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
 * 换页时一把看不见的大刷子来回刷过两页，刷过处就是新一页，布景跟着折平与弹起
 */
export class StorybookView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private painter?: StorybookPainter
  private book?: Book
  private back?: HTMLCanvasElement
  private readonly sheets = new Map<number, Sheet>()
  private spreadA?: Phaser.GameObjects.Image
  private live?: Phaser.Textures.CanvasTexture
  private livePage = -1
  private liveAt = 0
  private liveOver?: Phaser.GameObjects.Image
  private flat?: QuadLayer
  private stand?: QuadLayer
  private shadow?: QuadLayer
  private readonly scratch = document.createElement('canvas')
  private readonly print = document.createElement('canvas')
  private lastPhase = ''
  private lastStroke = -1
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
    this.live = canvasTexture(scene, LIVE_KEY, Math.round((book.x1 - book.x0) * PRINT_PPU), Math.round((book.y1 - book.y0) * PRINT_PPU))
    this.liveOver = scene.add.image(book.x0 * UNIT, book.y0 * UNIT, LIVE_KEY).setOrigin(0, 0).setDepth(SPREAD_DEPTH + 0.01).setVisible(false)
    this.flat = new QuadLayer(scene, FLAT_DEPTH)
    this.shadow = new QuadLayer(scene, SHADOW_DEPTH, SHADOW_ALPHA)
    this.stand = new QuadLayer(scene, STAND_DEPTH)
    this.visuals.push(this.spreadA, this.liveOver, this.flat, this.shadow, this.stand, this.ribbon(scene, book))
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
    s = {
      page,
      spread: spreadTex.getSourceImage() as HTMLCanvasElement,
      spreadKey,
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
      for (const key of [s.spreadKey, s.atlasKey]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
      this.sheets.delete(i)
    }
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
   * 换页：一把大刷子在一张页面上来回刷——开头铺上旧页，此后每帧把上一帧到这一帧之间刷过的那段画上去，刷过处露出新一页。
   * 一笔是并排的一根根刷毛，每根宽窄浓淡不一，两边的细一点淡一点；收笔前刷毛开叉，越往后断得越多。刷子本身不画
   */
  private wipe(cfg: StorybookConfig, c: BookClock, cur: Sheet, old: Sheet | null): void {
    const over = this.liveOver!
    if (!old) {
      // 刷完以后刷痕留着的纹慢慢收干，露出印好的新一页
      const k = this.livePage === c.page ? 1 - c.at / LIVE_FADE_MS : 0
      over.setVisible(k > 0).setAlpha(k).setDisplaySize((this.book!.x1 - this.book!.x0) * UNIT, (this.book!.y1 - this.book!.y0) * UNIT)
      if (k <= 0) this.livePage = -1
      return
    }
    over.setVisible(false)
    const book = this.book!
    const sw = sweepOf(cfg, book, c.page)
    const tex = this.live!
    const ctx = tex.getContext()
    if (this.livePage !== c.page || c.at < this.liveAt) {
      this.livePage = c.page
      this.liveAt = 0
      ctx.drawImage(old.spread, 0, 0)
    }
    const from = this.liveAt
    const to = Math.min(c.at, cfg.turn.sweepMs)
    this.liveAt = Math.max(from, to)
    const k = PRINT_PPU
    const px = (p: Point): Point => ({ x: (p.x - book.x0) * k, y: (p.y - book.y0) * k })
    const wide = sw.step * BRUSH_WIDE * k
    const src = ctx.createPattern(cur.spread, 'no-repeat')!
    ctx.lineCap = 'round'
    let drew = false
    for (let r = Math.floor(from / sw.rowMs); r <= Math.min(sw.spans.length - 1, Math.floor(to / sw.rowMs)); r++) {
      const fa = brushPhase(sw, Math.max(from, r * sw.rowMs))
      const fb = brushPhase(sw, Math.min(to, (r + 1) * sw.rowMs - 1e-6))
      if (!fa || !fb) continue
      const f0 = fa.r === r ? fa.f : 0
      const f1 = fb.r === r ? fb.f : 1
      if (f1 <= f0) continue
      const [s0, s1] = sw.spans[r]!
      const segs = Math.max(4, Math.ceil((s1 - s0) / BRISTLE_SEG_U))
      const j0 = Math.floor(f0 * segs)
      const j1 = Math.min(segs, Math.ceil(f1 * segs))
      drew = true
      for (let b = 0; b < BRISTLES; b++) {
        const across = b / (BRISTLES - 1) - 0.5
        const edge = 1 - Math.abs(across) * 2
        const off = across * wide
        const seed = r * 97 + b
        ctx.globalAlpha = edge > 0.2 ? 1 : 0.75 + 0.25 * hash01(seed, 0, 41)
        ctx.lineWidth = (wide / BRISTLES) * (1.8 + 1.2 * hash01(seed, 0, 43))
        const dryEnd = 1 - 0.06 * hash01(seed, 0, 45) * (1 - edge * 0.5)
        ctx.beginPath()
        for (let j = j0; j < j1; j++) {
          const fA = j / segs
          const fB = (j + 1) / segs
          if (fA > dryEnd) break
          if (fA > DRY_FROM && hash01(seed, j, 47) < ((fA - DRY_FROM) / (1 - DRY_FROM)) * 0.35) continue
          const pA = brushAt(sw, r, fA)
          const pB = brushAt(sw, r, fB)
          // 刷毛横着排开，方向按这一段刷的方向
          const dx = pB.x - pA.x
          const dy = pB.y - pA.y
          const l = Math.hypot(dx, dy) || 1
          const ox = (-dy / l) * off
          const oy = (dx / l) * off
          const a = px(pA)
          const e = px(pB)
          ctx.moveTo(a.x + ox, a.y + oy)
          ctx.lineTo(e.x + ox, e.y + oy)
        }
        ctx.strokeStyle = src
        ctx.stroke()
        // 刷毛拖出来的纹：隔几根压一道深的或亮的细线
        const streak = hash01(seed, 0, 49)
        if (streak < 0.35) {
          ctx.globalAlpha = 1
          ctx.lineWidth = 1.5
          ctx.strokeStyle = streak < 0.2 ? 'rgba(40,24,12,0.16)' : 'rgba(255,255,255,0.2)'
          ctx.stroke()
        }
      }
      // 每一道颜料的厚薄不一样：整道压一层淡淡的亮或暗，看得出是一道道刷上去的
      const tone = hash01(r, this.livePage, 51)
      ctx.globalAlpha = 1
      ctx.lineWidth = wide * 0.86
      ctx.strokeStyle = tone < 0.5 ? `rgba(255,248,232,${0.06 + tone * 0.12})` : `rgba(70,45,20,${0.03 + (tone - 0.5) * 0.1})`
      ctx.beginPath()
      for (let j = j0; j < j1; j++) {
        if (j / segs > DRY_FROM) break
        const a = px(brushAt(sw, r, j / segs))
        const e = px(brushAt(sw, r, (j + 1) / segs))
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(e.x, e.y)
      }
      ctx.lineCap = 'butt'
      ctx.stroke()
      ctx.lineCap = 'round'
    }
    ctx.globalAlpha = 1
    if (drew) tex.refresh()
  }

  /** 刷子每刷一道唰一声；每件布景折平、弹起时各响一下 */
  private sounds(cfg: StorybookConfig, c: BookClock, shown: readonly Sheet[]): void {
    if (c.phase !== this.lastPhase) {
      this.lastPhase = c.phase
      this.flipped.clear()
      this.lastStroke = -1
    }
    if (c.phase !== 'redraw') return
    const book = this.book!
    const now = brushPhase(sweepOf(cfg, book, c.page), c.at)
    if (now && now.r !== this.lastStroke) {
      this.lastStroke = now.r
      playSfx('swish')
    }
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
    for (const s of this.sheets.values()) for (const key of [s.spreadKey, s.atlasKey]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
    this.sheets.clear()
    for (const k of [BACK_KEY, LIVE_KEY]) if (v.scene.textures.exists(k)) v.scene.textures.remove(k)
  }
}
