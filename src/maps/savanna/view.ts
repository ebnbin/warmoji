import Phaser from 'phaser'
import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { AWAY, SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { playSfx } from '../../audio/sfx'
import { emojiRaster } from '../../emoji/textures'
import { Alive, Pickup, Radius, Span, Transform } from '../../ecs/components'
import { ART } from '../../ecs/utils/ground'
import { canvasTexture } from '../textures'
import { FRAME, FRAME_MID } from '../frame'
import { CANOPY_PPU, GROUND_AREA, paintCrown, textureSize } from './ground'
import { SavannaPainter } from './painter'
import { MAX_RIPPLES, WATER_FRAG } from './shader'
import { drawChevron, drawDust, drawHyena, drawPerched, drawVulture } from './critters'
import { snagTwigs } from './flora'
import { herdCenter, phaseProgress, runPath } from './herd'
import { pondGap, pondRadius } from './layout'
import { beastSize, savannaPlanFor } from './world'
import type { PaintTask } from './painter'
import type { PaintLayer, PaintPiece, PaintScene } from './ground'
import type { HerdPhase } from './herd'
import type { SavannaPlan } from './layout'
import type { SavannaState } from './world'
import type { SavannaConfig } from '../../types/maps'
import type { MapView, ViewCtx } from '../../ecs/views'
import type { Framing } from '../../ecs/lens'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'

/** 方框外的底色：黄昏的紫 */
const BG = 0x2c2133
const GROUND_KEY = 'savanna-ground'
const CANOPY_KEY = 'savanna-canopy'
const VULTURE_KEY = 'savanna-vulture'
const HYENA_KEY = 'savanna-hyena'
const DUST_KEY = 'savanna-dust'
const CHEVRON_KEY = 'savanna-chevron'
const MOTE_KEY = 'savanna-mote'
const PERCHED_KEY = 'savanna-perched'
const crownKey = (i: number): string => `savanna-crown-${i}`
const reflKey = (id: string): string => `savanna-refl-${id}`
/** 开局最多几个线程分着画；贴图按这么多像素高的条分块交给线程 */
const PAINT_THREADS = 4
const STRIP_PX = 64
/** 金合欢树冠贴图每格多少像素；底下有身体时淡到多少、多快（每秒） */
const CROWN_PPU = 24
const CROWN_FADE = 0.38
const CROWN_RATE = 5
/** 层次：倒影在地面之上、水面之下，跑道在水面之上，扬尘压着动物与敌人、在队员之下，草梢与树冠在一切之上，秃鹫更高 */
const DEPTH = { refl: -0.97, water: -0.95, lane: -0.8, dust: 6.5, crown: 19.5, canopy: 20, vulture: 36, mote: 34 } as const
/** 秃鹫：盘旋的几只，绕多大的圈（格）、多快（弧度/秒）、翅展（格）、离地多高（米） */
const VULTURES = 3
const VULTURE = { radius: [5, 9], rate: [0.12, 0.2], span: [1.6, 2], altM: [5, 8] } as const
/** 鬣狗：几只，在草地边外的灌丛里溜达；身长（格） */
const HYENAS = 2
const HYENA_U = 1.1
/** 鬣狗多久笑一声（毫秒） */
const CACKLE_MS = { min: 14000, max: 30000 } as const
/** 倒影多淡 */
const REFL_ALPHA = 0.42

interface Hyena {
  x: number
  y: number
  heading: number
  turn: number
  walk: number
  rest: number
  phase: number
  readonly img: Phaser.GameObjects.Image
}

interface Vulture {
  a: number
  readonly cx: number
  readonly cy: number
  readonly r: number
  readonly rate: number
  readonly span: number
  readonly alt: number
  readonly img: Phaser.GameObjects.Image
}

/** 沿一串点描一条线 */
function stroke(g: Phaser.GameObjects.Graphics, pts: readonly Point[]): void {
  g.beginPath()
  g.moveTo(pts[0]!.x, pts[0]!.y)
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y)
  g.strokePath()
}

/** 把画布传上显卡并按线性插值采样 */
function upload(tex: Phaser.Textures.CanvasTexture): void {
  tex.refresh()
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
}

