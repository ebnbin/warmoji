import Phaser from 'phaser'
import { FRAME_U, UNIT } from '../../util/units'
import type { MapDef } from '../../types/maps'
import type { Point } from '../../util/vec'
import type { LocalLight } from '../../ecs/render/sprites'
import type { Sim } from '../../ecs/sim'
import { canvasTexture } from '../textures'
import { mix } from '../color'
import { drawCloud, drawGlint, drawHalo, layerPx, NEBULA_FRAG, NEBULA_PPU, sheetPx } from './render'
import type { NebulaSheet, SheetBand } from './render'
import { Cosmos } from './cosmos'
import type { CosmicLight } from './cosmos'
import { REMNANT_PX } from './remnants'
import { hue, planck, rgbInt } from './spectrum'
import type { Rgb } from './spectrum'
import { NebulaPainter } from './painter'
import { gravityAt, inHorizon as inNebulaHorizon, luminosity, MAX_FLARES } from './model'
import type { NebulaState } from './model'
import { SHADOW_RS, wallU } from './physics'
import { playSfx } from '../../audio/sfx'
import { loadSettings } from '../../save/settings'
import { browserStorage } from '../../util/storage'
import type { Framing, Screen } from '../../ecs/lens'
import { FRAME, FRAME_MID } from '../frame'
import { BoundedView } from '../../ecs/views'
import type { ViewCtx } from '../../ecs/views'

const NEBULA_BG = 0x020203
const NEBULA_SHEET_KEY = 'nebula-sheet'
const NEBULA_REMNANT_KEY = 'nebula-remnant'
const NEBULA_CLOUD_KEY = 'nebula-cloud'
const NEBULA_GLINT_KEY = 'nebula-glint'
const NEBULA_HALO_KEY = 'nebula-halo'
/** 光晕贴图的半径是阴影半径的几倍 */
const HALO_EDGE = 4
/** 照在身体与星尘上的吸积盘光取盘上这么热的一圈的颜色，以最热那一圈为 1 */
const DISK_LIGHT_K = 0.8
/** 吸积盘照在身体上的光比照在星尘上的弱多少 */
const DISK_ON_BODY = 0.6
/** 天象里的星照到星尘上、超新星照到身体上有多亮；超新星照在身体上最多这么亮 */
const STAR_ON_DUST = 4
const FLASH_ON_BODY = 0.5
const FLASH_MAX = 0.45
/** 开局最多几个线程分着画星云 */
const NEBULA_THREADS = 4
/** 着色器的曝光：光的强度乘它再按 1 − e^(−x) 压进画面 */
const NEBULA_EXPOSURE = 2.1
/** 星尘：多少粒，终端漂移 g·t 的停止时间（秒） */
const DUST_COUNT = 240
const DUST_STOP_S = 0.35
/** 被吞的身体拉成一条细流绕进黑洞，要多久，毫秒 */
const STREAM_MS = 750
/** 流星的尾巴：被吸积盘照着时多长、最长多长，格 */
const TAIL_U = 2.4
const TAIL_MAX_U = 7
/** 流星身后的热迹多久冷却到看不见，毫秒 */
const TRAIL_MS = 450

/** 流星飞过的一点，像素与经过的时刻 */
interface TrailPoint {
  readonly x: number
  readonly y: number
  readonly at: number
}

/** 一粒星尘，像素与像素/秒；albedo 是它反光的本事 */
interface Speck {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  albedo: number
}

/** 一条被潮汐拉长、绕进黑洞的细流 */
interface Stream {
  readonly x: number
  readonly y: number
  readonly at: number
  readonly gm: number
  readonly spin: number
}

/** 吸积盘照到 dU 格外有多亮，lum 是黑洞此刻的光度；1 算照满 */
function diskLight(lum: number, dU: number): number {
  return (lum * 9) / (dU * dU + 4)
}

