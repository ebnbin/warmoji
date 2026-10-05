import Phaser from 'phaser'
import { FRAME_U, UNIT } from '../../util/units'
import { rollDecor } from '../../data/maps'
import { GROUND_PPU } from '../../data/texel'
import { viewport } from '../../util/apply'
import { Rng } from '../../util/rng'
import { fbm } from '../../util/noise'
import { devFlag } from '../../devtools'
import { decorSprite } from '../decor'
import type { Decor } from '../decor'
import { canopySize, drawCanopy, CANOPY_PPU } from './canopy'
import { DesertPainter } from './painter'
import { encodeInfo, GROUND_FRAG } from './shader'
import { HEIGHT_SPAN, newTrackTex, stampPrint, TIME_QUANT, TRACK_TILE } from './stamp'
import { desertOf } from './world'
import { wrapU } from './terrain'
import type { PixelRect } from './ground'
import type { DesertPlan, Landmark } from './terrain'
import type { Solid } from './landmarks'
import type { TrackTex } from './stamp'
import type { DesertState } from './world'
import type { EcsAtlas } from '../atlas'
import type { MapView, ViewCtx } from '../views'
import { FRAME, FRAME_MID } from '../frame'
import type { Framing } from '../lens'
import type { Sim } from '../sim'
import type { DesertConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

const BG = 0xbb9157
const GROUND_KEY = 'desert-ground'
const TRACKS_KEY = 'desert-tracks'
const INFO_KEY = 'desert-info'
const CANOPY_KEY = 'desert-canopy'
const DUST_KEY = 'desert-dust'
/** 开局最多几个线程分着画沙地 */
const PAINT_THREADS = 4
/** 沙地按这么多像素高的条分块交给线程 */
const STRIP_PX = 32
/** 地面四边形比镜头拍到的范围宽出这么多格：镜头一晃也盖得住 */
const GROUND_PAD_U = 6
/** 印子贴图最快隔这么久（毫秒）重传一次改过的块 */
const TRACK_UPLOAD_MS = 50
/** 树冠、破布条与它们的影子画在实体的上面与下面 */
const CANOPY_DEPTH = 20
const RAG_DEPTH = 21
const RAG_SHADOW_DEPTH = -0.5
/** 开发工具里"显示碰撞边界"的开关：打开时标志物挡人的轮廓和别的地图的岩壁一样勾在一切之上 */
const WALLS_FLAG = 'battle.walls'
const WALLS_DEPTH = 1001
/** 脚下扬起的沙每格²每秒最多这么多团：人多的时候不糊成一片，一圈里各处一样 */
const PUFFS_PER_U2_S = 0.18

/** 一样标志物在画面上的东西：树冠或杆头的图，杆子顶上的破布条 */
interface LandmarkFx {
  readonly land: Landmark
  readonly img: Phaser.GameObjects.Image | null
  readonly rag: Point | null
  readonly phase: number
}

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw?: (ctx: CanvasRenderingContext2D) => void): Phaser.Textures.CanvasTexture {
  if (scene.textures.exists(key)) scene.textures.remove(key)
  const tex = scene.textures.createCanvas(key, w, h)!
  if (draw) draw(tex.getContext())
  upload(tex)
  return tex
}

/** 把画布传上显卡并按线性插值采样：每次上传都会把过滤重设成游戏的默认值，高分屏开了 pixelArt 就是最近点，所以上传完要重新设 */
function upload(tex: Phaser.Textures.CanvasTexture): void {
  tex.refresh()
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
}

/** 贴图上换一块像素：画布跟着换（显卡丢了上下文时 Phaser 拿整张画布重建），显卡上只重传这一块 */
function patchTexture(scene: Phaser.Scene, tex: Phaser.Textures.CanvasTexture, img: ImageData, x: number, y: number): void {
  tex.getContext().putImageData(img, x, y)
  const r = scene.renderer
  const gt = tex.source[0]!.glTexture
  if (!(r instanceof Phaser.Renderer.WebGL.WebGLRenderer) || !gt || r.gl.isContextLost()) return
  const gl = r.gl
  r.glTextureUnits.bind(gt, 0)
  r.glWrapper.updateTexturing({ texturing: { flipY: gt.flipY, premultiplyAlpha: gt.pma } })
  gl.texSubImage2D(gl.TEXTURE_2D, 0, x, gt.flipY ? gt.height - y - img.height : y, gl.RGBA, gl.UNSIGNED_BYTE, img)
}