function ensureArt(scene: Phaser.Scene): void {
  if (!scene.textures.exists(VULTURE_KEY)) canvasTexture(scene, VULTURE_KEY, 96, 96, (ctx) => drawVulture(ctx, 96, 96))
  if (!scene.textures.exists(HYENA_KEY)) canvasTexture(scene, HYENA_KEY, 96, 48, (ctx) => drawHyena(ctx, 96, 48))
  if (!scene.textures.exists(DUST_KEY)) canvasTexture(scene, DUST_KEY, 64, 64, (ctx) => drawDust(ctx, 64))
  if (!scene.textures.exists(CHEVRON_KEY)) canvasTexture(scene, CHEVRON_KEY, 64, 64, (ctx) => drawChevron(ctx, 64))
  if (!scene.textures.exists(PERCHED_KEY)) canvasTexture(scene, PERCHED_KEY, 64, 32, (ctx) => drawPerched(ctx, 64, 32))
  if (!scene.textures.exists(MOTE_KEY)) canvasTexture(scene, MOTE_KEY, 16, 16, (ctx) => drawDust(ctx, 16))
}

/**
 * 水坑：地面与草梢是开局在后台线程画好的贴图，金合欢的树冠一棵一张、底下有身体时变淡；水面上着色器画细浪、碎金与喝水的涟漪，
 * 水边的动物在水里映出倒影。兽群受惊预警时，地上画出每一头要跑的跑道，一道道箭头往前涌；刨地与狂奔扬起红土，
 * 象群长鸣、蹄声如雷。秃鹫在高处盘旋、影子从草上掠过，鬣狗在草地边外的灌丛里溜达，低低的阳光里浮着尘埃
 */