/**
 * 星云：没有太阳。底下是球壳下半部的内壁、壳层的尘埃与外面的深空，由着色器按透视、黑洞的引力透镜、吸积盘的光与光回波画出来；
 * 内壁上此起彼伏地演着天象：恒星诞生、发光、死去，把周围的气体与尘埃照成各种颜色。
 * 黑洞是一块阴影，外面一圈光子环和正对着看的吸积盘，周围那圈被弯过来的星云光就是走不出来的地方。
 * 星尘按同一套引力往里漂，越近越快；被吞的身体拉成细流绕进去，吸积盘随之一亮。流星在内壁上先亮起来再冲进空腔，
 * 身后拖着冷却变红的热迹与背向黑洞的尾巴，照亮它经过的星云，扎进对面的壳层就碎掉
 */
export class NebulaView extends BoundedView {
  /** 黑洞在哪、此刻多亮：单位按它受光 */
  private hole?: { x: number; y: number; lum: number }
  /** 此刻最亮的一颗超新星：在哪（格，以球心为原点）、什么颜色、多亮 */
  private burst?: CosmicLight
  /** 球心，像素 */
  private center?: Point
  private painter?: NebulaPainter
  private cosmos?: Cosmos
  /** 吸积盘此刻照出去的光的颜色 */
  private disk: Rgb = [1, 1, 1]
  private diskTint = 0xffffff
  private readonly u = {
    time: 0,
    rs: 0,
    base: 1,
    flareT: [0, 0, 0, 0, 0, 0, 0, 0],
    flareK: [0, 0, 0, 0, 0, 0, 0, 0],
    meteor: [0, 0, 0, 0],
    glow: 1,
    hard: 0.5,
    disk: [1, 1, 1],
  }
  private halo?: Phaser.GameObjects.Image
  private dust: Speck[] = []
  private dustGfx?: Phaser.GameObjects.Graphics
  private streams: Stream[] = []
  private streamGfx?: Phaser.GameObjects.Graphics
  private tailGfx?: Phaser.GameObjects.Graphics
  private core?: Phaser.GameObjects.Image
  private coma?: Phaser.GameObjects.Image
  private trail: TrailPoint[] = []
  private knot?: Phaser.GameObjects.Image
  private wake?: Phaser.GameObjects.Particles.ParticleEmitter
  private sparks?: Phaser.GameObjects.Particles.ParticleEmitter
  private debris?: Phaser.GameObjects.Particles.ParticleEmitter
  private phase: 'none' | 'warn' | 'fly' = 'none'
  private shake = true

