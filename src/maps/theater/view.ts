import Phaser from 'phaser'
import { query } from 'bitecs'
import { UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { AWAY } from '../../data/light'
import { playSfx } from '../../audio/sfx'
import { Alive, Depth, ENEMY_SET, Transform } from '../../ecs/components'
import { LYING_Z, UNDER_Z } from '../../ecs/render/bands'
import { leaderPoint } from '../../ecs/utils/team'
import { FRAME_U } from '../../util/units'
import { canvasTexture } from '../textures'
import { FRAME, FRAME_MID } from '../frame'
import { drawFace, drawRoof, faceSize, FLAT_U_PER_M, roofSize, STAND_U_PER_M } from './art'
import { textureSize } from './backdrop'
import { canvasUv, QuadLayer } from './layer'
import { glare, lifted, slabOf, slid, trapsOf } from './model'
import { TheaterPainter } from './painter'
import { CARD_H_U, CARD_W_U, paintCard, paintDrop, paintMasking, paintFloor, paintSpot, PAINT_PPU } from './scenery'
import { stageFor, actAt } from './world'
import type { Quad } from './layer'
import type { Stage, StageClock, Act, Piece } from './model'
import type { PaintScene, PixelRect } from './backdrop'
import type { TheaterState } from './world'
import type { TheaterConfig } from '../../types/maps'
import type { Framing } from '../../ecs/lens'
import type { MapView, ViewCtx } from '../../ecs/views'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'

/** 方框外的底色：剧场里的暗处 */
const BG = 0x1c120c
const BACK_KEY = 'theater-back'
/** 开局最多几个线程分着画；贴图按这么多像素高的条分块交给线程 */
const PAINT_THREADS = 4
const STRIP_PX = 64
/**
 * 各层的深度：天幕、地布、幕牌、两边侧幕、落点的影子、布景投的影子、台上的布景；追光的白照在布景上、身体下面；
 * 吊在半空的布景与吊绳在谁头上，顶上的帷幔再盖住它们；换幕时光圈外暗下来，盖住所有东西
 */
const DROP_DEPTH = -0.95
const FLOOR_DEPTH = -0.9
const CARD_DEPTH = -0.8
const LEGS_DEPTH = -0.5
const MARK_DEPTH = -0.45
const SHADOW_DEPTH = -0.4
const STAND_DEPTH = 2.7
const SPOT_DEPTH = 2.85
const FLY_DEPTH = 63
const VALANCE_DEPTH = 64
const DARK_DEPTH = 65
/** 影子的浓度，每米高的东西影子铺多长（格） */
const SHADOW_ALPHA = 0.3
const SHADOW_PER_M = STAND_U_PER_M * 0.75
const SHADOW_COLOR = 0x3b2614
/** 卡纸的厚度在画面上露出多少，格 */
const CARD_EDGE_U = 0.06
/** 活门多大，格 */
const TRAP_U = 1.3
/** 天幕多高（画面上，格），离台后沿多远；吊上去时一路升到方框外 */
const DROP_H_U = 9.4
const DROP_GAP_U = 0.25
/** 幕牌立在台口左前方：离台面左边、台口多远，格 */
const CARD_DX_U = 0.4
const CARD_DY_U = 2.9
/** 吊着的布景晃多大（格）、多快（毫秒一个来回的 2π 分之一） */
const SWAY_U = 0.18
const SWAY_MS = 260
/** 离台面不到这么高（占吊起来的比例）就算落在台上，画在身体后面 */
const LANDED = 0.02
/**
 * 换幕时的灯：台上暗下来，只留一束追光跟着队长；追光半径、边上糊开多宽（格），光圈外最暗时多暗（不全黑）；
 * 光圈里白得发亮，压一层多浓的白：推景时光圈里看得出在换，但白花花的不显眼
 */
const SPOT_U = 4.5
const SPOT_SOFT_U = 3.5
const DARK_MAX = 0.78
const WASH_MAX = 0.6
const DARK_KEY = 'theater-dark'
const SPOT_KEY = 'theater-spot'
const LEGS_KEY = 'theater-legs'
const VALANCE_KEY = 'theater-valance'
/** 推景时两幅景接缝的影子多宽，格 */
const SEAM_U = 0.25
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

/** 一幕画好的东西：画好的地布（画布与贴图名）、天幕、幕牌，布景的图集，每件的正面、顶面在图集里的位置 */
interface Sheet {
  readonly act: Act
  readonly floor: HTMLCanvasElement
  readonly floorKey: string
  readonly dropKey: string
  readonly cardKey: string
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


/** 整件挪 (dx, dy) 像素 */
function liftPose(o: Pose, dx: number, dy: number): Pose {
  const m = (q: Point): Point => ({ x: q.x + dx, y: q.y + dy })
  return { ...o, A: m(o.A), B: m(o.B), TA: m(o.TA), TB: m(o.TB), C: m(o.C), D: m(o.D), TC: m(o.TC), TD: m(o.TD) }
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
 * 舞台剧：地布、台板、台口、乐池、观众席与两边的幕是开局在后台线程画好的贴图；每一幕的地布画在白底上、乘到粗布上，是一张贴图；
 * 布景的正面与盒子的顶面画进每幕一张图集，按倒下的程度贴在四边形上：立着的画在身体后面，平躺的贴着页面，影子画在页面上、整层按一个浓度叠。
 * 站在立着的布景背后、被它的正面挡住的身体挪到最底下那一层，露出来的只有高过布景的那截。
 * 换幕时台上暗下来，一束发白的追光跟着队长；旧布景挂着吊绳一件件升进帷幔后面，地布与天幕从右边侧幕后面推出新的一幅、把旧的推进左边侧幕，新布景一件件吊下来，落点先投下影子
 */
export class TheaterView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private painter?: TheaterPainter
  private stage?: Stage
  private back?: HTMLCanvasElement
  private readonly sheets = new Map<number, Sheet>()
  private floorA?: Phaser.GameObjects.Image
  private floorB?: Phaser.GameObjects.Image
  private dropA?: Phaser.GameObjects.Image
  private dropB?: Phaser.GameObjects.Image
  private cardA?: Phaser.GameObjects.Image
  private cardB?: Phaser.GameObjects.Image
  private dark?: Phaser.GameObjects.Image
  private wash?: Phaser.GameObjects.Image
  private marks?: Phaser.GameObjects.Graphics
  private ropes?: Phaser.GameObjects.Graphics
  private stand?: QuadLayer
  private fly?: QuadLayer
  private shadow?: QuadLayer
  private readonly scratch = document.createElement('canvas')
  private readonly ink = document.createElement('canvas')
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

  /** 台上的小东西都画在地布上了 */
  decor(): void {}

  private cfg(v: ViewCtx): TheaterConfig {
    return v.def.theater!
  }

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const st = sim.worldState.theater
    if (!st) return
    const scene = v.scene
    const stage = stageFor(this.cfg(v), v.run.decorSeed)
    this.stage = stage
    const sc: PaintScene = { x0: stage.x0, x1: stage.x1, y0: stage.y0, y1: stage.y1, seed: stage.seed }
    const size = textureSize()
    const tex = canvasTexture(scene, BACK_KEY, size.w, size.h)
    const painter = new TheaterPainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
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
    const img = (depth: number): Phaser.GameObjects.Image => scene.add.image(0, 0, '__WHITE').setOrigin(0, 0).setDepth(depth)
    this.floorA = img(FLOOR_DEPTH).setPosition(stage.x0 * UNIT, stage.y0 * UNIT)
    this.floorB = img(FLOOR_DEPTH + 0.01).setPosition(stage.x0 * UNIT, stage.y0 * UNIT).setVisible(false)
    this.dropA = img(DROP_DEPTH)
    this.dropB = img(DROP_DEPTH + 0.01).setVisible(false)
    this.cardA = img(CARD_DEPTH).setPosition((stage.x0 + CARD_DX_U) * UNIT, (stage.y1 + CARD_DY_U) * UNIT)
    this.cardB = img(CARD_DEPTH + 0.01).setPosition((stage.x0 + CARD_DX_U) * UNIT, (stage.y1 + CARD_DY_U) * UNIT).setVisible(false)
    const scratch = document.createElement('canvas')
    paintSpot(256, scratch)
    canvasTexture(scene, SPOT_KEY, 256, 256, (ctx) => ctx.drawImage(scratch, 0, 0))
    for (const [key, part, depth] of [[LEGS_KEY, 'legs', LEGS_DEPTH], [VALANCE_KEY, 'valance', VALANCE_DEPTH]] as const) {
      paintMasking(stage, FRAME_U, part, scratch)
      canvasTexture(scene, key, scratch.width, scratch.height, (ctx) => ctx.drawImage(scratch, 0, 0))
      this.visuals.push(scene.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(FRAME_U * UNIT, FRAME_U * UNIT).setDepth(depth))
    }
    const n = 512
    const span = FRAME_U * 3
    canvasTexture(scene, DARK_KEY, n, n, (ctx) => {
      const g = ctx.createRadialGradient(n / 2, n / 2, (SPOT_U / span) * n, n / 2, n / 2, ((SPOT_U + SPOT_SOFT_U) / span) * n)
      g.addColorStop(0, 'rgba(10,5,16,0)')
      g.addColorStop(1, 'rgba(10,5,16,1)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, n, n)
    })
    this.dark = scene.add.image(0, 0, DARK_KEY).setDepth(DARK_DEPTH).setDisplaySize(span * UNIT, span * UNIT).setVisible(false)
    const wr = (SPOT_U + SPOT_SOFT_U * 0.6) * 2 * UNIT
    this.wash = scene.add.image(0, 0, SPOT_KEY).setDepth(SPOT_DEPTH).setDisplaySize(wr, wr).setVisible(false)
    this.marks = scene.add.graphics().setDepth(MARK_DEPTH)
    this.ropes = scene.add.graphics().setDepth(FLY_DEPTH - 0.01)
    this.shadow = new QuadLayer(scene, SHADOW_DEPTH, SHADOW_ALPHA)
    this.stand = new QuadLayer(scene, STAND_DEPTH)
    this.fly = new QuadLayer(scene, FLY_DEPTH)
    this.visuals.push(this.floorA, this.floorB, this.dropA, this.dropB, this.cardA, this.cardB, this.dark, this.wash, this.marks, this.ropes, this.shadow, this.stand, this.fly, this.traps(scene, stage))
    const c = st.clock
    this.sheet(v, st, c.act)
    if (c.phase === 'change') this.sheet(v, st, c.act - 1)
    this.lastPhase = c.phase
    this.ready = true
    v.lens.screen.vignette(0.85, 0.3, 0x0c0608)
  }

  /** 台中线上的几扇活门：地布上剪开的方口，四边一道深缝，一边两个合页 */
  private traps(scene: Phaser.Scene, stage: Stage): Phaser.GameObjects.Graphics {
    const g = scene.add.graphics().setDepth(MARK_DEPTH - 0.01)
    const h = TRAP_U / 2
    for (const t of trapsOf(stage)) {
      const x = t.x * UNIT
      const y = t.y * UNIT
      g.fillStyle(SHADOW_COLOR, 0.12).fillRect(x - h * UNIT, y - h * UNIT, TRAP_U * UNIT, TRAP_U * UNIT)
      g.lineStyle(0.06 * UNIT, 0x3b2614, 0.55).strokeRect(x - h * UNIT, y - h * UNIT, TRAP_U * UNIT, TRAP_U * UNIT)
      g.fillStyle(0x6b6f78, 0.8)
      for (const k of [-0.5, 0.5]) g.fillRect(x - h * UNIT - 0.06 * UNIT, y + k * h * UNIT - 0.12 * UNIT, 0.14 * UNIT, 0.24 * UNIT)
    }
    return g
  }

  /** 第几页画好的东西：没画过就现画 */
  private sheet(v: ViewCtx, st: TheaterState, index: number): Sheet {
    let s = this.sheets.get(index)
    if (s) return s
    const stage = this.stage!
    const act = actAt(st, this.cfg(v), index)
    const n = this.serial++
    const w = Math.round((stage.x1 - stage.x0) * PAINT_PPU)
    const h = Math.round((stage.y1 - stage.y0) * PAINT_PPU)
    paintFloor(act, stage, this.ink)
    const scratch = document.createElement('canvas')
    const dropKey = `theater-drop-${n}`
    paintDrop(act.chapter, act.seed, stage.x1 - stage.x0, DROP_H_U, scratch)
    canvasTexture(v.scene, dropKey, scratch.width, scratch.height, (ctx) => ctx.drawImage(scratch, 0, 0))
    const cardKey = `theater-card-${n}`
    paintCard(act.chapter, scratch)
    canvasTexture(v.scene, cardKey, scratch.width, scratch.height, (ctx) => ctx.drawImage(scratch, 0, 0))
    const floorKey = `theater-floor-${n}`
    const floorTex = canvasTexture(v.scene, floorKey, w, h, (ctx) => {
      ctx.drawImage(this.back!, stage.x0 * GROUND_PPU, stage.y0 * GROUND_PPU, w, h, 0, 0, w, h)
      ctx.globalCompositeOperation = 'multiply'
      ctx.drawImage(this.ink, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
    })
    // 图集：左上角一小块纯白（填色用），再一排排放正面与顶面
    const faces: Cell[] = []
    const roofs: (Cell | null)[] = []
    const want: { w: number; h: number }[] = []
    for (const p of act.pieces) {
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
    const atlasKey = `theater-atlas-${n}`
    let k = 0
    const atlasTex = canvasTexture(v.scene, atlasKey, ATLAS_W, ah, (ctx) => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 12, 12)
      for (const p of act.pieces) {
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
      act,
      floor: floorTex.getSourceImage() as HTMLCanvasElement,
      floorKey,
      dropKey,
      cardKey,
      atlas: atlasTex.getSourceImage() as HTMLCanvasElement,
      atlasKey,
      faces,
      roofs,
      white: { x: 2, y: 2, w: 8, h: 8 },
    }
    this.sheets.set(index, s)
    return s
  }

  /** 用不着的幕丢掉：只留上一幕、此刻这一幕与下一幕 */
  private prune(v: ViewCtx, keep: number): void {
    for (const [i, s] of this.sheets) {
      if (i === keep || i === keep + 1 || i === keep - 1) continue
      for (const key of [s.floorKey, s.dropKey, s.cardKey, s.atlasKey]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
      this.sheets.delete(i)
    }
  }

  step(v: ViewCtx, sim: Sim, _delta: number): void {
    const st = sim.worldState.theater
    if (!st || !this.ready || !this.stage) return
    const cfg = this.cfg(v)
    const c = st.clock
    const cur = this.sheet(v, st, c.act)
    const old = c.phase === 'change' ? this.sheet(v, st, c.act - 1) : null
    // 演着的时候把下一幕先画好，换幕时就不用现画
    if (c.phase === 'stand' && c.at > 1500) this.sheet(v, st, c.act + 1)
    this.prune(v, c.act)
    this.scenery(cfg, c, cur, old)
    const shown = old ? [old, cur] : [cur]
    this.pieces(cfg, c, shown)
    this.lights(cfg, c, sim)
    this.sounds(cfg, c, shown)
    this.hide(sim, cfg, c, shown)
  }

  /** 地布、天幕与幕牌：换幕时新的地布与天幕从右边侧幕后面推出来、把旧的推进左边侧幕后面，幕牌跟着淡过去 */
  private scenery(cfg: TheaterConfig, c: StageClock, cur: Sheet, old: Sheet | null): void {
    const stage = this.stage!
    const W = (stage.x1 - stage.x0) * UNIT
    const H = (stage.y1 - stage.y0) * UNIT
    const u = old ? slid(cfg, c) : 1
    const x0 = stage.x0 * UNIT
    this.marks!.clear()
    const dropY = (stage.y0 - DROP_GAP_U - DROP_H_U) * UNIT
    const dh = DROP_H_U * UNIT
    // 一幅景只露出 [a, b) 那一段（占整幅的比例），露出来的那段摆在 at 起
    const show = (img: Phaser.GameObjects.Image, key: string, y: number, h: number, a: number, b: number, at: number): void => {
      if (img.texture.key !== key) img.setTexture(key)
      const tw = img.frame.width
      const th = img.frame.height
      img.setVisible(b - a > 0.0005).setDisplaySize(W, h).setPosition(at - a * W, y).setCrop(a * tw, 0, (b - a) * tw, th)
    }
    show(this.floorA!, (old ?? cur).floorKey, stage.y0 * UNIT, H, old ? u : 0, 1, x0)
    show(this.floorB!, cur.floorKey, stage.y0 * UNIT, H, 0, old ? u : 0, x0 + (1 - u) * W)
    show(this.dropA!, (old ?? cur).dropKey, dropY, dh, old ? u : 0, 1, x0)
    show(this.dropB!, cur.dropKey, dropY, dh, 0, old ? u : 0, x0 + (1 - u) * W)
    const cx = (stage.x0 + CARD_DX_U) * UNIT
    const cy = (stage.y1 + CARD_DY_U) * UNIT
    const card = (img: Phaser.GameObjects.Image, key: string, alpha: number): void => {
      if (img.texture.key !== key) img.setTexture(key)
      img.setPosition(cx, cy).setDisplaySize(CARD_W_U * UNIT, CARD_H_U * UNIT).setAlpha(alpha).setVisible(alpha > 0.001)
    }
    // 幕牌在推到一半时换过去，不叠着两幅字
    const flip = old ? Math.min(1, Math.max(0, (u - 0.45) / 0.1)) : 0
    card(this.cardA!, (old ?? cur).cardKey, 1 - flip)
    card(this.cardB!, cur.cardKey, flip)
    // 两幅景的接缝：新景的左边沿压着一道影子
    if (old && u > 0 && u < 1) {
      const sx = x0 + (1 - u) * W
      this.marks!.fillStyle(SHADOW_COLOR, 0.35)
      this.marks!.fillRect(sx - SEAM_U * UNIT, stage.y0 * UNIT, SEAM_U * UNIT, H)
      this.marks!.fillRect(sx - SEAM_U * UNIT, dropY, SEAM_U * UNIT, dh)
    }
  }

  /** 换幕时的灯：光圈外暗下来（不全黑），追光跟着队长，光圈里压一层白，照在地布与布景上、不压身体 */
  private lights(cfg: TheaterConfig, c: StageClock, sim: Sim): void {
    const k = glare(cfg, c)
    const lead = leaderPoint(sim)
    this.dark!.setVisible(k > 0.001).setAlpha(k * DARK_MAX).setPosition(lead.x, lead.y)
    this.wash!.setVisible(k > 0.001).setAlpha(k * WASH_MAX).setPosition(lead.x, lead.y)
  }

  /**
   * 这一刻要画的布景：落在台上的画在身体后面、投影子；吊在半空的挂着两根吊绳、微微晃着，画在谁头上，
   * 落点先投下一块影子，越低越浓
   */
  private pieces(cfg: TheaterConfig, c: StageClock, shown: readonly Sheet[]): void {
    const stand: Quad[] = []
    const fly: Quad[] = []
    const shade: Quad[] = []
    const marks = this.marks!
    const ropes = this.ropes!.clear()
    for (const sh of shown) {
      sh.act.pieces.forEach((p, i) => {
        const lift = lifted(cfg, c, sh.act.index, p)
        if (lift >= 1) return
        if (lift < LANDED) {
          this.piece(sh, p, i, stand, shade, 0, 0)
          return
        }
        const rise = lift * (p.y + p.h * STAND_U_PER_M + 2) * UNIT
        const dx = Math.sin(c.at / SWAY_MS + p.seed) * SWAY_U * lift * UNIT
        const o = this.piece(sh, p, i, fly, null, rise, dx)
        ropes.lineStyle(0.04 * UNIT, 0x2a1d18, 0.9)
        for (const q of [o.TA, o.TB]) ropes.lineBetween(q.x + dx, q.y - rise, q.x + dx * 0.2, -FRAME_U * UNIT)
        const sl = slabOf(p)
        marks.fillStyle(SHADOW_COLOR, 0.45 * (1 - lift) ** 2)
        marks.fillEllipse(sl.cx * UNIT, sl.cy * UNIT, (p.w + 0.6) * UNIT * (1.3 - 0.3 * lift), (sl.hd * 2 + 0.9) * UNIT * (1.3 - 0.3 * lift))
      })
    }
    this.stand!.quads = stand
    this.fly!.quads = fly
    this.shadow!.quads = shade
  }

  /** 一件立着的布景的几块：影子（落在台上才有）、卡纸的厚边、盒子的侧面与顶面、正面；吊着的整件往上挪 rise、往旁边晃 dx（像素） */
  private piece(sh: Sheet, p: Piece, i: number, out: Quad[], shade: Quad[] | null, rise: number, dx: number): Pose {
    const tw = sh.atlas.width
    const th = sh.atlas.height
    const key = sh.atlasKey
    const f = sh.faces[i]!
    const at = poseOf(p, 0)
    const o = rise === 0 && dx === 0 ? at : liftPose(at, dx, -rise)
    const cos = 1
    const alpha = 1
    // 影子：顶边顺着背光的方向铺到地上
    const sl = p.h * SHADOW_PER_M * Math.max(0, cos) * UNIT
    if (shade && sl > 0.5) {
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
    return o
  }

  /** 每件布景起吊时吊绳一响，落到台上时咚一声 */
  private sounds(cfg: TheaterConfig, c: StageClock, shown: readonly Sheet[]): void {
    if (c.phase !== this.lastPhase) {
      this.lastPhase = c.phase
      this.flipped.clear()
    }
    if (c.phase !== 'change') return
    for (const sh of shown) {
      const fresh = sh.act.index === c.act
      sh.act.pieces.forEach((p, i) => {
        const key = `${sh.act.index}:${i}`
        if (this.flipped.has(key)) return
        const lift = lifted(cfg, c, sh.act.index, p)
        if (fresh ? lift < LANDED : lift > LANDED) {
          this.flipped.add(key)
          playSfx(fresh ? 'land' : 'hoist')
        }
      })
    }
  }

  /** 站在立着的布景背后、被它的正面或顶面挡住的身体挪到最底下那一层画 */
  private hide(sim: Sim, cfg: TheaterConfig, c: StageClock, shown: readonly Sheet[]): void {
    const polys: { poly: Point[]; ax: number; ay: number; fx: number; fy: number }[] = []
    for (const sh of shown) {
      for (const p of sh.act.pieces) {
        if (lifted(cfg, c, sh.act.index, p) >= LANDED) continue
        const o = poseOf(p, 0)
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
    for (const s of this.sheets.values()) for (const key of [s.floorKey, s.dropKey, s.cardKey, s.atlasKey]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
    this.sheets.clear()
    for (const k of [BACK_KEY, SPOT_KEY, DARK_KEY, LEGS_KEY, VALANCE_KEY]) if (v.scene.textures.exists(k)) v.scene.textures.remove(k)
  }
}
