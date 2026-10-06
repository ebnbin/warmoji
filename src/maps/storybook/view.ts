import Phaser from 'phaser'
import { query } from 'bitecs'
import { UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { AWAY } from '../../data/light'
import { MAPS } from '../../data/maps'
import { playSfx } from '../../audio/sfx'
import { Alive, Depth, ENEMY_SET, Transform } from '../../ecs/components'
import { LYING_Z, UNDER_Z } from '../../ecs/render/bands'
import { canvasTexture } from '../textures'
import { FRAME, FRAME_MID } from '../frame'
import { drawFace, drawRoof, faceSize, FLAT_U_PER_M, roofSize, STAND_U_PER_M } from './art'
import { textureSize } from './backdrop'
import { canvasUv, QuadLayer } from './layer'
import { laid } from './model'
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
/** 各层的深度：页面、平躺的布景、布景投的影子、翻起来的页角与页影、立着的布景、翻过去的书页 */
const SPREAD_DEPTH = -0.9
const FLAT_DEPTH = -0.6
const SHADOW_DEPTH = -0.4
const RIBBON_DEPTH = -0.5
const CURL_DEPTH = -0.3
const STAND_DEPTH = 2.7
/** 翻过去的书页从扬到半空的身体脚下扫过：画在立着的布景之上、身体之下 */
const LEAF_DEPTH = 2.95
/** 影子的浓度，每米高的东西影子铺多长（格） */
const SHADOW_ALPHA = 0.3
const SHADOW_PER_M = STAND_U_PER_M * 0.75
const SHADOW_COLOR = 0x3b2614
/** 卡纸的厚度在画面上露出多少，格 */
const CARD_EDGE_U = 0.06
/** 翻过去的书页：离页面每一格高在画面上抬起多少格 */
const LEAF_LIFT = STAND_U_PER_M / FLAT_U_PER_M
/** 翻页时书页上的光：迎着灯最亮、侧着最暗 */
const LEAF_LIGHT = { min: 0.62, max: 1.04 } as const
/** 图集的宽，像素；每件之间空几像素 */
const ATLAS_W = 2048
const ATLAS_GAP = 4
/** 页角翘起来最大多少格 */
const CURL_U = 3.2

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const easeInOut = (x: number): number => x * x * (3 - 2 * x)

/** 图集里的一块：像素位置与大小 */
interface Cell {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** 一页画好的东西：印好的页面（画布与贴图名），布景的图集，每件的正面、顶面、风车叶片在图集里的位置 */
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
 * 翻页时页角先翘起来、一道页影扫过页面；书页翻起来盖过战场，正面是旧的右页、背面是新的左页
 */
export class StorybookView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private painter?: StorybookPainter
  private book?: Book
  private back?: HTMLCanvasElement
  private readonly sheets = new Map<number, Sheet>()
  private spreadA?: Phaser.GameObjects.Image
  private spreadB?: Phaser.GameObjects.Image
  private flat?: QuadLayer
  private stand?: QuadLayer
  private shadow?: QuadLayer
  private leaf?: QuadLayer
  private curl?: Phaser.GameObjects.Graphics
  private leafKeys: { front: string; back: string; page: number } | null = null
  private leafShadow: Quad | null = null
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
    this.spreadB = at(book.x0 * UNIT, book.y0 * UNIT).setDepth(SPREAD_DEPTH + 0.01).setVisible(false)
    this.flat = new QuadLayer(scene, FLAT_DEPTH)
    this.shadow = new QuadLayer(scene, SHADOW_DEPTH, SHADOW_ALPHA)
    this.stand = new QuadLayer(scene, STAND_DEPTH)
    this.leaf = new QuadLayer(scene, LEAF_DEPTH)
    this.curl = scene.add.graphics().setDepth(CURL_DEPTH)
    this.visuals.push(this.spreadA, this.spreadB, this.flat, this.shadow, this.stand, this.leaf, this.curl, this.ribbon(scene, book))
    const c = st.clock
    this.sheet(v, st, c.page)
    if (c.phase === 'warn' || c.phase === 'fold') this.sheet(v, st, c.page + 1)
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

  /** 用不着的页丢掉：只留此刻这一页与下一页 */
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
    // 立着的时候把下一页先画好，翻的时候就不用现画
    const old = c.phase === 'leaf' || c.phase === 'rest' || c.phase === 'pop' ? this.sheet(v, st, c.page - 1) : null
    if (c.phase === 'stand' ? c.at > 1500 : c.phase === 'warn' || c.phase === 'fold') this.sheet(v, st, c.page + 1)
    this.prune(v, c.page)
    this.ground(c, cur, old)
    this.pieces(cfg, c, cur, c.phase === 'leaf' ? old : null)
    this.leafTurn(v, c, cur, old)
    this.warnings(c)
    this.sounds(cfg, c, cur)
    this.hide(sim)
  }

  /** 页面：翻页那一阵右半边已是新页、左半边还是旧页，书页落下来才整张换成新页 */
  private ground(c: BookClock, cur: Sheet, old: Sheet | null): void {
    const a = this.spreadA!
    const b = this.spreadB!
    const book = this.book!
    const w = (book.x1 - book.x0) * UNIT
    const h = (book.y1 - book.y0) * UNIT
    if (a.texture.key !== cur.spreadKey) a.setTexture(cur.spreadKey)
    a.setDisplaySize(w, h)
    if (c.phase === 'leaf' && old) {
      if (b.texture.key !== old.spreadKey) b.setTexture(old.spreadKey)
      b.setDisplaySize(w, h).setCrop(0, 0, old.spread.width / 2, old.spread.height).setVisible(true)
    } else b.setVisible(false)
  }

  /** 这一刻要画的布景：立着的、正在倒或正在弹的画在身体后面，平躺的贴着页面，都投影子 */
  private pieces(cfg: StorybookConfig, c: BookClock, cur: Sheet, old: Sheet | null): void {
    const flat: Quad[] = []
    const stand: Quad[] = []
    const shade: Quad[] = []
    const gx = this.book!.gx
    const put = (sh: Sheet, side: number): void => {
      sh.page.pieces.forEach((p, i) => {
        if (side !== 0 && Math.sign(p.x - gx) !== side) return
        let lay = laid(cfg, c, sh.page.index, p)
        // 预兆时立着的布景跟着页角一起抖
        if (c.phase === 'warn') lay += Math.sin(c.at / 55 + p.seed) * 0.025 * clamp01(c.at / c.len)
        const out = lay > 0.97 ? flat : stand
        this.piece(sh, p, i, lay, out, shade)
      })
    }
    if (old) {
      put(old, -1)
      put(cur, 1)
    } else put(cur, 0)
    this.flat!.quads = flat
    this.stand!.quads = stand
    this.shadow!.quads = this.leafShadow ? shade.concat([this.leafShadow]) : shade
  }

  /** 一件布景的几块：影子、卡纸的厚边、盒子的侧面与顶面、正面 */
  private piece(sh: Sheet, p: Piece, i: number, lay: number, out: Quad[], shade: Quad[]): void {
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
      shade.push(quad(key, g(o.A), o.A, g(o.B), o.B, f, tw, th, SHADOW_COLOR, 1, true))
      if (p.box) {
        shade.push(quad(key, g(o.C), o.C, g(o.D), o.D, f, tw, th, SHADOW_COLOR, 1, true))
        shade.push(quad(key, g(o.C), g(o.A), g(o.D), g(o.B), sh.white, tw, th, SHADOW_COLOR, 1, true))
        shade.push(quad(key, o.C, o.A, o.D, o.B, sh.white, tw, th, SHADOW_COLOR, 1, true))
        shade.push(quad(key, g(o.D), o.D, g(o.B), o.B, sh.white, tw, th, SHADOW_COLOR, 1, true))
      }
    }
    // 迎着灯的面亮：立着的正面朝外偏一点就暗一点，平躺着最亮
    const lit = 0.84 + 0.16 * (1 - cos) + 0.05 * Math.max(0, -o.fx)
    if (p.box) {
      const r = sh.roofs[i]!
      out.push(quad(key, o.TC, o.TA, o.TD, o.TB, r, tw, th, grey(1.02), 1))
      const right = o.fy > 0 && Math.sin(p.a) > 0.01
      const left = Math.sin(p.a) < -0.01
      if (right) out.push(quad(key, o.TD, o.D, o.TB, o.B, sh.white, tw, th, 0x8f7a68, 1, true))
      if (left) out.push(quad(key, o.TA, o.A, o.TC, o.C, sh.white, tw, th, 0x8f7a68, 1, true))
    } else {
      // 卡纸的厚度：往后挪一点的同一张剪影，填成纸芯的颜色，露在顶边上
      const t = CARD_EDGE_U * UNIT
      const e = (q: Point): Point => ({ x: q.x - o.fx * t + 1, y: q.y - o.fy * t - t * 0.3 })
      out.push(quad(key, e(o.TA), e(o.A), e(o.TB), e(o.B), f, tw, th, 0xe9dcc0, 1, true))
    }
    out.push(quad(key, o.TA, o.A, o.TB, o.B, f, tw, th, grey(lit), 1))
  }

  /** 翻过去的书页：前半程是旧右页的正面，过了竖直是新左页的背面；地上铺着它的影子 */
  private leafTurn(v: ViewCtx, c: BookClock, cur: Sheet, old: Sheet | null): void {
    const layer = this.leaf!
    if (c.phase !== 'leaf' || !old) {
      layer.quads = []
      this.leafShadow = null
      this.leafKeys = null
      return
    }
    const book = this.book!
    if (!this.leafKeys || this.leafKeys.page !== cur.page.index) this.leafKeys = this.composeLeaf(v, old, cur)
    const p = easeInOut(clamp01(c.at / c.len))
    const th = Math.PI * p
    const W = (book.x1 - book.gx) * UNIT
    const gx = book.gx * UNIT
    const y0 = book.y0 * UNIT
    const y1 = book.y1 * UNIT
    const ex = gx + W * Math.cos(th)
    const lift = W * Math.sin(th) * LEAF_LIFT
    const front = th < Math.PI / 2
    const nx = front ? -Math.sin(th) : Math.sin(th)
    const nz = front ? Math.cos(th) : -Math.cos(th)
    const light = LEAF_LIGHT.min + (LEAF_LIGHT.max - LEAF_LIGHT.min) * clamp01(0.5 + 0.5 * (0.45 * -nx + 0.66 * nz) / 0.8)
    const key = front ? this.leafKeys.front : this.leafKeys.back
    const uv = front ? { u0: 0, uw: 1 } : { u0: 1, uw: -1 }
    layer.quads = [{ key, x: [gx, gx, ex, ex], y: [y0, y1, y0 - lift, y1 - lift], u0: uv.u0, v0: 1, uw: uv.uw, vh: -1, color: grey(light), alpha: 1, fill: false }]
    const sl = W * Math.sin(th) * SHADOW_PER_M * 1.4
    this.leafShadow = { key: '__WHITE', x: [gx, gx, ex + AWAY.x * sl, ex + AWAY.x * sl], y: [y0, y1, y0 + AWAY.y * sl, y1 + AWAY.y * sl], u0: 0, v0: 0, uw: 1, vh: 1, color: SHADOW_COLOR, alpha: 1, fill: true }
  }

  /** 翻页开始时拼出书页的两面：正面是旧页的右半边连同平躺的布景，背面是新页的左半边连同平躺的布景 */
  private composeLeaf(v: ViewCtx, old: Sheet, cur: Sheet): { front: string; back: string; page: number } {
    const book = this.book!
    const half = Math.round((book.gx - book.x0) * PRINT_PPU)
    const h = old.spread.height
    const n = this.serial++
    const make = (key: string, sh: Sheet, side: number): string => {
      canvasTexture(v.scene, key, half, h, (ctx) => {
        ctx.drawImage(sh.spread, side > 0 ? half : 0, 0, half, h, 0, 0, half, h)
        const ox = side > 0 ? book.gx : book.x0
        sh.page.pieces.forEach((p, i) => {
          if (Math.sign(p.x - book.gx) !== side) return
          const o = poseOf(p, 1)
          const k = PRINT_PPU / UNIT
          const to = (q: Point): Point => ({ x: q.x * k - ox * PRINT_PPU, y: q.y * k - book.y0 * PRINT_PPU })
          const lay = (cell: Cell, tl: Point, bl: Point, tr: Point): void => {
            const a = to(tl)
            const b = to(bl)
            const c = to(tr)
            ctx.setTransform((c.x - a.x) / cell.w, (c.y - a.y) / cell.w, (b.x - a.x) / cell.h, (b.y - a.y) / cell.h, a.x, a.y)
            ctx.drawImage(sh.atlas, cell.x, cell.y, cell.w, cell.h, 0, 0, cell.w, cell.h)
            ctx.setTransform(1, 0, 0, 1, 0, 0)
          }
          const roof = sh.roofs[i]
          if (roof) lay(roof, o.TC, o.TA, o.TD)
          lay(sh.faces[i]!, o.TA, o.A, o.TB)
        })
      })
      return key
    }
    for (const k of [this.leafKeys?.front, this.leafKeys?.back]) if (k && v.scene.textures.exists(k)) v.scene.textures.remove(k)
    return { front: make(`storybook-leaf-a-${n}`, old, 1), back: make(`storybook-leaf-b-${n}`, cur, -1), page: cur.page.index }
  }

  /** 预兆：右页的下角一点点翘起来、抖着 */
  private warnings(c: BookClock): void {
    const g = this.curl!.clear()
    const book = this.book!
    if (c.phase !== 'warn') return
    const p = clamp01(c.at / c.len)
    const s = (0.5 + (CURL_U - 0.5) * Math.sqrt(p) + Math.sin(c.at / 70) * 0.08 * p) * UNIT
    const x1 = book.x1 * UNIT
    const y1 = book.y1 * UNIT
    // 翘起来的地方露出底下一页的纸
    g.fillStyle(0xefe2c4, 1)
    g.fillTriangle(x1 - s, y1, x1, y1 - s, x1, y1)
    g.fillStyle(SHADOW_COLOR, 0.28)
    g.fillTriangle(x1 - s, y1, x1, y1 - s, x1 - s * 1.08, y1 - s * 1.08)
    // 翻过来的页角是书页的背面
    g.fillStyle(0xf7eedb, 1)
    g.fillTriangle(x1 - s, y1, x1, y1 - s, x1 - s * 0.94, y1 - s * 0.94)
    g.fillStyle(0xd9c9a6, 1)
    g.fillTriangle(x1 - s * 0.5, y1 - s * 0.5, x1 - s * 0.97, y1 - s * 0.03, x1 - s * 0.94, y1 - s * 0.94)
    g.lineStyle(0.03 * UNIT, 0x6b5536, 0.8)
    g.strokeTriangle(x1 - s, y1, x1, y1 - s, x1 - s * 0.94, y1 - s * 0.94)
  }

  /** 每进一段响一声：预兆时哗啦一声，书页翻起来呼地一声；每件布景折平、弹起时各响一下 */
  private sounds(cfg: StorybookConfig, c: BookClock, cur: Sheet): void {
    if (c.phase !== this.lastPhase) {
      this.lastPhase = c.phase
      if (c.phase === 'warn') playSfx('rustle')
      else if (c.phase === 'leaf') playSfx('leaf')
      this.flipped.clear()
    }
    if (c.phase !== 'fold' && c.phase !== 'pop') return
    cur.page.pieces.forEach((p, i) => {
      const lay = laid(cfg, c, cur.page.index, p)
      const key = `${cur.page.index}:${i}`
      if (this.flipped.has(key)) return
      if (c.phase === 'fold' ? lay > 0.5 : lay < 0.5) {
        this.flipped.add(key)
        playSfx(c.phase === 'fold' ? 'fold' : 'pop')
      }
    })
  }

  /** 站在立着的布景背后、被它的正面或顶面挡住的身体挪到最底下那一层画 */
  private hide(sim: Sim): void {
    const polys: { poly: Point[]; ax: number; ay: number; fx: number; fy: number }[] = []
    const st = sim.worldState.storybook!
    const c = st.clock
    const cfg = MAPS[sim.mapId].storybook!
    const sh = this.sheets.get(c.page)
    if (!sh) return
    for (const p of sh.page.pieces) {
      const lay = laid(cfg, c, c.page, p)
      if (lay > 0.9) continue
      const o = poseOf(p, lay)
      const poly = p.box ? [o.A, o.B, o.TB, o.TD, o.TC, o.TA] : [o.A, o.B, o.TB, o.TA]
      polys.push({ poly, ax: o.A.x, ay: o.A.y, fx: o.fx, fy: o.fy })
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
    for (const k of [this.leafKeys?.front, this.leafKeys?.back, BACK_KEY]) if (k && v.scene.textures.exists(k)) v.scene.textures.remove(k)
    this.leafKeys = null
  }
}