  layout(): { w: number; h: number; origin: Point } {
    return { w: FRAME.w, h: FRAME.h, origin: FRAME_MID }
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, NEBULA_BG).setDepth(-3)))
    const scene = v.scene
    if (!scene.textures.exists(NEBULA_CLOUD_KEY)) canvasTexture(scene, NEBULA_CLOUD_KEY, 64, 64, (ctx) => drawCloud(ctx, 64))
    if (!scene.textures.exists(NEBULA_GLINT_KEY)) canvasTexture(scene, NEBULA_GLINT_KEY, 32, 32, (ctx) => drawGlint(ctx, 32))
    if (!scene.textures.exists(NEBULA_HALO_KEY)) canvasTexture(scene, NEBULA_HALO_KEY, 256, 256, (ctx) => drawHalo(ctx, 256, HALO_EDGE))
    this.shake = loadSettings(browserStorage()).hitShake
  }

  /** 空腔里漂着的只有星尘，不撒布景 */
  decor(): void {}

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const s = sim.worldState.nebula
    if (!s) return
    const cfg = v.def.nebula!
    const scene = v.scene
    const L = s.layout
    const reach = FRAME_U / 2
    const sheet: NebulaSheet = {
      x0: -reach,
      y0: -reach,
      sizeU: reach * 2,
      innerU: cfg.shell.innerU,
      wallU: wallU(cfg.shell),
      outerU: cfg.shell.outerU,
      rise: cfg.shell.rise,
      holeX: (L.hx - L.cx) / UNIT,
      holeY: (L.hy - L.cy) / UNIT,
      seed: (v.run.decorSeed ^ 0x2b7) >>> 0,
      ppu: NEBULA_PPU,
    }
    const px = sheetPx(sheet)
    const tex = canvasTexture(scene, NEBULA_SHEET_KEY, px, px)
    const rem = canvasTexture(scene, NEBULA_REMNANT_KEY, REMNANT_PX, REMNANT_PX)
    const painter = new NebulaPainter(sheet, Math.max(1, Math.min(NEBULA_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const bands: SheetBand[] = []
    for (let r = 0; r < px; r += 8) bands.push({ layer: 'sheet', r0: r, r1: Math.min(px, r + 8) })
    for (let r = 0; r < REMNANT_PX; r += 16) bands.push({ layer: 'remnant', r0: r, r1: Math.min(REMNANT_PX, r + 16) })
    await painter.paint(bands, (p) => {
      const to = p.band.layer === 'sheet' ? tex : rem
      to.getContext().putImageData(new ImageData(p.pixels, layerPx(sheet, p.band.layer), p.band.r1 - p.band.r0), 0, p.band.r0)
    })
    if (this.painter !== painter) return
    tex.refresh()
    rem.refresh()
    const cosmos = new Cosmos((v.run.decorSeed ^ 0x636f) >>> 0, sheet.wallU)
    this.cosmos = cosmos
    this.center = { x: L.cx, y: L.cy }
    const u = this.u
    const x0 = L.cx - reach * UNIT
    const y0 = L.cy - reach * UNIT
    const side = reach * 2 * UNIT
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'NebulaSky',
            fragmentSource: NEBULA_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uNeb', 0)
              set('uRem', 1)
              set('uTime', u.time)
              set('uRect', [x0, y0, side, side])
              set('uUnit', UNIT)
              set('uCenter', [L.cx, L.cy])
              const view = v.lens.screen.view()
              set('uCam', [view.x + view.w / 2, view.y + view.h / 2, cfg.cameraU])
              set('uSheet', [sheet.x0, sheet.y0, sheet.sizeU, sheet.sizeU])
              set('uShell', [sheet.wallU, cfg.shell.outerU, cfg.shell.innerU, cfg.shell.rise])
              set('uHole', [sheet.holeX, sheet.holeY, u.rs, cfg.disk.outerRs])
              set('uLight', [cfg.hole.lightU, u.base, NEBULA_EXPOSURE, cfg.disk.innerK])
              set('uShape', [cfg.accretion.riseMs / 1000, cfg.accretion.viscousMs / 1000])
              set('uFlareT', u.flareT.slice(0, 4))
              set('uFlareT2', u.flareT.slice(4, 8))
              set('uFlareK', u.flareK.slice(0, 4))
              set('uFlareK2', u.flareK.slice(4, 8))
              set('uMeteor', u.meteor)
              set('uSeed', (v.run.decorSeed % 997) + 0.5)
              set('uGlow', u.glow)
              set('uDisk', u.disk)
              set('uHard', u.hard)
              set('uCone', cosmos.cone)
              const c = cosmos.uniforms
              set('uEvAt[0]', c.at)
              set('uEvStar[0]', c.star)
              set('uEvIon[0]', c.ion)
              set('uEvScatter[0]', c.scatter)
              set('uEvRemnant[0]', c.remnant)
              set('uEvFlash[0]', c.flash)
            },
          },
          x0,
          y0,
          side,
          side,
          [NEBULA_SHEET_KEY, NEBULA_REMNANT_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(-2),
    )
    this.dustGfx = scene.add.graphics().setDepth(0.5).setBlendMode(Phaser.BlendModes.ADD)
    this.streamGfx = scene.add.graphics().setDepth(29.5).setBlendMode(Phaser.BlendModes.ADD)
    this.tailGfx = scene.add.graphics().setDepth(33.5).setBlendMode(Phaser.BlendModes.ADD)
    this.halo = scene.add.image(L.hx, L.hy, NEBULA_HALO_KEY).setDepth(29).setBlendMode(Phaser.BlendModes.ADD)
    this.knot = scene.add.image(0, 0, NEBULA_GLINT_KEY).setDepth(33).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffa860).setVisible(false)
    this.coma = scene.add.image(0, 0, NEBULA_GLINT_KEY).setDepth(34).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff9a4a).setVisible(false)
    this.core = scene.add.image(0, 0, NEBULA_GLINT_KEY).setDepth(34.1).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff1d6).setVisible(false)
    this.wake = scene.add
      .particles(0, 0, NEBULA_CLOUD_KEY, {
        lifespan: { min: 900, max: 1600 },
        speed: { min: 2, max: 14 },
        scale: { start: 0.12, end: 0.55 },
        alpha: { start: 0.32, end: 0 },
        tint: [0xff8a4d, 0xd6604e, 0x8a4a5a],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 45,
        emitting: false,
      })
      .setDepth(32)
    this.wake.startFollow(this.core)
    this.sparks = scene.add
      .particles(0, 0, NEBULA_GLINT_KEY, {
        lifespan: { min: 350, max: 900 },
        speed: { min: 60, max: 260 },
        scale: { start: 0.5, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [0xffe0a8, 0xffa04a, 0xff5a3a],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(35)
    this.debris = scene.add
      .particles(0, 0, NEBULA_CLOUD_KEY, {
        lifespan: { min: 700, max: 1400 },
        speed: { min: 20, max: 90 },
        scale: { start: 0.25, end: 0.9 },
        alpha: { start: 0.4, end: 0 },
        tint: [0x5a3f4a, 0x7a4a52, 0x3d2c38],
        emitting: false,
      })
      .setDepth(33.2)
    this.visuals.push(this.dustGfx, this.streamGfx, this.tailGfx, this.halo, this.knot, this.coma, this.core, this.wake, this.sparks, this.debris)
    this.dust = []
    for (let i = 0; i < DUST_COUNT; i++) this.dust.push(this.speck(s, cfg, v.lens.screen, true))
    v.lens.screen.vignette(0.72, 0.26, 0x000000)
    this.syncUniforms(s, cfg, sim.elapsedMs)
  }

  /** 新撒一粒星尘：多半撒在镜头附近，免得都漂在看不见的地方 */
  private speck(s: NebulaState, cfg: NonNullable<MapDef['nebula']>, screen: Screen, anywhere: boolean): Speck {
    const L = s.layout
    const lim = (cfg.shell.innerU - 0.3) * UNIT
    let x = 0
    let y = 0
    for (let k = 0; k < 8; k++) {
      if (anywhere || Math.random() < 0.3) {
        const r = Math.sqrt(Math.random()) * lim
        const a = Math.random() * Math.PI * 2
        x = L.cx + Math.cos(a) * r
        y = L.cy + Math.sin(a) * r
      } else {
        const view = screen.view()
        x = view.x - UNIT * 2 + Math.random() * (view.w + UNIT * 4)
        y = view.y - UNIT * 2 + Math.random() * (view.h + UNIT * 4)
      }
      if (Math.hypot(x - L.cx, y - L.cy) < lim && !inNebulaHorizon(s, x, y)) break
    }
    return { x, y, vx: 0, vy: 0, size: 0.6 + Math.random() * 1.1, albedo: 0.6 + Math.random() * 0.4 }
  }

  /** 把黑洞此刻的大小、光度、最近几次闪耀与星云里此刻的天象交给着色器；时间都按对局的秒 */
  private syncUniforms(s: NebulaState, cfg: NonNullable<MapDef['nebula']>, now: number): void {
    const u = this.u
    u.time = now / 1000
    u.rs = s.rs
    const cosmos = this.cosmos
    if (cosmos) {
      cosmos.update(u.time)
      let burst: CosmicLight | undefined
      for (const l of cosmos.lights) if (l.flash && (!burst || l.power > burst.power)) burst = l
      this.burst = burst
    }
    const swing = cosmos?.lum ?? 1
    u.base = (s.gm / cfg.hole.gm) ** 2 * swing
    u.glow = (luminosity(s, cfg, now) * swing) ** 0.25
    u.hard = cosmos?.hard ?? 0.5
    this.disk = hue(planck(cfg.disk.innerK * DISK_LIGHT_K * u.glow))
    this.diskTint = rgbInt(this.disk)
    u.disk = [...this.disk]
    for (let i = 0; i < MAX_FLARES; i++) {
      const f = s.flares[i]
      u.flareT[i] = f ? f.at / 1000 : 0
      u.flareK[i] = f ? f.k : 0
    }
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const s = sim.worldState.nebula
    if (!s || !this.dustGfx) return
    const cfg = v.def.nebula!
    const now = sim.elapsedMs
    const dt = Math.min(delta, 50) / 1000
    this.syncUniforms(s, cfg, now)
    const lum = luminosity(s, cfg, now) * (this.cosmos?.lum ?? 1)
    this.hole = { x: s.layout.hx, y: s.layout.hy, lum }
    const shadow = SHADOW_RS * s.rs * UNIT
    if (this.halo) this.halo.setDisplaySize(shadow * HALO_EDGE * 2, shadow * HALO_EDGE * 2).setAlpha(Math.min(0.5, 0.1 * Math.sqrt(lum))).setTint(this.diskTint)
    this.stepDust(s, cfg, v.lens.screen, dt, lum)
    this.stepStreams(s, now)
    this.stepMeteor(v, s, cfg, now, lum)
  }

  /** 单位朝黑洞的一侧受吸积盘的光：主光换成黑洞的方向，离得越近、黑洞越亮，补光越多；附近炸了超新星时，比盘光亮就换成它的光 */
  lightAt(x: number, y: number, out: LocalLight): void {
    const h = this.hole
    if (!h) return
    const dx = h.x - x
    const dy = h.y - y
    const d = Math.hypot(dx, dy)
    if (d <= 0) return
    out.kx = out.fx = dx / d
    out.ky = out.fy = dy / d
    out.color = this.diskTint
    out.fill = Math.min(1, diskLight(h.lum, d / UNIT)) * DISK_ON_BODY
    const f = this.burst
    const c = this.center
    if (!f || !c) return
    const fx = (c.x - x) / UNIT + f.x
    const fy = (c.y - y) / UNIT + f.y
    const fd = Math.hypot(fx, fy)
    const fill = Math.min(FLASH_MAX, (f.power * FLASH_ON_BODY) / (fd * fd + f.z * f.z + 1))
    if (fill <= out.fill || fd <= 0) return
    out.fx = fx / fd
    out.fy = fy / fd
    out.color = rgbInt(f.color)
    out.fill = fill
  }

  /**
   * 星尘在气体里被拖着漂：终速是引力乘停止时间，越靠近黑洞流得越快；漂进视界或出了空腔就在别处重撒。
   * 它自己不发光，反射照到它身上的光：吸积盘、星云里的星与超新星、飞过的流星，离谁近就带着谁的颜色、被照得越亮
   */
  private stepDust(s: NebulaState, cfg: NonNullable<MapDef['nebula']>, screen: Screen, dt: number, lum: number): void {
    const g = this.dustGfx!
    g.clear()
    const L = s.layout
    const lim = cfg.shell.innerU * UNIT
    const mw = this.u.meteor[3]! * this.u.meteor[2]!
    const mx = L.cx + this.u.meteor[0]! * UNIT
    const my = L.cy + this.u.meteor[1]! * UNIT
    const lights = this.cosmos?.lights ?? []
    const disk = this.disk
    for (let i = 0; i < this.dust.length; i++) {
      let p = this.dust[i]!
      let left = dt
      for (let k = 0; k < 8 && left > 1e-5; k++) {
        const a = gravityAt(s, cfg, p.x, p.y)
        p.vx = a.x * DUST_STOP_S
        p.vy = a.y * DUST_STOP_S
        const sp = Math.hypot(p.vx, p.vy)
        const h = sp > 0 ? Math.min(left, (0.25 * UNIT) / sp) : left
        p.x += p.vx * h
        p.y += p.vy * h
        left -= h
        if (inNebulaHorizon(s, p.x, p.y)) break
      }
      if (inNebulaHorizon(s, p.x, p.y) || Math.hypot(p.x - L.cx, p.y - L.cy) > lim) {
        p = this.speck(s, cfg, screen, false)
        this.dust[i] = p
      }
      const kd = diskLight(lum, Math.hypot(p.x - L.hx, p.y - L.hy) / UNIT)
      const dm = Math.hypot(p.x - mx, p.y - my) / UNIT
      const km = (mw * 2) / (dm * dm + 1)
      let r = disk[0] * kd + km
      let gr = disk[1] * kd + km * 0.62
      let b = disk[2] * kd + km * 0.4
      const ox = (p.x - L.cx) / UNIT
      const oy = (p.y - L.cy) / UNIT
      for (const l of lights) {
        const k = (l.power * STAR_ON_DUST) / ((ox - l.x) ** 2 + (oy - l.y) ** 2 + l.z * l.z + 1)
        r += l.color[0] * k
        gr += l.color[1] * k
        b += l.color[2] * k
      }
      const peak = Math.max(r, gr, b)
      const light = Math.min(1, peak) * p.albedo
      const tint = peak > 0 ? rgbInt([r / peak, gr / peak, b / peak]) : this.diskTint
      const sp = Math.hypot(p.vx, p.vy)
      const tail = Math.min(sp * 0.045, 1.6 * UNIT)
      const alpha = Math.min(0.85, 0.12 + 0.75 * light)
      const across = p.size * (1 + light)
      g.lineStyle(across, tint, (alpha * across) / (across + tail))
      if (tail > 1) g.lineBetween(p.x - (p.vx / sp) * tail, p.y - (p.vy / sp) * tail, p.x, p.y)
      else {
        g.fillStyle(tint, alpha)
        g.fillCircle(p.x, p.y, p.size * (1 + light) * 0.8)
      }
    }
  }

  /** 被吞的身体拉成细流，绕着黑洞转进视界，被加热得跟吸积盘一样亮；越靠近视界引力红移越重，越暗 */
  private stepStreams(s: NebulaState, now: number): void {
    const g = this.streamGfx!
    for (const e of s.swallows.splice(0)) {
      if (e.gm < 0.3) continue
      this.streams.push({ x: e.x, y: e.y, at: e.at, gm: e.gm, spin: Math.random() < 0.5 ? -1 : 1 })
      playSfx('gulp')
    }
    g.clear()
    const L = s.layout
    this.streams = this.streams.filter((st) => now - st.at < STREAM_MS)
    const rh = s.rs * UNIT
    for (const st of this.streams) {
      const t = (now - st.at) / STREAM_MS
      const r0 = Math.hypot(st.x - L.hx, st.y - L.hy)
      const a0 = Math.atan2(st.y - L.hy, st.x - L.hx)
      const head = Math.pow(t, 0.6)
      const width = Math.max(1.5, Math.cbrt(st.gm) * 2.2)
      const radius = (w: number): number => rh + Math.max(0, r0 - rh) * (1 - w) ** 1.6
      const at = (w: number): Point => {
        const r = radius(w)
        const a = a0 + st.spin * w * 2.4
        return { x: L.hx + Math.cos(a) * r, y: L.hy + Math.sin(a) * r }
      }
      for (let k = 0; k < 10; k++) {
        const u0 = Math.max(0, head - 0.35 + (k * 0.35) / 10)
        const u1 = Math.max(0, head - 0.35 + ((k + 1) * 0.35) / 10)
        const p0 = at(u0)
        const p1 = at(u1)
        const redshift = (1 - rh / radius((u0 + u1) / 2)) ** 2
        g.lineStyle(width * (0.4 + (0.6 * k) / 10), this.diskTint, (1 - t) * ((k + 1) / 10) * 0.9 * redshift)
        g.lineBetween(p0.x, p0.y, p1.x, p1.y)
      }
    }
  }

  /** 流星：预兆时内壁上的团块渐渐亮起、朝要飞的方向冒出一截；飞的时候团块迎着气体的那一面被冲压烧得发亮，身后留下一道冷却变红的热迹，被吸积盘的光推出一条背向黑洞的尾巴；碎掉时溅出火星与烟 */
  private stepMeteor(v: ViewCtx, s: NebulaState, cfg: NonNullable<MapDef['nebula']>, now: number, lum: number): void {
    const m = s.meteor
    const g = this.tailGfx!
    g.clear()
    const L = s.layout
    const mc = cfg.meteor
    for (const e of s.ends.splice(0)) {
      if (e.kind === 'swallow') continue
      if (e.kind === 'shatter') {
        this.sparks?.explode(36, e.x, e.y)
        this.debris?.explode(10, e.x, e.y)
        playSfx('shatter')
        if (this.shake && v.lens.screen.sees(e.x, e.y)) v.lens.screen.shake(260, 0.003)
      } else this.debris?.explode(5, e.x, e.y)
    }
    const phase = m ? m.phase : 'none'
    if (phase !== this.phase && phase === 'warn') playSfx('streak')
    this.phase = phase
    this.u.meteor[3] = 0
    this.trail = this.trail.filter((p) => now - p.at < TRAIL_MS)
    if (m?.phase === 'fly') this.trail.push({ x: m.x, y: m.y, at: now })
    this.drawTrail(g, now, mc.radiusU * UNIT)
    if (m?.phase !== 'fly') this.wake?.stop()
    else if (!this.wake?.emitting) this.wake?.start()
    if (!m) {
      this.knot?.setVisible(false)
      this.core?.setVisible(false)
      this.coma?.setVisible(false)
      return
    }
    if (m.phase === 'warn') {
      const k = Math.min(1, (now - m.since) / mc.warnMs)
      this.core?.setVisible(false)
      this.coma?.setVisible(false)
      this.knot?.setVisible(true).setPosition(m.x, m.y).setScale((0.5 + 1.6 * k) * (UNIT / 32)).setAlpha(0.35 + 0.65 * k * (0.85 + 0.15 * Math.sin(now / 60)))
      const len = 1.8 * UNIT * k
      for (let i = 0; i < 6; i++) {
        const a = i / 6
        const b = (i + 1) / 6
        g.lineStyle((1 - a) * 0.5 * UNIT * k, 0xffb070, 0.45 * k * (1 - a))
        g.lineBetween(m.x + m.ux * len * a, m.y + m.uy * len * a, m.x + m.ux * len * b, m.y + m.uy * len * b)
      }
      this.u.meteor[0] = (m.x - L.cx) / UNIT
      this.u.meteor[1] = (m.y - L.cy) / UNIT
      this.u.meteor[2] = 0.6 * k
      this.u.meteor[3] = 1
      return
    }
    const speed = Math.hypot(m.vx, m.vy)
    const heat = Math.min(4, Math.max(0.3, (speed / (mc.speedU * UNIT)) ** 3))
    const size = mc.radiusU * 2 * UNIT
    this.knot?.setVisible(false)
    this.core?.setVisible(true).setPosition(m.x, m.y).setDisplaySize(size * 0.9, size * 0.9).setAlpha(Math.min(1, 0.6 + 0.2 * heat))
    this.coma?.setVisible(true).setPosition(m.x, m.y).setDisplaySize(size * (1.8 + 0.5 * heat), size * (1.8 + 0.5 * heat)).setAlpha(Math.min(0.9, 0.35 + 0.15 * heat))
    this.u.meteor[0] = (m.x - L.cx) / UNIT
    this.u.meteor[1] = (m.y - L.cy) / UNIT
    this.u.meteor[2] = heat
    this.u.meteor[3] = 1
    const ax = m.x - L.hx
    const ay = m.y - L.hy
    const dU = Math.hypot(ax, ay) / UNIT || 1
    const away = { x: ax / (dU * UNIT), y: ay / (dU * UNIT) }
    const tail = Math.min(TAIL_MAX_U, 0.8 + (TAIL_U * lum * 40) / (dU * dU + 10)) * UNIT
    const side = { x: -away.y, y: away.x }
    const halfW = mc.radiusU * UNIT * 0.9
    for (let layer = 0; layer < 3; layer++) {
      const w = halfW * (1 - layer * 0.28)
      const len = tail * (1 - layer * 0.22)
      g.fillStyle(layer === 2 ? 0xffe2c0 : 0xff9a66, 0.12 + layer * 0.08)
      g.fillPoints(
        [
          new Phaser.Math.Vector2(m.x + side.x * w, m.y + side.y * w),
          new Phaser.Math.Vector2(m.x + away.x * len * 0.55 + side.x * w * 0.55, m.y + away.y * len * 0.55 + side.y * w * 0.55),
          new Phaser.Math.Vector2(m.x + away.x * len, m.y + away.y * len),
          new Phaser.Math.Vector2(m.x + away.x * len * 0.55 - side.x * w * 0.55, m.y + away.y * len * 0.55 - side.y * w * 0.55),
          new Phaser.Math.Vector2(m.x - side.x * w, m.y - side.y * w),
        ],
        true,
      )
    }
  }

  /** 流星身后被冲热的气体：刚经过的地方最宽最亮、发白，冷却着变窄、变红，TRAIL_MS 后看不见 */
  private drawTrail(g: Phaser.GameObjects.Graphics, now: number, radius: number): void {
    const pts = this.trail
    if (pts.length < 2) return
    const edge = (i: number, w: number, sign: number): Phaser.Math.Vector2 => {
      const p = pts[i]!
      const a = pts[Math.max(0, i - 1)]!
      const b = pts[Math.min(pts.length - 1, i + 1)]!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      return new Phaser.Math.Vector2(p.x - (dy / len) * w * sign, p.y + (dx / len) * w * sign)
    }
    for (const [widthK, alphaK] of [
      [0.8, 0.2],
      [0.32, 0.45],
    ] as const) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const age0 = (now - pts[i]!.at) / TRAIL_MS
        const age1 = (now - pts[i + 1]!.at) / TRAIL_MS
        const w0 = radius * widthK * (1 - age0)
        const w1 = radius * widthK * (1 - age1)
        g.fillStyle(mix(0xffcf9a, 0xa83a28, Math.min(1, (age0 + age1) / 1.4)), alphaK * (1 - (age0 + age1) / 2))
        g.fillPoints([edge(i, w0, 1), edge(i + 1, w1, 1), edge(i + 1, w1, -1), edge(i, w0, -1)], true)
      }
    }
  }

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    this.cosmos = undefined
    this.burst = undefined
    this.center = undefined
    super.destroy(v)
    this.dust = []
    this.streams = []
    this.dustGfx = undefined
    this.streamGfx = undefined
    this.tailGfx = undefined
    this.halo = undefined
    this.hole = undefined
    this.knot = undefined
    this.core = undefined
    this.coma = undefined
    this.trail = []
    this.wake = undefined
    this.sparks = undefined
    this.debris = undefined
    for (const key of [NEBULA_SHEET_KEY, NEBULA_REMNANT_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
