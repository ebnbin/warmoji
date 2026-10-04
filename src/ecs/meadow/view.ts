import Phaser from 'phaser'
import { hasComponent, query, removeEntity } from 'bitecs'
import { UNIT } from '../../util/units'
import { rollDecor } from '../../data/maps'
import { SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { Rng } from '../../util/rng'
import { playSfx } from '../../audio/sfx'
import { spawnDecor } from '../entities/decor'
import { Airborne, Alive, Pickup, Radius, Transform } from '../components'
import { roomAt } from '../worlds/basin'
import { CANOPY_PPU, grassMask, groundArea, MASK_PPU, textureSize } from './ground'
import { MeadowPainter } from './painter'
import { GRASS_FRAG } from './shader'
import { bankWidth, beyondFence, footAt, forestDepth, polylineDist, toLocal, toMap } from './layout'
import { meadowPlanFor } from './world'
import { drawBird, drawButterfly, drawFluff, drawHawk, drawSheep, drawSheepHead } from './critters'
import type { PaintTask } from './painter'
import type { Area, PaintLayer, PaintPiece, PaintScene } from './ground'
import type { Local, MeadowPlan } from './layout'
import type { EcsAtlas } from '../atlas'
import type { MapView, ViewCtx } from '../views'
import type { Framing } from '../lens'
import type { Sim } from '../sim'
import type { Point } from '../../util/vec'
import type { MeadowConfig } from '../../types/maps'

const BG = 0x1a221e
const GROUND_KEY = 'meadow-ground'
const CANOPY_KEY = 'meadow-canopy'
const MASK_KEY = 'meadow-mask'
const SHEEP_KEY = 'meadow-sheep'
const HEAD_KEY = 'meadow-sheep-head'
const BUTTERFLY_KEY = 'meadow-butterfly'
const BIRD_KEY = 'meadow-bird'
const HAWK_KEY = 'meadow-hawk'
const FLUFF_KEY = 'meadow-fluff'
/** 开局最多几个线程分着画 */
const PAINT_THREADS = 4
/** 贴图按这么多像素高的条分块交给线程 */
const STRIP_PX = 64
/** 羊身子多长、多宽（格），头多大 */
const SHEEP_U = { len: 1.6, wid: 1, head: 0.5 } as const
const SHEEP_PX = { w: 128, h: 80, head: 48 } as const
/** 蝴蝶几只、翅展（格）；几种颜色 */
const BUTTERFLIES = 7
const BUTTERFLY_U = 0.3
const BUTTERFLY_TINTS = [0xffffff, 0xfff1a0, 0xb8d2ff, 0xffbe72] as const
/** 一群小鸟：几只、翅展（格）、飞多快（格/秒）、离地多高（米）；隔多久飞过一群（毫秒） */
const FLOCK = { min: 5, max: 9 } as const
const BIRD_U = 0.36
const BIRD_SPEED_U = 7
const BIRD_ALT_M = 2.6
const FLOCK_MS = { min: 22000, max: 45000 } as const
/** 鹰：在坡上那层草甸的上空绕多大的圈（格）、多快（弧度/秒）、翅展（格）、离地多高（米，定影子落在哪） */
const HAWK = { radius: 6.5, rate: 0.16, span: 1.9, altM: 4 } as const
/** 羊多久叫一声（毫秒） */
const BLEAT_MS = { min: 9000, max: 20000 } as const

interface SheepFx {
  x: number
  y: number
  heading: number
  turn: number
  walk: number
  rest: number
  phase: number
  look: number
  readonly body: Phaser.GameObjects.Image
  readonly head: Phaser.GameObjects.Image
}

interface Butterfly {
  x: number
  y: number
  vx: number
  vy: number
  tx: number
  ty: number
  readonly hx: number
  readonly hy: number
  flap: number
  readonly img: Phaser.GameObjects.Image
}

interface Bird {
  x: number
  y: number
  readonly vx: number
  readonly vy: number
  flap: number
  readonly img: Phaser.GameObjects.Image
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

/** 小生灵的贴图只画一次，之后每局都用 */
function ensureCritters(scene: Phaser.Scene): void {
  if (!scene.textures.exists(SHEEP_KEY)) canvasTexture(scene, SHEEP_KEY, SHEEP_PX.w, SHEEP_PX.h, (ctx) => drawSheep(ctx, SHEEP_PX.w, SHEEP_PX.h))
  if (!scene.textures.exists(HEAD_KEY)) canvasTexture(scene, HEAD_KEY, SHEEP_PX.head, SHEEP_PX.head, (ctx) => drawSheepHead(ctx, SHEEP_PX.head))
  if (!scene.textures.exists(BUTTERFLY_KEY)) canvasTexture(scene, BUTTERFLY_KEY, 32, 32, (ctx) => drawButterfly(ctx, 32))
  if (!scene.textures.exists(BIRD_KEY)) canvasTexture(scene, BIRD_KEY, 32, 32, (ctx) => drawBird(ctx, 32, 32))
  if (!scene.textures.exists(HAWK_KEY)) canvasTexture(scene, HAWK_KEY, 64, 64, (ctx) => drawHawk(ctx, 64, 64))
  if (!scene.textures.exists(FLUFF_KEY)) canvasTexture(scene, FLUFF_KEY, 16, 16, (ctx) => drawFluff(ctx, 16))
}

/**
 * 草甸：地面与树冠是开局在后台线程画好的贴图，陡坡与坡上那层草甸画在地面里，按高度场打光、投下影子；两层草甸上风吹出一道道草浪。
 * 栅栏外几只羊在吃草，草地上蝴蝶围着花飞，林子里不时飞出一群小鸟掠过草地，坡上那层草甸的上空有只鹰在盘旋，蒲公英的种子顺风飘。树冠盖在一切之上
 */
export class MeadowView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private decorEids: number[] = []
  private plan?: MeadowPlan
  private painter?: MeadowPainter
  private readonly u = { time: 0 }
  private sheep: SheepFx[] = []
  private butterflies: Butterfly[] = []
  private birds: Bird[] = []
  private hawk?: { a: number; readonly cx: number; readonly cy: number; readonly img: Phaser.GameObjects.Image }
  private shadows?: Phaser.GameObjects.Graphics
  private flockAt = 0
  private bleatAt = 0
  private readonly local: Local = { a: 0, b: 0 }

  private planOf(v: ViewCtx): MeadowPlan {
    if (!this.plan) this.plan = meadowPlanFor(v.def.meadow!, v.run.decorSeed)
    return this.plan
  }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const p = this.planOf(v)
    return { w: p.size * UNIT, h: p.size * UNIT, origin: { x: p.start.x * UNIT, y: p.start.y * UNIT } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-2)))
    ensureCritters(v.scene)
  }

  framing(v: ViewCtx): Framing {
    return { map: { x: 0, y: 0, w: v.w, h: v.h }, edge: 'clamp' }
  }

  /** 野花只开在草地上，不长在路上，离边有一点距离 */
  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const plan = this.planOf(v)
    const rng = new Rng(v.run.decorSeed)
    for (const d of rollDecor(v.def.decor, () => rng.next(), plan.size, plan.size)) {
      const x = d.xU * UNIT
      const y = d.yU * UNIT
      if (roomAt(plan.basin, x, y) < (d.sizeU / 2 + 0.3) * UNIT) continue
      if (plan.paths.some((p) => polylineDist(p, d.xU, d.yU) < 0.6)) continue
      this.decorEids.push(spawnDecor(v.world, atlas, { id: d.emoji, outline: 'player', x, y, size: d.sizeU * UNIT, rot: d.rotation * 0.3, alpha: d.alpha, z: 1 }))
    }
  }

  async onSimReady(v: ViewCtx, _sim: Sim): Promise<void> {
    const plan = this.planOf(v)
    const cfg = v.def.meadow!
    const scene = v.scene
    const sc: PaintScene = { cfg, plan }
    const sizes: Record<PaintLayer, { w: number; h: number }> = { ground: textureSize(sc, 'ground'), canopy: textureSize(sc, 'canopy') }
    const tex: Record<PaintLayer, Phaser.Textures.CanvasTexture> = {
      ground: canvasTexture(scene, GROUND_KEY, sizes.ground.w, sizes.ground.h),
      canopy: canvasTexture(scene, CANOPY_KEY, sizes.canopy.w, sizes.canopy.h),
    }
    const painter = new MeadowPainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const tasks: PaintTask[] = []
    for (const layer of ['canopy', 'ground'] as const) {
      const sz = sizes[layer]
      for (let y = 0; y < sz.h; y += STRIP_PX) tasks.push({ layer, rect: { x0: 0, y0: y, x1: sz.w, y1: Math.min(sz.h, y + STRIP_PX) } })
    }
    const put = (p: PaintPiece): void => {
      tex[p.layer].getContext().putImageData(new ImageData(p.pixels, p.rect.x1 - p.rect.x0, p.rect.y1 - p.rect.y0), p.rect.x0, p.rect.y0)
    }
    await painter.paint(tasks, put)
    painter.close()
    if (this.painter !== painter) return
    this.painter = undefined
    for (const t of Object.values(tex)) upload(t)
    const ga = groundArea(sc)
    this.visuals.push(scene.add.image(ga.x0 * UNIT, ga.y0 * UNIT, GROUND_KEY).setOrigin(0, 0).setDisplaySize((sizes.ground.w / GROUND_PPU) * UNIT, (sizes.ground.h / GROUND_PPU) * UNIT).setDepth(-1))
    this.grass(v, sc, plan, ga)
    this.visuals.push(scene.add.image(ga.x0 * UNIT, ga.y0 * UNIT, CANOPY_KEY).setOrigin(0, 0).setDisplaySize((sizes.canopy.w / CANOPY_PPU) * UNIT, (sizes.canopy.h / CANOPY_PPU) * UNIT).setDepth(20))
    this.shadows = scene.add.graphics().setDepth(-0.85)
    this.visuals.push(this.shadows)
    this.herd(v, plan)
    this.flutter(v, plan)
    this.soar(v, plan)
    this.seeds(v, plan)
    this.flockAt = 6000 + Math.random() * 10000
    this.bleatAt = BLEAT_MS.min
    scene.cameras.main.filters?.internal.addVignette(0.5, 0.5, 0.72, 0.2, 0x000000)
  }

  /** 草浪：遮罩标出哪里是草，着色器顺着风吹出一道道亮的草浪 */
  private grass(v: ViewCtx, sc: PaintScene, plan: MeadowPlan, ga: Area): void {
    const scene = v.scene
    const m = grassMask(sc)
    canvasTexture(scene, MASK_KEY, m.w, m.h, (ctx) => ctx.putImageData(new ImageData(m.data, m.w, m.h), 0, 0))
    const u = this.u
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'MeadowGrass',
            fragmentSource: GRASS_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uMask', 0)
              set('uArea', [ga.x0, ga.y0, m.w / MASK_PPU, m.h / MASK_PPU])
              set('uTime', u.time)
              set('uWind', [plan.wind.x, plan.wind.y])
            },
          },
          ga.x0 * UNIT,
          ga.y0 * UNIT,
          (m.w / MASK_PPU) * UNIT,
          (m.h / MASK_PPU) * UNIT,
          [MASK_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(-0.95),
    )
  }

  /** 栅栏外的羊 */
  private herd(v: ViewCtx, plan: MeadowPlan): void {
    const scene = v.scene
    for (const s of plan.sheep) {
      const body = scene.add.image(0, 0, SHEEP_KEY).setDepth(0.9).setDisplaySize(SHEEP_U.len * UNIT, SHEEP_U.wid * UNIT)
      const head = scene.add.image(0, 0, HEAD_KEY).setDepth(0.91).setDisplaySize(SHEEP_U.head * UNIT, SHEEP_U.head * UNIT)
      this.visuals.push(body, head)
      this.sheep.push({ x: s.x, y: s.y, heading: s.heading, turn: s.heading, walk: 0, rest: 2 + Math.random() * 6, phase: Math.random() * 10, look: 0, body, head })
    }
  }

  /** 草地上的蝴蝶：各自守着一片地方飞 */
  private flutter(v: ViewCtx, plan: MeadowPlan): void {
    const scene = v.scene
    const rng = new Rng(plan.seed ^ 0xb7f1)
    for (let i = 0, tries = 0; i < BUTTERFLIES && tries < 400; tries++) {
      const x = rng.next() * plan.size
      const y = rng.next() * plan.size
      if (roomAt(plan.basin, x * UNIT, y * UNIT) < 1.5 * UNIT) continue
      const img = scene.add
        .image(x * UNIT, y * UNIT, BUTTERFLY_KEY)
        .setDepth(21)
        .setTint(BUTTERFLY_TINTS[i % BUTTERFLY_TINTS.length]!)
        .setDisplaySize(BUTTERFLY_U * UNIT, BUTTERFLY_U * UNIT)
      this.visuals.push(img)
      this.butterflies.push({ x, y, vx: 0, vy: 0, tx: x, ty: y, hx: x, hy: y, flap: rng.next() * 10, img })
      i++
    }
  }

  /** 坡上那层草甸上空盘旋的鹰：圈心在坡顶往外几格，绕着圈时不时飞到下面草地的上空 */
  private soar(v: ViewCtx, plan: MeadowPlan): void {
    const rng = new Rng(plan.seed ^ 0x4a3c)
    const b = plan.size * (0.2 + rng.next() * 0.6)
    const c = toMap(plan.frame, footAt(plan.edges, b) - bankWidth(plan.edges, b) - 1.5 - rng.next() * 2, b)
    const img = v.scene.add.image(0, 0, HAWK_KEY).setDepth(36)
    this.visuals.push(img)
    this.hawk = { a: rng.next() * Math.PI * 2, cx: c.x, cy: c.y, img }
  }

  /** 顺风飘的蒲公英种子：在镜头里随处冒出来 */
  private seeds(v: ViewCtx, plan: MeadowPlan): void {
    const cam = v.scene.cameras.main
    const sp = 1.2 * UNIT
    this.visuals.push(
      v.scene.add
        .particles(0, 0, FLUFF_KEY, {
          lifespan: { min: 5000, max: 8000 },
          frequency: 420,
          speedX: { min: plan.wind.x * sp * 0.6 - 10, max: plan.wind.x * sp * 1.3 + 10 },
          speedY: { min: plan.wind.y * sp * 0.6 - 10, max: plan.wind.y * sp * 1.3 + 10 },
          scale: { min: 0.28, max: 0.45 },
          alpha: { start: 0.75, end: 0 },
          rotate: { min: 0, max: 360 },
          emitZone: {
            type: 'random',
            source: {
              getRandomPoint: (p: Phaser.Types.Math.Vector2Like): void => {
                p.x = cam.worldView.x + Math.random() * cam.worldView.width
                p.y = cam.worldView.y + Math.random() * cam.worldView.height
              },
            },
          },
        })
        .setDepth(34),
    )
  }

  /** 这一点在不在牧场里：栅栏外、林子外、离坡脚一格以上，在画过的地方以内 */
  private inPasture(plan: MeadowPlan, cfg: MeadowConfig, x: number, y: number): boolean {
    const pad = cfg.padU - 1
    if (x < -pad || y < -pad || x > plan.size + pad || y > plan.size + pad) return false
    const L = toLocal(plan.frame, x, y, this.local)
    return beyondFence(plan.edges, L.a, L.b) > 0.9 && forestDepth(plan.edges, L.a, L.b) < -0.9 && L.a - footAt(plan.edges, L.b) > 1
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const plan = this.plan
    const g = this.shadows
    if (!plan || !g) return
    const cfg = v.def.meadow!
    const dt = Math.min(delta, 50) / 1000
    const now = sim.elapsedMs
    this.u.time = now / 1000
    const cam = v.scene.cameras.main
    const view = cam.worldView
    const lead = sim.leader
    const lx = Transform.x[lead]! / UNIT
    const ly = Transform.y[lead]! / UNIT
    const shx = (-SUN.x / SUN.z / cfg.meterPerU) * UNIT
    const shy = (-SUN.y / SUN.z / cfg.meterPerU) * UNIT
    g.clear()
    // 羊：低头吃草，隔一阵抬脚走几步换个地方；队长走近栅栏时抬头张望
    for (const s of this.sheep) {
      const near = Math.hypot(s.x - lx, s.y - ly) < 4
      s.look += ((near ? 1 : 0) - s.look) * Math.min(1, dt * 3)
      if (s.walk > 0) {
        s.walk -= dt
        s.heading += Math.atan2(Math.sin(s.turn - s.heading), Math.cos(s.turn - s.heading)) * Math.min(1, dt * 2)
        const nx = s.x + Math.cos(s.heading) * 0.35 * dt
        const ny = s.y + Math.sin(s.heading) * 0.35 * dt
        const crowded = this.sheep.some((o) => o !== s && Math.hypot(o.x - nx, o.y - ny) < 1.5 && Math.hypot(o.x - nx, o.y - ny) < Math.hypot(o.x - s.x, o.y - s.y))
        if (this.inPasture(plan, cfg, nx, ny) && !crowded) {
          s.x = nx
          s.y = ny
        } else {
          s.turn = s.heading + Math.PI * (0.6 + Math.random() * 0.8)
        }
        if (s.walk <= 0) s.rest = 3 + Math.random() * 8
      } else {
        s.rest -= dt
        if (s.rest <= 0) {
          s.walk = 1.2 + Math.random() * 2.5
          s.turn = s.heading + (Math.random() * 2 - 1) * 1.6
        }
      }
      s.phase += dt
      const graze = s.walk > 0 ? 0 : 1 - s.look
      const reach = 0.62 + 0.08 * graze + 0.04 * graze * Math.sin(s.phase * 2.6)
      const sway = graze * 0.12 * Math.sin(s.phase * 1.3)
      const hx = Math.cos(s.heading)
      const hy = Math.sin(s.heading)
      const bob = s.walk > 0 ? 0.03 * Math.sin(s.phase * 9) : 0
      s.body.setPosition((s.x + hx * bob) * UNIT, (s.y + hy * bob) * UNIT).setRotation(s.heading)
      s.head.setPosition((s.x + (hx - hy * sway) * reach) * UNIT, (s.y + (hy + hx * sway) * reach) * UNIT).setRotation(s.heading + sway)
      g.fillStyle(0x000000, 0.16)
      g.save()
      g.translateCanvas(s.x * UNIT + shx * 0.3, s.y * UNIT + shy * 0.3)
      g.rotateCanvas(s.heading)
      g.fillEllipse(0, 0, SHEEP_U.len * UNIT * 0.95, SHEEP_U.wid * UNIT * 0.9)
      g.restore()
    }
    if (now >= this.bleatAt) {
      this.bleatAt = now + BLEAT_MS.min + Math.random() * (BLEAT_MS.max - BLEAT_MS.min)
      if (this.sheep.some((s) => view.contains(s.x * UNIT, s.y * UNIT))) playSfx('bleat')
    }
    // 蝴蝶：围着自己那片花飞来飞去，有身体走近就惊起飞开
    for (const b of this.butterflies) {
      let scared = false
      for (const eid of query(sim.world, [Transform, Radius])) {
        if (!Alive.v[eid] || hasComponent(sim.world, eid, Pickup) || hasComponent(sim.world, eid, Airborne)) continue
        const dx = b.x - Transform.x[eid]! / UNIT
        const dy = b.y - Transform.y[eid]! / UNIT
        const d = Math.hypot(dx, dy)
        if (d > 1.2 + Radius.v[eid]! / UNIT) continue
        scared = true
        b.tx = b.x + (dx / (d || 1)) * 3
        b.ty = b.y + (dy / (d || 1)) * 3
        break
      }
      if (!scared && Math.hypot(b.tx - b.x, b.ty - b.y) < 0.3) {
        const a = Math.random() * Math.PI * 2
        const r = Math.random() * 2.5
        b.tx = b.hx + Math.cos(a) * r
        b.ty = b.hy + Math.sin(a) * r
      }
      b.flap += dt * 14
      const speed = scared ? 3 : 1.1
      const dx = b.tx - b.x
      const dy = b.ty - b.y
      const d = Math.hypot(dx, dy) || 1
      const jitter = Math.sin(b.flap * 0.37) * 0.9
      b.vx += ((dx / d) * speed - (dy / d) * jitter - b.vx) * Math.min(1, dt * 3)
      b.vy += ((dy / d) * speed + (dx / d) * jitter - b.vy) * Math.min(1, dt * 3)
      b.x += b.vx * dt
      b.y += b.vy * dt
      const open = 0.35 + 0.65 * Math.abs(Math.sin(b.flap))
      const alt = 0.35 + 0.15 * Math.sin(b.flap * 0.21)
      b.img.setPosition(b.x * UNIT, (b.y - alt * 0.3) * UNIT).setRotation(Math.atan2(b.vy, b.vx)).setDisplaySize(BUTTERFLY_U * UNIT * 0.6, BUTTERFLY_U * UNIT * open)
      g.fillStyle(0x000000, 0.18)
      g.fillCircle(b.x * UNIT + shx * alt, b.y * UNIT + shy * alt, BUTTERFLY_U * UNIT * 0.2)
    }
    this.flock(v, plan, now, dt, shx, shy)
    // 鹰：在坡上那层草甸的上空慢慢绕圈，影子从两层草地上掠过
    const eg = this.hawk
    if (eg) {
      eg.a += HAWK.rate * dt
      const ex = eg.cx + Math.cos(eg.a) * HAWK.radius
      const ey = eg.cy + Math.sin(eg.a) * HAWK.radius * 0.8
      const heading = Math.atan2(Math.cos(eg.a) * 0.8, -Math.sin(eg.a))
      eg.img.setPosition(ex * UNIT, ey * UNIT).setRotation(heading).setDisplaySize(HAWK.span * UNIT * 1.1, HAWK.span * UNIT)
      g.fillStyle(0x000000, 0.14)
      g.save()
      g.translateCanvas(ex * UNIT + shx * HAWK.altM, ey * UNIT + shy * HAWK.altM)
      g.rotateCanvas(heading)
      g.fillEllipse(0, 0, HAWK.span * UNIT * 0.5, HAWK.span * UNIT * 0.9)
      g.restore()
    }
  }

  /** 一群小鸟：隔一阵从林缘飞出来，掠过草地，往坡上那边飞走；影子在地上跟着跑 */
  private flock(v: ViewCtx, plan: MeadowPlan, now: number, dt: number, shx: number, shy: number): void {
    const g = this.shadows!
    const scene = v.scene
    if (now >= this.flockAt && this.birds.length === 0) {
      this.flockAt = now + FLOCK_MS.min + Math.random() * (FLOCK_MS.max - FLOCK_MS.min)
      const view = scene.cameras.main.worldView
      const edge = plan.trees.filter((t) => {
        const L = toLocal(plan.frame, t.x, t.y, this.local)
        return forestDepth(plan.edges, L.a, L.b) < 2.5 && view.contains(t.x * UNIT, t.y * UNIT)
      })
      const from = edge[Math.floor(Math.random() * edge.length)]
      if (from) {
        const f = plan.frame
        const ang = Math.atan2(-f.ny, -f.nx) + (Math.random() * 2 - 1) * 0.7
        const n = FLOCK.min + Math.floor(Math.random() * (FLOCK.max - FLOCK.min + 1))
        for (let i = 0; i < n; i++) {
          const img = scene.add.image(0, 0, BIRD_KEY).setDepth(36).setDisplaySize(BIRD_U * UNIT, BIRD_U * UNIT)
          this.visuals.push(img)
          const a = ang + (Math.random() * 2 - 1) * 0.15
          const sp = BIRD_SPEED_U * (0.9 + Math.random() * 0.2)
          this.birds.push({ x: from.x + (Math.random() - 0.5) * 2, y: from.y + (Math.random() - 0.5) * 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, flap: Math.random() * 6, img })
        }
        playSfx('chirp')
      }
    }
    const reach = plan.size + 20
    this.birds = this.birds.filter((b) => {
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.flap += dt * 16
      if (b.x < -20 || b.y < -20 || b.x > reach || b.y > reach) {
        b.img.destroy()
        this.visuals = this.visuals.filter((o) => o !== b.img)
        return false
      }
      const open = 0.45 + 0.55 * Math.abs(Math.sin(b.flap))
      b.img.setPosition(b.x * UNIT, b.y * UNIT).setRotation(Math.atan2(b.vy, b.vx)).setDisplaySize(BIRD_U * UNIT * 0.8, BIRD_U * UNIT * open)
      g.fillStyle(0x000000, 0.16)
      g.fillEllipse(b.x * UNIT + shx * BIRD_ALT_M, b.y * UNIT + shy * BIRD_ALT_M, BIRD_U * UNIT * 0.5, BIRD_U * UNIT * 0.5 * open)
      return true
    })
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    for (const eid of this.decorEids) removeEntity(v.world, eid)
    this.visuals = []
    this.decorEids = []
    this.sheep = []
    this.butterflies = []
    this.birds = []
    this.hawk = undefined
    this.shadows = undefined
    for (const key of [GROUND_KEY, CANOPY_KEY, MASK_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
