import Phaser from 'phaser'
import { removeEntity } from 'bitecs'
import { UNIT } from '../../util/units'
import { rollDecor } from '../../data/maps'
import { GROUND_PPU } from '../../data/texel'
import { viewport } from '../../util/apply'
import { Rng } from '../../util/rng'
import { playSfx } from '../../audio/sfx'
import { fbm } from '../../util/noise'
import { spawnDecor } from '../entities/decor'
import { canopySize, drawCanopy, CANOPY_PPU } from './canopy'
import { DesertPainter } from './painter'
import { encodeInfo, GROUND_FRAG } from './shader'
import { FILL_QUANT, HEIGHT_SPAN, newTrackTex, stampPrint, TRACK_TILE } from './stamp'
import { desertOf, desertPlanOf } from './world'
import { smooth, wrapU } from './terrain'
import type { PixelRect } from './ground'
import type { DesertPlan, Landmark } from './terrain'
import type { TrackTex } from './stamp'
import type { DesertState } from './world'
import type { EcsAtlas } from '../atlas'
import type { MapView, ViewCtx } from '../views'
import type { Sim } from '../sim'
import type { DesertConfig } from '../../types/maps'
import type { Point } from '../../util/vec'

const BG = 0x8a6a45
const GROUND_KEY = 'desert-ground'
const TRACKS_KEY = 'desert-tracks'
const INFO_KEY = 'desert-info'
const CANOPY_KEY = 'desert-canopy'
const GRAIN_KEY = 'desert-grain'
const DUST_KEY = 'desert-dust'
const HAZE_KEY = 'desert-haze'
/** 开局最多几个线程分着画沙地 */
const PAINT_THREADS = 4
/** 沙地按这么多像素高的条分块交给线程 */
const STRIP_PX = 32
/** 地面四边形比镜头最宽时还多出这么多格：镜头一晃也盖得住 */
const GROUND_PAD_U = 6
/** 印子贴图最快隔这么久（毫秒）重传一次改过的块 */
const TRACK_UPLOAD_MS = 50
/** 树冠、破布条与它们的影子画在实体的上面与下面 */
const CANOPY_DEPTH = 20
const RAG_DEPTH = 21
const RAG_SHADOW_DEPTH = -0.5
/** 沙暴的雾压在实体与特效上面、提示的箭头与伤害数字下面 */
const HAZE_DEPTH = 39
/** 脚下扬起的沙最多每秒这么多团：人多的时候不糊成一片 */
const PUFFS_PER_S = 40

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

/** 一粒被风吹着贴地跑的沙：头朝右、拖着尾巴的一道细亮线 */
function drawGrain(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const img = ctx.createImageData(w, h)
  const cy = (h - 1) / 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = x / (w - 1)
      const along = t < 0.85 ? t / 0.85 : (1 - t) / 0.15
      const across = Math.max(0, 1 - Math.abs(y - cy) / (h / 2))
      const o = (y * w + x) * 4
      img.data[o] = 255
      img.data[o + 1] = 255
      img.data[o + 2] = 255
      img.data[o + 3] = along ** 1.5 * across ** 1.6 * 255
    }
  }
  ctx.putImageData(img, 0, 0)
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

/** 沙暴的雾：中间淡、四周浓，盖住整个屏幕时边缘看不清 */
function drawHaze(ctx: CanvasRenderingContext2D, size: number): void {
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.5)
  g.addColorStop(0, 'rgba(255,255,255,0.2)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.62)')
  g.addColorStop(1, 'rgba(255,255,255,1)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
}

/**
 * 沙漠：地面是一张后台线程画好、四方连续的沙地贴图，由跟着镜头走的着色器按一圈平铺，镜头连续地跟着队长、看不到边；
 * 印子画在另一张首尾相接的贴图里，有人踩下去就盖上一笔、只重传改过的块，着色器按太阳打出阴阳面、按落下的沙把它们慢慢抹平。
 * 枯树的枝杈与路标杆头画在实体上面，杆头的破布条顺着风飘、影子落在杆影的尽头；起沙时沙粒贴地跑，脚下扬起一小团沙；
 * 沙暴来时风声大作，漫天黄沙，四周的雾浓得看不清，标志物隐没在里面
 */