/** 勾一段挡人的胶囊：(cx, cy) 是标志物中心（像素） */
function strokeSolid(g: Phaser.GameObjects.Graphics, cx: number, cy: number, s: Solid): void {
  const x0 = cx + s.x0 * UNIT
  const y0 = cy + s.y0 * UNIT
  const x1 = cx + s.x1 * UNIT
  const y1 = cy + s.y1 * UNIT
  const r = s.r * UNIT
  const a = Math.atan2(y1 - y0, x1 - x0)
  g.beginPath()
  g.arc(x1, y1, r, a - Math.PI / 2, a + Math.PI / 2, false)
  g.arc(x0, y0, r, a + Math.PI / 2, a + (Math.PI * 3) / 2, false)
  g.closePath()
  g.strokePath()
}

/** 一团扬起的沙尘：边缘被噪声扰得参差，里面一絮一絮的浓淡；贴图边上一定透明 */
function drawDust(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - c, y - c) / c
      const d = r * (1 + (0.5 - fbm(x / 10, y / 10, 71, 4)) * 0.8)
      const a = Math.min(1, Math.max(0, 1 - d) ** 1.2 * (0.6 + 0.55 * fbm(x / 6, y / 6, 73, 3))) * Math.min(1, Math.max(0, 1 - r) * 3)
      const o = (y * size + x) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = a * 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * 沙漠：地面是一张后台线程画好、四方连续的沙地贴图，由跟着镜头走的着色器按一圈平铺，镜头连续地跟着队长、看不到边；
 * 印子画在另一张首尾相接的贴图里，有人踩下去就盖上一笔、只重传改过的块，着色器按太阳打出阴阳面、按过了多久把它们慢慢抹平。
 * 枯树的枝杈与路标杆头画在实体上面，杆头的破布条顺着风飘、影子落在杆影的尽头；脚下扬起一小团沙
 */