export class SavannaView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private plan?: SavannaPlan
  private painter?: SavannaPainter
  private crowns: { img: Phaser.GameObjects.Image; alpha: number; readonly x: number; readonly y: number; readonly r: number }[] = []
  private lanes?: Phaser.GameObjects.Graphics
  private shadows?: Phaser.GameObjects.Graphics
  private chevrons: Phaser.GameObjects.Image[] = []
  private paths: Point[][] = []
  private dust?: Phaser.GameObjects.Particles.ParticleEmitter
  private refl: { img: Phaser.GameObjects.Image; readonly id: string }[] = []
  private hyenas: Hyena[] = []
  private vultures: Vulture[] = []
  private perched: { readonly img: Phaser.GameObjects.Image; readonly x: number; readonly y: number; readonly heading: number; readonly alt: number; phase: number }[] = []
  private seen: HerdPhase = 'calm'
  private dustDebt = 0
  private cackleAt = 0
  private readonly u = { time: 0, ripple: new Float32Array(MAX_RIPPLES * 4) }

  private planOf(v: ViewCtx): SavannaPlan {
    if (!this.plan) this.plan = savannaPlanFor(v.def.savanna!, v.run.decorSeed)
    return this.plan
  }

  layout(): { w: number; h: number; origin: Point } {
    return { w: FRAME.w, h: FRAME.h, origin: FRAME_MID }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-2)))
    ensureArt(v.scene)
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  /** 草地上的小东西都画进地面里了 */
  decor(): void {}

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const st = sim.worldState.savanna
    if (!st) return
    const plan = this.planOf(v)
    const cfg = v.def.savanna!
    const scene = v.scene
    const sc: PaintScene = { cfg, plan }
    const sizes: Record<PaintLayer, { w: number; h: number }> = { ground: textureSize('ground'), canopy: textureSize('canopy') }
    const tex: Record<PaintLayer, Phaser.Textures.CanvasTexture> = {
      ground: canvasTexture(scene, GROUND_KEY, sizes.ground.w, sizes.ground.h),
      canopy: canvasTexture(scene, CANOPY_KEY, sizes.canopy.w, sizes.canopy.h),
    }
    const painter = new SavannaPainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const tasks: PaintTask[] = []
    for (const layer of ['canopy', 'ground'] as const) {
      const sz = sizes[layer]
      for (let y = 0; y < sz.h; y += STRIP_PX) tasks.push({ layer, rect: { x0: 0, y0: y, x1: sz.w, y1: Math.min(sz.h, y + STRIP_PX) } })
    }
    const put = (p: PaintPiece): void => {
      tex[p.layer].getContext().putImageData(new ImageData(p.pixels, p.rect.x1 - p.rect.x0, p.rect.y1 - p.rect.y0), p.rect.x0, p.rect.y0)
    }
    const rasters = Promise.all(Object.values(cfg.herd.kinds).map(async (k) => [k.emoji, await emojiRaster(k.emoji, 'player')] as const))
    await painter.paint(tasks, put)
    painter.close()
    if (this.painter !== painter) return
    this.painter = undefined
    for (const t of Object.values(tex)) upload(t)
    const ga = GROUND_AREA
    this.visuals.push(scene.add.image(ga.x0 * UNIT, ga.y0 * UNIT, GROUND_KEY).setOrigin(0, 0).setDisplaySize((sizes.ground.w / GROUND_PPU) * UNIT, (sizes.ground.h / GROUND_PPU) * UNIT).setDepth(-1))
    for (const [id, img] of await rasters) {
      if (scene.textures.exists(reflKey(id))) scene.textures.remove(reflKey(id))
      scene.textures.addImage(reflKey(id), img)
    }
    this.reflections(v, st)
    this.water(v, plan)
    // 跑道先整层画实，再按浓度整层叠上去：几条叠在一起的地方不会越叠越浓
    this.lanes = scene.add.graphics().setDepth(DEPTH.lane)
    this.lanes.enableFilters()
    this.lanes.filtersForceComposite = true
    this.shadows = scene.add.graphics().setDepth(-0.85)
    this.visuals.push(this.lanes, this.shadows)
    this.visuals.push(scene.add.image(ga.x0 * UNIT, ga.y0 * UNIT, CANOPY_KEY).setOrigin(0, 0).setDisplaySize((sizes.canopy.w / CANOPY_PPU) * UNIT, (sizes.canopy.h / CANOPY_PPU) * UNIT).setDepth(DEPTH.canopy))
    plan.acacias.forEach((a, i) => {
      const c = paintCrown(a, plan.seed + i * 31, CROWN_PPU)
      canvasTexture(scene, crownKey(i), c.w, c.h, (ctx) => ctx.putImageData(new ImageData(c.data, c.w, c.h), 0, 0))
      const img = scene.add.image(c.x0 * UNIT, c.y0 * UNIT, crownKey(i)).setOrigin(0, 0).setDisplaySize((c.w / CROWN_PPU) * UNIT, (c.h / CROWN_PPU) * UNIT).setDepth(DEPTH.crown)
      this.visuals.push(img)
      this.crowns.push({ img, alpha: 1, x: (a.x + a.ox) * UNIT, y: (a.y + a.oy) * UNIT, r: a.crown * UNIT })
    })
    this.dust = scene.add
      .particles(0, 0, DUST_KEY, {
        lifespan: { min: 900, max: 1800 },
        speed: { min: 8, max: 40 },
        scale: { start: 0.35, end: 1.1 },
        alpha: { start: 0.42, end: 0 },
        tint: [0xb4704c, 0xc78a62, 0xa9664a, 0xd2a07a],
        rotate: { min: 0, max: 360 },
        gravityY: -10,
        emitting: false,
      })
      .setDepth(DEPTH.dust)
    this.visuals.push(this.dust)
    this.prowl(v, plan)
    this.soar(v, plan)
    this.roost(v, plan)
    this.motes(v)
    this.cackleAt = CACKLE_MS.min
    this.seen = st.herd.phase
    v.lens.screen.vignette(0.74, 0.24, 0x1a0f24)
  }

  /** 水面：着色器盖在水坑的外接框上 */
  private water(v: ViewCtx, plan: SavannaPlan): void {
    const p = plan.pond
    const R = p.r * 1.5 * UNIT
    const x0 = p.x * UNIT - R
    const y0 = p.y * UNIT - R
    const lobes = new Float32Array(9)
    p.lobes.slice(0, 3).forEach((l, i) => lobes.set([l.amp, l.k, l.phase], i * 3))
    const u = this.u
    this.visuals.push(
      v.scene.add
        .shader(
          {
            name: 'SavannaWater',
            fragmentSource: WATER_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uSize', [2 * R, 2 * R])
              set('uPond', [R, R, p.r * UNIT])
              set('uLobe[0]', lobes)
              set('uTime', u.time)
              set('uWind', [plan.wind.x, plan.wind.y])
              set('uSun', [SUN.x, SUN.y])
              set('uRipple[0]', u.ripple)
            },
          },
          x0,
          y0,
          2 * R,
          2 * R,
        )
        .setOrigin(0, 0)
        .setDepth(DEPTH.water),
    )
  }

  /** 倒影：每一头一张图，倒过来画在水里 */
  private reflections(v: ViewCtx, st: SavannaState): void {
    const cfg = v.def.savanna!
    for (const b of st.herd.beasts) {
      const id = cfg.herd.kinds[b.kind]!.emoji
      const img = v.scene.add.image(0, 0, reflKey(id)).setOrigin(0.5, 1).setRotation(Math.PI).setTint(0xb39bc6).setDepth(DEPTH.refl).setVisible(false)
      this.visuals.push(img)
      this.refl.push({ img, id })
    }
  }

  /** 鬣狗：在草地边外的灌丛里，顺着边溜达，停一停，再走 */
  private prowl(v: ViewCtx, plan: SavannaPlan): void {
    for (let i = 0; i < HYENAS; i++) {
      const a = Math.random() * Math.PI * 2
      const p = this.rimPoint(plan, a, -1.2)
      const img = v.scene.add.image(p.x, p.y, HYENA_KEY).setDepth(0.9).setDisplaySize(HYENA_U * UNIT, HYENA_U * UNIT * 0.5)
      this.visuals.push(img)
      this.hyenas.push({ x: p.x, y: p.y, heading: a + Math.PI / 2, turn: 0, walk: 0, rest: 2000 + Math.random() * 5000, phase: Math.random() * 10, img })
    }
  }

  /** 从开局站位往 ang 方向，草地的边往外 out 格的那一点，像素 */
  private rimPoint(plan: SavannaPlan, ang: number, out: number): Point {
    for (let r = 4; r < 30; r += 0.25) {
      const x = plan.start.x + Math.cos(ang) * r
      const y = plan.start.y + Math.sin(ang) * r
      const f = this.room(plan, x, y)
      if (f <= out) return { x: x * UNIT, y: y * UNIT }
    }
    return { x: plan.start.x * UNIT, y: plan.start.y * UNIT }
  }

  /** 离草地的边多远（格），外面为负 */
  private room(plan: SavannaPlan, x: number, y: number): number {
    const f = plan.field
    const u = Math.min(f.cols - 1.001, Math.max(0, (x * UNIT - f.x0) / f.cell - 0.5))
    const w = Math.min(f.rows - 1.001, Math.max(0, (y * UNIT - f.y0) / f.cell - 0.5))
    return f.room[Math.floor(w) * f.cols + Math.floor(u)]! / UNIT
  }

  /** 秃鹫：在水坑上空绕着大圈；圈心随水坑偏一点 */
  private soar(v: ViewCtx, plan: SavannaPlan): void {
    for (let i = 0; i < VULTURES; i++) {
      const r = VULTURE.radius[0] + Math.random() * (VULTURE.radius[1] - VULTURE.radius[0])
      const img = v.scene.add.image(0, 0, VULTURE_KEY).setDepth(DEPTH.vulture).setAlpha(0.95)
      this.visuals.push(img)
      this.vultures.push({
        a: Math.random() * Math.PI * 2,
        cx: (plan.pond.x + (plan.start.x - plan.pond.x) * 0.3 + (Math.random() - 0.5) * 4) * UNIT,
        cy: (plan.pond.y + (plan.start.y - plan.pond.y) * 0.3 + (Math.random() - 0.5) * 4) * UNIT,
        r: r * UNIT,
        rate: (VULTURE.rate[0] + Math.random() * (VULTURE.rate[1] - VULTURE.rate[0])) * (i % 2 === 0 ? 1 : -1),
        span: VULTURE.span[0] + Math.random() * (VULTURE.span[1] - VULTURE.span[0]),
        alt: VULTURE.altM[0] + Math.random() * (VULTURE.altM[1] - VULTURE.altM[0]),
        img,
      })
    }
  }

  /** 枯树上歇着的两只秃鹫：落在最外头的枝梢上，脸朝外 */
  private roost(v: ViewCtx, plan: SavannaPlan): void {
    const twigs = snagTwigs(plan).filter((t) => t.w < 0.06)
    const picks = [twigs[Math.floor(twigs.length * 0.2)], twigs[Math.floor(twigs.length * 0.7)]]
    for (const t of picks) {
      if (!t) continue
      const heading = Math.atan2(t.by - t.ay, t.bx - t.ax)
      const img = v.scene.add.image(t.bx * UNIT, t.by * UNIT, PERCHED_KEY).setDepth(DEPTH.canopy + 0.1).setDisplaySize(0.75 * UNIT, 0.38 * UNIT).setRotation(heading)
      this.visuals.push(img)
      this.perched.push({ img, x: t.bx * UNIT, y: t.by * UNIT, heading, alt: t.bz, phase: Math.random() * 10 })
    }
  }

  /** 低低的阳光里浮着的尘埃与小虫：在镜头里随处慢慢飘，暖暖地亮 */
  private motes(v: ViewCtx): void {
    const screen = v.lens.screen
    this.visuals.push(
      v.scene.add
        .particles(0, 0, MOTE_KEY, {
          lifespan: { min: 4000, max: 7000 },
          frequency: 260,
          speedX: { min: -14, max: 14 },
          speedY: { min: -10, max: 6 },
          scale: { min: 0.25, max: 0.55 },
          alpha: { start: 0.55, end: 0 },
          tint: [0xffd9a0, 0xffe8c4, 0xffc890],
          blendMode: Phaser.BlendModes.ADD,
          emitZone: {
            type: 'random',
            source: {
              getRandomPoint: (p: Phaser.Types.Math.Vector2Like): void => {
                const view = screen.view()
                p.x = view.x + Math.random() * view.w
                p.y = view.y + Math.random() * view.h
              },
            },
          },
        })
        .setDepth(DEPTH.mote),
    )
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const st = sim.worldState.savanna
    if (!st || !this.lanes) return
    const cfg = v.def.savanna!
    const dt = Math.min(delta, 50) / 1000
    this.u.time = st.clock / 1000
    this.phaseChange(v, st, cfg)
    this.drawLanes(st, cfg)
    this.raiseDust(v, st, cfg, dt)
    this.fadeCrowns(sim, dt)
    this.mirror(v, st, cfg)
    this.ripples(st)
    this.shadows!.clear()
    this.stepHyenas(v, st, dt, sim.elapsedMs)
    this.stepVultures(v, dt)
  }

  /** 进入每一段的那一刻：预警时算好跑道、象群长鸣；狂奔时蹄声如雷、镜头一震 */
  private phaseChange(v: ViewCtx, st: SavannaState, cfg: SavannaConfig): void {
    const h = st.herd
    if (h.phase === this.seen) return
    this.seen = h.phase
    const screen = v.lens.screen
    const c = herdCenter(h)
    const near = screen.sees(c.x, c.y, 10 * UNIT)
    if (h.phase === 'alarm') {
      this.paths = h.beasts.map((b) => runPath(st.plan, h, b, cfg))
      for (let i = this.chevrons.length; i < h.beasts.length * 4; i++) {
        const img = v.scene.add.image(0, 0, CHEVRON_KEY).setDepth(DEPTH.lane + 0.01).setVisible(false)
        this.chevrons.push(img)
        this.visuals.push(img)
      }
      playSfx('trumpet')
    } else if (h.phase === 'run') {
      playSfx('hooves')
      if (near) screen.shake(450, 0.0025)
    }
  }

  /** 跑道：预警时每一头脚下拉出一条将要跑过的带子，越来越实，箭头顺着它往前涌；狂奔起来带子很快淡掉 */
  private drawLanes(st: SavannaState, cfg: SavannaConfig): void {
    const g = this.lanes!.clear()
    const h = st.herd
    const show = h.phase === 'alarm' ? Math.min(1, phaseProgress(h, cfg, st.clock) * 2.5) : h.phase === 'run' ? 1 - Math.min(1, phaseProgress(h, cfg, st.clock) * 3) : 0
    let n = 0
    if (show > 0) {
      const blink = h.phase === 'alarm' ? 0.75 + 0.25 * Math.sin(st.clock / 70) : 1
      this.lanes!.filterCamera?.setAlpha(0.34 * show * blink)
      const lanes: { path: Point[]; w: number }[] = []
      h.beasts.forEach((b, i) => {
        const path = this.paths[i]
        if (path && path.length >= 2) lanes.push({ path, w: b.r * 1.6 })
      })
      for (const l of lanes) {
        g.lineStyle(l.w + 0.18 * UNIT, 0x3a1424, 1)
        stroke(g, l.path)
      }
      for (const l of lanes) {
        g.lineStyle(l.w, 0xe2763e, 1)
        stroke(g, l.path)
      }
      h.beasts.forEach((b, i) => {
        const path = this.paths[i]
        if (!path || path.length < 2) return
        const w = b.r * 1.6
        // 箭头：沿着跑道往前流
        let len = 0
        const seg: number[] = [0]
        for (let k = 1; k < path.length; k++) seg.push((len += Math.hypot(path[k]!.x - path[k - 1]!.x, path[k]!.y - path[k - 1]!.y)))
        const gap = 1.6 * UNIT
        const shift = ((st.clock / 1000) * 3 * UNIT) % gap
        for (let s = shift + b.r; s < len && n < this.chevrons.length; s += gap) {
          let k = 1
          while (k < seg.length - 1 && seg[k]! < s) k++
          const a = path[k - 1]!
          const c = path[k]!
          const t = (s - seg[k - 1]!) / Math.max(1e-6, seg[k]! - seg[k - 1]!)
          const img = this.chevrons[n++]!
          img
            .setVisible(true)
            .setPosition(a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t)
            .setRotation(Math.atan2(c.y - a.y, c.x - a.x))
            .setDisplaySize(w * 0.8, w * 0.8)
            .setTint(0xffd2a8)
            .setAlpha(0.7 * show * (1 - s / len) * blink)
        }
      })
    }
    for (let k = n; k < this.chevrons.length; k++) this.chevrons[k]!.setVisible(false)
  }

  /** 扬尘：预警时刨地扬起一点，狂奔时每一头身后滚滚一片，慢下来就少了 */
  private raiseDust(v: ViewCtx, st: SavannaState, cfg: SavannaConfig, dt: number): void {
    const h = st.herd
    const em = this.dust
    if (!em) return
    const rate = h.phase === 'alarm' ? 3 : h.phase === 'run' ? 16 : h.phase === 'slow' ? 6 * (1 - phaseProgress(h, cfg, st.clock)) : 0
    this.dustDebt += rate * dt * h.beasts.length
    const screen = v.lens.screen
    while (this.dustDebt >= 1) {
      this.dustDebt -= 1
      const b = h.beasts[Math.floor(Math.random() * h.beasts.length)]!
      if (!screen.sees(b.x, b.y, 3 * UNIT)) continue
      const sp = Math.hypot(b.vx, b.vy) || 1
      const back = h.phase === 'alarm' ? 0 : b.r * 0.8
      const x = b.x - (b.vx / sp) * back + (Math.random() - 0.5) * b.r
      const y = b.y + b.r * 0.5 - (b.vy / sp) * back + (Math.random() - 0.5) * b.r * 0.6
      em.setScale(0.3 + b.r / UNIT * 0.4, 0.9 + b.r / UNIT * 0.9)
      em.emitParticleAt(x, y, 1)
    }
  }

  /** 金合欢的树冠：底下有身体时淡下去，看得见底下的人与怪 */
  private fadeCrowns(sim: Sim, dt: number): void {
    if (this.crowns.length === 0) return
    const under = this.crowns.map(() => false)
    for (const eid of query(sim.world, [Transform, Radius])) {
      if (!Alive.v[eid] || hasComponent(sim.world, eid, Pickup) || Span.lo[eid]! > 1) continue
      const x = Transform.x[eid]!
      const y = Transform.y[eid]!
      this.crowns.forEach((c, i) => {
        if (!under[i] && (x - c.x) ** 2 + (y - c.y) ** 2 < (c.r + 0.3 * UNIT) ** 2) under[i] = true
      })
    }
    for (const b of sim.worldState.savanna?.herd.beasts ?? []) {
      this.crowns.forEach((c, i) => {
        if (!under[i] && (b.x - c.x) ** 2 + (b.y - c.y) ** 2 < c.r ** 2) under[i] = true
      })
    }
    this.crowns.forEach((c, i) => {
      const want = under[i] ? CROWN_FADE : 1
      c.alpha += (want - c.alpha) * Math.min(1, dt * CROWN_RATE)
      c.img.setAlpha(c.alpha)
    })
  }

  /** 倒影：脚下就是水的动物倒着映在水里，脚接着脚；水不够深就压扁一点，两边伸出水的不画；水面一晃一晃 */
  private mirror(v: ViewCtx, st: SavannaState, cfg: SavannaConfig): void {
    const p = st.plan.pond
    const wet = (x: number, y: number): boolean => pondGap(p, x / UNIT, y / UNIT) < -0.05
    st.herd.beasts.forEach((b, i) => {
      const r = this.refl[i]
      if (!r) return
      const size = beastSize(cfg, b)
      const foot = b.y + b.r * 0.55
      const half = size * ART * 0.4
      const start = foot + 0.25 * UNIT
      let depth = 0
      while (depth < size * ART && wet(b.x, start + depth)) depth += 0.1 * UNIT
      const show = depth > 0.4 * UNIT && wet(b.x - half, start) && wet(b.x + half, start) && v.lens.screen.sees(b.x, b.y, 4 * UNIT)
      if (!show) {
        r.img.setVisible(false)
        return
      }
      const squash = Math.min(1, depth / (size * ART))
      const wob = 1 + 0.03 * Math.sin(st.clock / 300 + i)
      r.img
        .setVisible(true)
        .setPosition(b.x, foot - (size * (1 - ART)) / 2 * squash)
        .setDisplaySize(size * wob, size * squash)
        .setFlipX(b.face <= 0)
        .setAlpha(REFL_ALPHA * Math.min(1, depth / UNIT))
    })
  }

  /** 喝水的涟漪：低头喝水的几头嘴边荡开一圈圈 */
  private ripples(st: SavannaState): void {
    const p = st.plan.pond
    const R = p.r * 1.5 * UNIT
    const ox = p.x * UNIT - R
    const oy = p.y * UNIT - R
    const out = this.u.ripple
    out.fill(0)
    let n = 0
    st.herd.beasts.forEach((b, i) => {
      if (n >= MAX_RIPPLES || !b.drink || Math.hypot(b.vx, b.vy) > 0.1 * UNIT) return
      if (pondGap(p, b.x / UNIT, b.y / UNIT) > b.r / UNIT + 0.6) return
      const a = Math.atan2(b.y - p.y * UNIT, b.x - p.x * UNIT)
      const d = pondRadius(p, a) * UNIT - 0.3 * UNIT
      out.set([p.x * UNIT + Math.cos(a) * d - ox, p.y * UNIT + Math.sin(a) * d - oy, i * 1.7, 1], n * 4)
      n++
    })
  }

  /** 鬣狗：顺着草地的边在灌丛里溜达，探头探脑；隔一阵怪笑一声 */
  private stepHyenas(v: ViewCtx, st: SavannaState, dt: number, now: number): void {
    const plan = st.plan
    const g = this.shadows!
    for (const hy of this.hyenas) {
      hy.phase += dt
      if (hy.walk > 0) {
        hy.walk -= dt * 1000
        hy.heading += hy.turn * dt
        const nx = hy.x + Math.cos(hy.heading) * 0.9 * UNIT * dt
        const ny = hy.y + Math.sin(hy.heading) * 0.9 * UNIT * dt
        const f = this.room(plan, nx / UNIT, ny / UNIT)
        if (f > -0.5 || f < -3.2) hy.heading += Math.PI * 0.6 * (f > -0.5 ? 1 : -1) * dt * 3
        else {
          hy.x = nx
          hy.y = ny
        }
        if (hy.walk <= 0) hy.rest = 1500 + Math.random() * 5000
      } else {
        hy.rest -= dt * 1000
        if (hy.rest <= 0) {
          hy.walk = 2500 + Math.random() * 5000
          hy.turn = (Math.random() - 0.5) * 0.8
          if (Math.random() < 0.3) hy.heading += Math.PI
        }
      }
      const bob = hy.walk > 0 ? Math.sin(hy.phase * 10) * 0.02 : 0
      hy.img.setPosition(hy.x, hy.y + bob * UNIT).setRotation(hy.heading + (hy.walk > 0 ? Math.sin(hy.phase * 5) * 0.05 : Math.sin(hy.phase * 0.8) * 0.15))
      g.fillStyle(0x1a0c22, 0.22)
      g.save()
      g.translateCanvas(hy.x + AWAY.x * 0.25 * UNIT, hy.y + AWAY.y * 0.25 * UNIT)
      g.rotateCanvas(hy.heading)
      g.fillEllipse(0, 0, HYENA_U * UNIT * 0.95, HYENA_U * UNIT * 0.4)
      g.restore()
    }
    if (now >= this.cackleAt) {
      this.cackleAt = now + CACKLE_MS.min + Math.random() * (CACKLE_MS.max - CACKLE_MS.min)
      if (this.hyenas.some((h) => v.lens.screen.sees(h.x, h.y, 2 * UNIT))) playSfx('cackle')
    }
  }

  /** 秃鹫：慢慢绕大圈，翅膀几乎不动，偶尔微微侧一下；影子按高度落在背着太阳的地方。枯树上的两只隔一阵转转头 */
  private stepVultures(v: ViewCtx, dt: number): void {
    const g = this.shadows!
    const mpu = v.def.savanna!.shadowUPerM
    for (const p of this.perched) {
      p.phase += dt
      const look = Math.sin(p.phase * 0.7) > 0.6 ? Math.sin(p.phase * 3) * 0.5 : 0
      p.img.setRotation(p.heading + look)
      g.fillStyle(0x1a0c22, 0.2)
      g.fillEllipse(p.x + AWAY.x * p.alt * mpu * UNIT, p.y + AWAY.y * p.alt * mpu * UNIT, 0.6 * UNIT, 0.3 * UNIT)
    }
    for (const b of this.vultures) {
      b.a += b.rate * dt
      const x = b.cx + Math.cos(b.a) * b.r
      const y = b.cy + Math.sin(b.a) * b.r * 0.8
      const heading = Math.atan2(Math.cos(b.a) * 0.8 * Math.sign(b.rate), -Math.sin(b.a) * Math.sign(b.rate))
      const bank = 1 - 0.08 * Math.abs(Math.sin(b.a * 3))
      b.img.setPosition(x, y - b.alt * 0.5 * UNIT).setRotation(heading).setDisplaySize(b.span * UNIT * 0.85, b.span * UNIT * bank)
      g.fillStyle(0x1a0c22, 0.13)
      g.save()
      g.translateCanvas(x + AWAY.x * b.alt * mpu * UNIT * 0.5, y + AWAY.y * b.alt * mpu * UNIT * 0.5)
      g.rotateCanvas(heading)
      g.fillEllipse(0, 0, b.span * UNIT * 0.35, b.span * UNIT * 0.85)
      g.restore()
    }
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    v.decor.length = 0
    this.crowns = []
    this.chevrons = []
    this.paths = []
    this.refl = []
    this.hyenas = []
    this.vultures = []
    this.perched = []
    this.lanes = undefined
    this.shadows = undefined
    this.dust = undefined
    const keys = [GROUND_KEY, CANOPY_KEY, ...(this.plan?.acacias.map((_, i) => crownKey(i)) ?? []), ...Object.values(v.def.savanna!.herd.kinds).map((k) => reflKey(k.emoji))]
    for (const key of keys) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