export class DesertView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private decorEids: number[] = []
  private plan?: DesertPlan
  private painter?: DesertPainter
  private ground?: Phaser.GameObjects.Shader
  private tracks?: { tex: Phaser.Textures.CanvasTexture; data: TrackTex; at: number }
  private readonly u = { rect: [0, 0, 1, 1], time: 0, wind: [1, 0, 0, 0], storm: 0, track: [1, HEIGHT_SPAN, FILL_QUANT, 0], cam: [0, 0, 1] }
  private marks: LandmarkFx[] = []
  private ragGfx?: Phaser.GameObjects.Graphics
  private ragShadow?: Phaser.GameObjects.Graphics
  private grains?: Phaser.GameObjects.Particles.ParticleEmitter
  private dust?: Phaser.GameObjects.Particles.ParticleEmitter
  private puffs?: Phaser.GameObjects.Particles.ParticleEmitter
  private haze?: Phaser.GameObjects.Image
  private veil?: Phaser.GameObjects.Rectangle
  private vignette?: Phaser.Filters.Vignette
  private grainAcc = 0
  private dustAcc = 0
  private puffBudget = 0
  private storms = 0
  private roarAt = 0

  private cfgOf(v: ViewCtx): DesertConfig {
    return v.def.desert!
  }

  private sizeU(v: ViewCtx): number {
    return v.def.size!.w
  }

  private planOf(v: ViewCtx): DesertPlan {
    if (!this.plan) this.plan = desertPlanOf(this.cfgOf(v), this.sizeU(v), v.run.decorSeed)
    return this.plan
  }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const p = this.planOf(v)
    return { w: p.sizeU * UNIT, h: p.sizeU * UNIT, origin: { x: p.start.x * UNIT, y: p.start.y * UNIT } }
  }

  build(v: ViewCtx): void {
    const scene = v.scene
    this.visuals.push(scene.add.rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, BG).setScrollFactor(0).setDepth(-3))
    if (!scene.textures.exists(GRAIN_KEY)) canvasTexture(scene, GRAIN_KEY, 32, 8, (ctx) => drawGrain(ctx, 32, 8))
    if (!scene.textures.exists(DUST_KEY)) canvasTexture(scene, DUST_KEY, 64, 64, (ctx) => drawDust(ctx, 64))
    if (!scene.textures.exists(HAZE_KEY)) canvasTexture(scene, HAZE_KEY, 256, 256, (ctx) => drawHaze(ctx, 256))
  }

  /** 镜头连续地跟着队长、不设边；屏幕太宽时拉近，看到的长边不超过 viewMaxU 格 */
  camera(v: ViewCtx): void {
    const cam = v.scene.cameras.main
    const longU = Math.max(viewport.logicalWidth, viewport.logicalHeight) / UNIT
    cam.removeBounds()
    cam.setZoom(viewport.renderScale * Math.max(1, longU / this.cfgOf(v).viewMaxU))
    cam.startFollow(v.anchor)
  }

  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const rng = new Rng(v.run.decorSeed)
    const n = this.sizeU(v)
    for (const d of rollDecor(v.def.decor, () => rng.next(), n, n)) {
      this.decorEids.push(spawnDecor(v.world, atlas, { id: d.emoji, outline: 'player', x: d.xU * UNIT, y: d.yU * UNIT, size: d.sizeU * UNIT, rot: d.rotation, alpha: d.alpha, z: 1 }))
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
    const rects: PixelRect[] = []
    for (let y = 0; y < px; y += STRIP_PX) rects.push({ x0: 0, y0: y, x1: px, y1: Math.min(px, y + STRIP_PX) })
    await painter.paint(rects, (p) => tex.getContext().putImageData(new ImageData(p.pixels, p.rect.x1 - p.rect.x0, p.rect.y1 - p.rect.y0), p.rect.x0, p.rect.y0))
    painter.close()
    if (this.painter !== painter) return
    this.painter = undefined
    upload(tex)
    const info = encodeInfo(plan)
    canvasTexture(scene, INFO_KEY, plan.cols, plan.cols, (ctx) => ctx.putImageData(new ImageData(info, plan.cols, plan.cols), 0, 0))
    const data = newTrackTex(plan.sizeU, cfg.tracks.perU)
    const tracks = canvasTexture(scene, TRACKS_KEY, data.cells, data.cells, (ctx) => ctx.putImageData(new ImageData(data.data, data.cells, data.cells), 0, 0))
    this.tracks = { tex: tracks, data, at: 0 }
    const u = this.u
    u.track[0] = data.cells
    const side = (cfg.viewMaxU + GROUND_PAD_U) * UNIT
    const sunLen = Math.hypot(plan.light.x, plan.light.y, plan.light.z)
    this.ground = scene.add
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
            set('uTrack', u.track)
            set('uScale', [plan.sizeU, plan.meterPerU])
            set('uSun', [plan.light.x / sunLen, plan.light.y / sunLen, plan.light.z / sunLen])
            set('uTime', u.time)
            set('uWind', u.wind)
            set('uStorm', u.storm)
            set('uCam', u.cam)
          },
        },
        0,
        0,
        side,
        side,
        [GROUND_KEY, TRACKS_KEY, INFO_KEY],
      )
      .setOrigin(0, 0)
      .setDepth(-1)
    this.visuals.push(this.ground)
    this.landmarks(v, plan)
    this.ragShadow = scene.add.graphics().setDepth(RAG_SHADOW_DEPTH)
    this.ragGfx = scene.add.graphics().setDepth(RAG_DEPTH)
    this.grains = scene.add
      .particles(0, 0, GRAIN_KEY, {
        lifespan: { min: 300, max: 700 },
        alpha: { start: 0.7, end: 0 },
        tint: [0xf3dfb8, 0xe9cc98, 0xfff1d6],
        emitting: false,
      })
      .setDepth(2)
    this.dust = scene.add
      .particles(0, 0, DUST_KEY, {
        lifespan: { min: 2200, max: 3800 },
        scale: { start: 1.2, end: 3.4 },
        alpha: { start: 0.28, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: [0xc9a06a, 0xb98c58, 0xd8b583],
        emitting: false,
      })
      .setDepth(HAZE_DEPTH - 1)
    this.puffs = scene.add
      .particles(0, 0, DUST_KEY, {
        lifespan: { min: 420, max: 760 },
        speed: { min: 6, max: 26 },
        scale: { start: 0.08, end: 0.3 },
        alpha: { start: 0.42, end: 0 },
        tint: [0xd9b88a, 0xcaa574],
        emitting: false,
      })
      .setDepth(1.5)
    this.veil = scene.add.rectangle(viewport.logicalWidth / 2, viewport.logicalHeight / 2, 8000, 8000, 0xb88a55, 0).setScrollFactor(0).setDepth(HAZE_DEPTH).setVisible(false)
    this.haze = scene.add.image(viewport.logicalWidth / 2, viewport.logicalHeight / 2, HAZE_KEY).setScrollFactor(0).setDepth(HAZE_DEPTH + 0.1).setTint(0xc79a62).setAlpha(0).setVisible(false)
    this.visuals.push(this.ragShadow, this.ragGfx, this.grains, this.dust, this.puffs, this.veil, this.haze)
    this.vignette = scene.cameras.main.filters?.internal.addVignette(0.5, 0.5, 0.75, 0.2, 0x140a04)
    this.storms = s.storms
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
    const cfg = this.cfgOf(v)
    const now = sim.elapsedMs
    const dt = Math.min(delta, 50) / 1000
    const cam = v.scene.cameras.main
    const view = cam.worldView
    const mid = { x: view.centerX, y: view.centerY }
    const side = (cfg.viewMaxU + GROUND_PAD_U) * UNIT
    const x0 = mid.x - side / 2
    const y0 = mid.y - side / 2
    g.setPosition(x0, y0)
    const u = this.u
    u.rect[0] = x0
    u.rect[1] = y0
    u.rect[2] = side
    u.rect[3] = side
    u.time = now / 1000
    u.wind[0] = Math.cos(s.wind.angle)
    u.wind[1] = Math.sin(s.wind.angle)
    u.wind[2] = s.wind.speed
    u.wind[3] = s.wind.flux
    u.storm = s.wind.level
    u.track[3] = s.tracks.fill
    u.cam[0] = mid.x
    u.cam[1] = mid.y
    u.cam[2] = Math.hypot(view.width, view.height) / 2
    this.stampTracks(v, s, view, dt)
    this.placeLandmarks(v, s, mid, now)
    this.blow(v, s, view, dt)
    this.storm(v, s, now)
  }

  /** 把新踩的印子盖进贴图，改过的块攒一会儿再一起重传；镜头里松沙上的脚步扬起一小团沙 */
  private stampTracks(v: ViewCtx, s: DesertState, view: Phaser.Geom.Rectangle, dt: number): void {
    const t = this.tracks!
    const fill = s.tracks.fill
    this.puffBudget = Math.min(PUFFS_PER_S, this.puffBudget + dt * PUFFS_PER_S)
    for (const p of s.tracks.prints) {
      stampPrint(t.data, p, UNIT, fill)
      if (this.puffBudget >= 1 && p.depth > 0.012 && p.gait !== 'slither' && view.contains(p.x, p.y)) {
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

  /** 每样标志物挪到离镜头最近的那一份上；破布条顺着风飘，越大的风飘得越平、抖得越急，影子落在杆影的尽头 */
  private placeLandmarks(v: ViewCtx, s: DesertState, mid: Point, now: number): void {
    const size = s.plan.sizeU * UNIT
    const rag = this.ragGfx!
    const shade = this.ragShadow!
    rag.clear()
    shade.clear()
    const wx = Math.cos(s.wind.angle)
    const wy = Math.sin(s.wind.angle)
    const gust = Math.min(1, s.wind.speed / this.cfgOf(v).wind.stormMs)
    const hide = s.wind.level
    for (const m of this.marks) {
      const x = mid.x + wrapU(m.land.x * UNIT - mid.x, size)
      const y = mid.y + wrapU(m.land.y * UNIT - mid.y, size)
      const far = Math.min(1, Math.hypot(x - mid.x, y - mid.y) / (8 * UNIT))
      const alpha = 1 - 0.85 * hide * smooth(0.15, 1, far)
      m.img?.setPosition(x, y).setAlpha(alpha)
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
      ribbon(shade, off.offX * top * UNIT, off.offY * top * UNIT, 0x2a1a10, 0.28 * alpha * (1 - hide * 0.8))
      ribbon(rag, 0, 0, 0xa8402c, 0.95 * alpha)
      ribbon(rag, -0.012 * UNIT, -0.012 * UNIT, 0xd77a5c, 0.5 * alpha)
    }
  }

  /** 起沙的风把沙粒贴地吹着跑：每秒按镜头的面积与输沙率撒，从上风那边吹进来，顺着风拉成细线，风越紧拉得越长；沙暴时漫天扬起一团团沙尘 */
  private blow(v: ViewCtx, s: DesertState, view: Phaser.Geom.Rectangle, dt: number): void {
    const cfg = this.cfgOf(v)
    const px = UNIT / cfg.meterPerU
    const c = Math.cos(s.wind.angle)
    const sn = Math.sin(s.wind.angle)
    const flux = s.wind.flux
    const grains = this.grains!
    const run = s.wind.speed * px * 0.45
    grains.speedX = { min: c * run * 0.6 - 8, max: c * run * 1.2 + 8 }
    grains.speedY = { min: sn * run * 0.6 - 8, max: sn * run * 1.2 + 8 }
    grains.radial = false
    grains.particleRotate = (s.wind.angle * 180) / Math.PI
    grains.particleScaleX = 0.4 + 0.5 * Math.min(1.5, flux)
    grains.particleScaleY = 0.5
    this.grainAcc += dt * ((view.width * view.height) / (UNIT * UNIT)) * (0.04 + 2.6 * Math.min(1.5, flux))
    for (; this.grainAcc >= 1; this.grainAcc--) {
      const back = Math.random() * 0.3
      grains.emitParticleAt(view.x + Math.random() * view.width - c * back * view.width, view.y + Math.random() * view.height - sn * back * view.height, 1)
    }
    const dust = this.dust!
    const level = s.wind.level
    dust.speedX = { min: c * run * 0.35, max: c * run * 0.7 }
    dust.speedY = { min: sn * run * 0.35, max: sn * run * 0.7 }
    dust.radial = false
    dust.setParticleAlpha({ start: 0.4 * level, end: 0 })
    this.dustAcc += dt * level * level * 36
    for (; this.dustAcc >= 1; this.dustAcc--) {
      const back = 0.2 + Math.random() * 0.5
      dust.emitParticleAt(view.x + Math.random() * view.width - c * back * view.width, view.y + Math.random() * view.height - sn * back * view.height, 1)
    }
  }

  /** 沙暴：来时一阵风声；刮得越紧天越昏黄，四周的雾越浓，暗角越重 */
  private storm(v: ViewCtx, s: DesertState, now: number): void {
    if (s.storms !== this.storms) {
      this.storms = s.storms
      playSfx('gust')
      this.roarAt = now + v.def.desert!.wind.riseMs * 0.6
    }
    const level = s.wind.level
    if (level > 0.6 && now >= this.roarAt) {
      this.roarAt = now + 4200
      playSfx('squall')
    }
    const veil = this.veil!
    const haze = this.haze!
    veil.setFillStyle(0xb88a55, 0.22 * level).setVisible(level > 0.01)
    const big = Math.max(viewport.logicalWidth, viewport.logicalHeight) * 1.25
    haze.setPosition(viewport.logicalWidth / 2, viewport.logicalHeight / 2).setDisplaySize(big, big).setAlpha(0.85 * level * level).setVisible(level > 0.01)
    if (this.vignette) this.vignette.strength = 0.2 + 0.18 * level
  }

  resize(v: ViewCtx): void {
    this.camera(v)
  }

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    this.vignette = undefined
    for (const o of this.visuals) o.destroy()
    for (const eid of this.decorEids) removeEntity(v.world, eid)
    this.visuals = []
    this.decorEids = []
    this.marks = []
    this.ground = undefined
    this.tracks = undefined
    this.ragGfx = undefined
    this.ragShadow = undefined
    this.grains = undefined
    this.dust = undefined
    this.puffs = undefined
    this.haze = undefined
    this.veil = undefined
    for (const key of [GROUND_KEY, TRACKS_KEY, INFO_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
    for (const key of v.scene.textures.getTextureKeys()) if (key.startsWith(CANOPY_KEY)) v.scene.textures.remove(key)
  }
}