export class DesertView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  /** 布景与它在一圈里的原位：画的是离镜头最近的那一份 */
  private spots: { readonly s: Decor; readonly x: number; readonly y: number }[] = []
  private painter?: DesertPainter
  private ground?: Phaser.GameObjects.Shader
  private tracks?: { tex: Phaser.Textures.CanvasTexture; data: TrackTex; at: number }
  private readonly u = { rect: [0, 0, 1, 1], track: [1, HEIGHT_SPAN, TIME_QUANT, 0] }
  private marks: LandmarkFx[] = []
  private ragGfx?: Phaser.GameObjects.Graphics
  private ragShadow?: Phaser.GameObjects.Graphics
  private solidGfx?: Phaser.GameObjects.Graphics
  private puffs?: Phaser.GameObjects.Particles.ParticleEmitter
  private puffBudget = 0

  private cfgOf(v: ViewCtx): DesertConfig {
    return v.def.desert!
  }

  /** 一圈就是方框，出发点在一圈的正中 */
  layout(): { w: number; h: number; origin: Point } {
    return { w: FRAME.w, h: FRAME.h, origin: FRAME_MID }
  }

  build(v: ViewCtx): void {
    const scene = v.scene
    this.visuals.push(v.lens.screen.cover(scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-3)))
    if (!scene.textures.exists(DUST_KEY)) canvasTexture(scene, DUST_KEY, 64, 64, (ctx) => drawDust(ctx, 64))
  }

  /** 四边首尾相接：跟随时连续地跟着队长、不设边，固定取景时正好拍一圈 */
  framing(): Framing {
    return { map: FRAME, edge: 'wrap' }
  }

  /** 屏幕太宽时拉近：看到的长边不超过 viewMaxU 格 */
  followZoom(v: ViewCtx): number {
    const longU = Math.max(viewport.logicalWidth, viewport.logicalHeight) / UNIT
    return Math.max(1, longU / this.cfgOf(v).viewMaxU)
  }

  /** 布景也成对：横竖各隔半圈再摆一份，和沙丘、标志物一样分不出是哪一处 */
  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const rng = new Rng(v.run.decorSeed)
    const n = FRAME_U
    for (const d of rollDecor(v.def.decor, () => rng.next(), n, n)) {
      for (const k of [0, n / 2]) {
        const s = decorSprite(atlas, d.emoji, ((d.xU + k) % n) * UNIT, ((d.yU + k) % n) * UNIT, d.sizeU * UNIT, d.rotation, d.alpha)
        v.decor.push(s)
        this.spots.push({ s, x: s.x, y: s.y })
      }
    }
  }

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const s = desertOf(sim)
    const plan = s.plan
    const cfg = this.cfgOf(v)
    const scene = v.scene
    const px = plan.sizeU * GROUND_PPU
    const tex = canvasTexture(scene, GROUND_KEY, px, px)
    const painter = new DesertPainter({ plan, ppu: GROUND_PPU }, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    // 沙地横竖各挪半圈一模一样：只画左半边，右半边就是左半边往下挪半圈
    const half = px / 2
    const rects: PixelRect[] = []
    for (let y = 0; y < px; y += STRIP_PX) rects.push({ x0: 0, y0: y, x1: half, y1: Math.min(px, y + STRIP_PX) })
    const ctx = tex.getContext()
    await painter.paint(rects, (p) => {
      const img = new ImageData(p.pixels, p.rect.x1 - p.rect.x0, p.rect.y1 - p.rect.y0)
      ctx.putImageData(img, p.rect.x0, p.rect.y0)
      ctx.putImageData(img, p.rect.x0 + half, (p.rect.y0 + half) % px)
    })
    painter.close()
    if (this.painter !== painter) return
    this.painter = undefined
    upload(tex)
    const info = encodeInfo(plan)
    canvasTexture(scene, INFO_KEY, plan.cols, plan.cols, (ctx) => ctx.putImageData(new ImageData(info, plan.cols, plan.cols), 0, 0))
    const data = newTrackTex(plan.sizeU, cfg.tracks.perU, cfg.tracks.lifeS)
    const tracks = canvasTexture(scene, TRACKS_KEY, data.cells, data.cells, (ctx) => ctx.putImageData(new ImageData(data.data, data.cells, data.cells), 0, 0))
    this.tracks = { tex: tracks, data, at: 0 }
    const u = this.u
    u.track[0] = data.cells
    const side = (cfg.viewMaxU + GROUND_PAD_U) * UNIT
    const sunLen = Math.hypot(plan.light.x, plan.light.y, plan.light.z)
    this.ground = v.lens.mainOnly(scene.add
      .shader(
        {
          name: 'DesertGround',
          fragmentSource: GROUND_FRAG,
          setupUniforms: (set: (name: string, value: unknown) => void) => {
            set('uSand', 0)
            set('uTracks', 1)
            set('uInfo', 2)
            set('uRect', u.rect)
            set('uPeriod', [plan.sizeU * UNIT, plan.sizeU * UNIT])
            set('uInfoN', plan.cols)
            set('uTrack', u.track)
            set('uScale', [plan.sizeU, plan.meterPerU, cfg.tracks.lifeS])
            set('uSun', [plan.light.x / sunLen, plan.light.y / sunLen, plan.light.z / sunLen])
          },
        },
        0,
        0,
        side,
        side,
        [GROUND_KEY, TRACKS_KEY, INFO_KEY],
      )
      .setOrigin(0, 0)
      .setDepth(-1))
    this.visuals.push(this.ground)
    this.landmarks(v, plan)
    this.ragShadow = scene.add.graphics().setDepth(RAG_SHADOW_DEPTH)
    this.ragGfx = scene.add.graphics().setDepth(RAG_DEPTH)
    this.puffs = scene.add
      .particles(0, 0, DUST_KEY, {
        lifespan: { min: 420, max: 760 },
        speed: { min: 6, max: 26 },
        scale: { start: 0.08, end: 0.3 },
        alpha: { start: 0.42, end: 0 },
        tint: [0xf6e3a6, 0xedcd86],
        emitting: false,
      })
      .setDepth(1.5)
    this.solidGfx = scene.add.graphics().setDepth(WALLS_DEPTH).setVisible(false)
    this.visuals.push(this.ragShadow, this.ragGfx, this.puffs, this.solidGfx)
    v.lens.screen.vignette(0.75, 0.12, 0x140a04)
    this.step(v, sim, 0)
  }

  /** 标志物：枯树与路标杆在实体上面画出枝杈与杆头；一对标志物共用一张图 */
  private landmarks(v: ViewCtx, plan: DesertPlan): void {
    const scene = v.scene
    const keys = new Map<object, string>()
    plan.landmarks.forEach((land, i) => {
      const sh = land.shape
      let img: Phaser.GameObjects.Image | null = null
      if (sh.kind === 'tree' || sh.kind === 'post') {
        let key = keys.get(sh)
        if (!key) {
          key = `${CANOPY_KEY}-${i}`
          const size = canopySize(sh)
          canvasTexture(scene, key, size, size, (ctx) => drawCanopy(ctx, sh, size, plan.light))
          keys.set(sh, key)
        }
        const size = canopySize(sh)
        img = scene.add.image(0, 0, key).setDisplaySize((size / CANOPY_PPU) * UNIT, (size / CANOPY_PPU) * UNIT).setDepth(CANOPY_DEPTH)
        this.visuals.push(img)
      }
      const pole = sh.kind === 'post' ? sh.limbs[0]! : null
      this.marks.push({ land, img, rag: pole ? { x: pole.x1, y: pole.y1 } : null, phase: i * 1.7 })
    })
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const s = sim.worldState.desert
    const g = this.ground
    if (!s || !g || !this.tracks) return
    const now = sim.elapsedMs
    const dt = Math.min(delta, 50) / 1000
    const view = v.lens.screen.view()
    const pad = GROUND_PAD_U * UNIT
    const x0 = view.x - pad / 2
    const y0 = view.y - pad / 2
    const w = view.w + pad
    const h = view.h + pad
    g.setPosition(x0, y0).setSize(w, h)
    const u = this.u
    u.rect[0] = x0
    u.rect[1] = y0
    u.rect[2] = w
    u.rect[3] = h
    u.track[3] = s.tracks.now
    this.stampTracks(v, s, dt)
    const mid = { x: view.x + view.w / 2, y: view.y + view.h / 2 }
    for (const p of this.spots) {
      p.s.x = mid.x + wrapU(p.x - mid.x, v.w)
      p.s.y = mid.y + wrapU(p.y - mid.y, v.h)
    }
    this.placeLandmarks(s, mid, now)
  }

  /** 把新踩的印子盖进贴图，改过的块攒一会儿再一起重传；松沙上的脚步扬起一小团沙 */
  private stampTracks(v: ViewCtx, s: DesertState, dt: number): void {
    const t = this.tracks!
    const at = s.tracks.now
    const cap = PUFFS_PER_U2_S * s.plan.sizeU * s.plan.sizeU
    this.puffBudget = Math.min(cap, this.puffBudget + dt * cap)
    for (const p of s.tracks.prints) {
      stampPrint(t.data, p, UNIT, at)
      if (this.puffBudget >= 1 && p.depth > 0.012 && p.gait !== 'slither') {
        this.puffBudget--
        this.puffs?.emitParticleAt(p.x, p.y, p.drag > 0.3 || p.gait === 'burrow' ? 2 : 1)
      }
    }
    s.tracks.prints.length = 0
    const now = performance.now()
    if (now - t.at < TRACK_UPLOAD_MS) return
    t.at = now
    const d = t.data
    for (let k = 0; k < d.dirty.length; k++) {
      if (!d.dirty[k]) continue
      d.dirty[k] = 0
      const tx = (k % d.tiles) * TRACK_TILE
      const ty = Math.floor(k / d.tiles) * TRACK_TILE
      const w = Math.min(TRACK_TILE, d.cells - tx)
      const h = Math.min(TRACK_TILE, d.cells - ty)
      const img = new ImageData(w, h)
      for (let row = 0; row < h; row++) img.data.set(d.data.subarray(((ty + row) * d.cells + tx) * 4, ((ty + row) * d.cells + tx + w) * 4), row * w * 4)
      patchTexture(v.scene, t.tex, img, tx, ty)
    }
  }

  /**
   * 每样标志物挪到离镜头最近的那一份上；破布条顺着盛行风飘，微风一阵紧一阵松，紧时飘得平、抖得急，影子落在杆影的尽头。
   * 打开了显示碰撞边界就把挡人的轮廓也勾在那一份上
   */
  private placeLandmarks(s: DesertState, mid: Point, now: number): void {
    const size = s.plan.sizeU * UNIT
    const rag = this.ragGfx!
    const shade = this.ragShadow!
    const walls = this.solidGfx!
    rag.clear()
    shade.clear()
    walls.clear()
    const showWalls = devFlag(WALLS_FLAG)
    walls.setVisible(showWalls)
    if (showWalls) walls.lineStyle(0.05 * UNIT, 0xff00ff, 1)
    const wx = Math.cos(s.plan.windAngle)
    const wy = Math.sin(s.plan.windAngle)
    const gust = 0.26 + 0.05 * Math.sin(now / 1700) + 0.03 * Math.sin(now / 430 + 1.1)
    for (const m of this.marks) {
      const x = mid.x + wrapU(m.land.x * UNIT - mid.x, size)
      const y = mid.y + wrapU(m.land.y * UNIT - mid.y, size)
      m.img?.setPosition(x, y)
      if (showWalls) for (const sol of m.land.shape.solids) strokeSolid(walls, x, y, sol)
      if (!m.rag) continue
      const pole = m.land.shape.limbs[0]!
      const top = pole.z1
      const tipX = x + m.rag.x * UNIT
      const tipY = y + m.rag.y * UNIT
      const pts: Point[] = []
      const n = 7
      const len = (0.34 + 0.12 * gust) * UNIT
      for (let k = 0; k <= n; k++) {
        const f = k / n
        const wave = Math.sin(now / (110 - 60 * gust) - f * 4.2 + m.phase) * f * (0.05 + 0.06 * (1 - gust)) * UNIT
        const droop = (1 - gust) * f * f * 0.12 * UNIT
        pts.push({ x: tipX + wx * len * f - wy * wave, y: tipY + wy * len * f + wx * wave + droop })
      }
      const ribbon = (g: Phaser.GameObjects.Graphics, ox: number, oy: number, color: number, a: number): void => {
        for (let k = 0; k < n; k++) {
          const w = (0.075 - 0.035 * (k / n)) * UNIT
          g.lineStyle(w, color, a)
          g.lineBetween(pts[k]!.x + ox, pts[k]!.y + oy, pts[k + 1]!.x + ox, pts[k + 1]!.y + oy)
        }
      }
      const off = s.plan
      ribbon(shade, off.offX * top * UNIT, off.offY * top * UNIT, 0x2a1a10, 0.28)
      ribbon(rag, 0, 0, 0xa8402c, 0.95)
      ribbon(rag, -0.012 * UNIT, -0.012 * UNIT, 0xd77a5c, 0.5)
    }
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    this.spots = []
    v.decor.length = 0
    this.marks = []
    this.ground = undefined
    this.tracks = undefined
    this.ragGfx = undefined
    this.ragShadow = undefined
    this.solidGfx = undefined
    this.puffs = undefined
    for (const key of [GROUND_KEY, TRACKS_KEY, INFO_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
    for (const key of v.scene.textures.getTextureKeys()) if (key.startsWith(CANOPY_KEY)) v.scene.textures.remove(key)
  }
}
