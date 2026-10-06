import Phaser from 'phaser'
import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { AWAY } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { playSfx } from '../../audio/sfx'
import { Rng } from '../../util/rng'
import { Alive, Faction, Phys, Pickup, Radius, Span, Transform, Uid, VisOff } from '../../ecs/components'
import { ART } from '../../ecs/utils/ground'
import { canvasTexture, drawSpark } from '../textures'
import { FRAME } from '../frame'
import { CANOPY_PPU, crownBox, GROUND_AREA, MASK_PPU, textureSize, waterMask } from './ground'
import { SwampPainter } from './painter'
import { MIST_FRAG, WATER_FRAG } from './shader'
import { inPond, inShore, shoreAt } from './layout'
import { inMud, lootSunk, mireOf, swampPlanFor } from './world'
import { drawDragonfly, drawEgret, drawEgretFlying, drawFrog } from './critters'
import type { SwampState } from './world'
import type { PaintTask } from './painter'
import type { PaintLayer, PaintPiece, PaintScene } from './ground'
import type { SwampPlan } from './layout'
import type { EcsAtlas } from '../../ecs/atlas'
import type { MapView, ViewCtx } from '../../ecs/views'
import type { Framing } from '../../ecs/lens'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'

/** 方框外的底色：雾里的深水 */
const BG = 0x1c2e29
const GROUND_KEY = 'swamp-ground'
const CANOPY_KEY = 'swamp-canopy'
const CROWNS_KEY = 'swamp-crowns'
const MASK_KEY = 'swamp-water'
const DRAGONFLY_KEY = 'swamp-dragonfly'
const FROG_KEY = 'swamp-frog'
const EGRET_KEY = 'swamp-egret'
const EGRET_FLY_KEY = 'swamp-egret-fly'
const GLOW_KEY = 'swamp-glow'
const PAINT_THREADS = 4
const STRIP_PX = 64
/** 风从哪边来（画面上的单位向量）：雾与水纹顺着它漂 */
const WIND = { x: 0.86, y: 0.5 } as const
/** 身体陷到最深时没进泥里的那一截占画框高的多少：头总还露在外面 */
const SINK_SHOW = 0.55
/** 掉落物沉到底时没进去多少：沉没的那一刻刚好看不见 */
const LOOT_SHOW = 0.95
/** 树下有队员时树冠淡到多少，淡下去与回来的快慢（每秒） */
const CROWN_FADE = { alpha: 0.32, rate: 4 } as const
/** 泥浆、泡泡与水纹的颜色 */
const MUD = { body: 0x4f3a2a, lip: 0x8a6a4c, sheen: 0xc7ad86, wet: 0x2f241b } as const
/** 几只蜻蜓、几点萤火、几只青蛙 */
const DRAGONFLIES = 5
const FIREFLIES = 28
const FROGS = 4
/** 蜻蜓翅展、青蛙、白鹭（格） */
const DRAGONFLY_U = 0.5
const FROG_U = 0.36
const EGRET_U = { w: 1.3, h: 0.62, fly: 1.9 } as const

/** 一圈往外扩、慢慢淡掉的纹：泥里走过的、沉下去的、冒泡的 */
interface Ring {
  x: number
  y: number
  r0: number
  r1: number
  age: number
  readonly life: number
  readonly alpha: number
  readonly color: number
}

/** 泥面上鼓起来的一个泡：长大、破掉、留下一圈纹 */
interface Bubble {
  x: number
  y: number
  r: number
  age: number
  readonly life: number
}

interface Dragonfly {
  x: number
  y: number
  tx: number
  ty: number
  heading: number
  rest: number
  flap: number
  readonly img: Phaser.GameObjects.Image
}

interface Firefly {
  x: number
  y: number
  vx: number
  vy: number
  readonly hx: number
  readonly hy: number
  phase: number
  readonly rate: number
}

interface Frog {
  pad: number
  x: number
  y: number
  heading: number
  /** 跳水：从哪跳到哪、跳了多久；hidden 是沉在水里还有多久冒出来 */
  jump: { fx: number; fy: number; tx: number; ty: number; t: number } | null
  hidden: number
  croak: number
  readonly img: Phaser.GameObjects.Image
}

interface Egret {
  x: number
  y: number
  heading: number
  walk: number
  rest: number
  fly: { fx: number; fy: number; tx: number; ty: number; t: number; ms: number } | null
  flap: number
  readonly stand: Phaser.GameObjects.Image
  readonly wings: Phaser.GameObjects.Image
}

/**
 * 泥潭：地面、岸外的树冠与香蒲、土台上的树冠是开局在后台线程画好的贴图；水面上一道道细纹随风漂，晨雾一片片贴着水面漂，方框边上把水面藏进雾里。
 * 陷进泥里的身体往下沉、只露出泥面以上的那一截，脚下一圈泥浆，被困住时泥浆更宽、挣的时候溅起泥点，呛泥时冒泡；泥里走过留下一圈圈纹，
 * 掉落物沉没时冒一个泡。泥眼不时鼓起一个泡、破掉；土台上的树下有队员时树冠淡下去。蜻蜓在泥与水上停停飞飞，萤火在雾里一闪一闪，
 * 青蛙蹲在睡莲叶上、有人走近就跳进水里，白鹭站在浅水里、被惊起就飞到别处
 */
export class SwampView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private plan?: SwampPlan
  private painter?: SwampPainter
  private state?: SwampState
  private world?: ViewCtx['world']
  private readonly u = { time: 0 }
  private crowns: { readonly x: number; readonly y: number; readonly r: number; readonly img: Phaser.GameObjects.Image; alpha: number }[] = []
  private low?: Phaser.GameObjects.Graphics
  private back?: Phaser.GameObjects.Graphics
  private front?: Phaser.GameObjects.Graphics
  private shadows?: Phaser.GameObjects.Graphics
  private glow?: Phaser.GameObjects.Graphics
  private rings: Ring[] = []
  private bubbles: Bubble[] = []
  private trailAt = new Map<number, number>()
  private chokeAt = new Map<number, number>()
  private ventAt: number[] = []
  private dragonflies: Dragonfly[] = []
  private fireflies: Firefly[] = []
  private frogs: Frog[] = []
  private egret?: Egret

  private planOf(v: ViewCtx): SwampPlan {
    if (!this.plan) this.plan = swampPlanFor(v.def.swamp!, v.run.decorSeed)
    return this.plan
  }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const p = this.planOf(v)
    return { w: FRAME.w, h: FRAME.h, origin: { x: p.start.x * UNIT, y: p.start.y * UNIT } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-2)))
    const scene = v.scene
    if (!scene.textures.exists(DRAGONFLY_KEY)) canvasTexture(scene, DRAGONFLY_KEY, 64, 64, (ctx) => drawDragonfly(ctx, 64))
    if (!scene.textures.exists(FROG_KEY)) canvasTexture(scene, FROG_KEY, 48, 48, (ctx) => drawFrog(ctx, 48))
    if (!scene.textures.exists(EGRET_KEY)) canvasTexture(scene, EGRET_KEY, 128, 60, (ctx) => drawEgret(ctx, 128, 60))
    if (!scene.textures.exists(EGRET_FLY_KEY)) canvasTexture(scene, EGRET_FLY_KEY, 128, 128, (ctx) => drawEgretFlying(ctx, 128))
    if (!scene.textures.exists(GLOW_KEY)) canvasTexture(scene, GLOW_KEY, 32, 32, (ctx) => drawSpark(ctx, 32))
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  /** 泥上与水上都不撒 emoji */
  decor(_v: ViewCtx, _atlas: EcsAtlas): void {}

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const st = sim.worldState.swamp
    if (!st) return
    this.state = st
    this.world = v.world
    const plan = this.planOf(v)
    const scene = v.scene
    const sc: PaintScene = { cfg: v.def.swamp!, plan }
    const layers: readonly PaintLayer[] = ['ground', 'canopy', 'crowns']
    const keys: Record<PaintLayer, string> = { ground: GROUND_KEY, canopy: CANOPY_KEY, crowns: CROWNS_KEY }
    const tex = {} as Record<PaintLayer, Phaser.Textures.CanvasTexture>
    for (const l of layers) {
      const sz = textureSize(l)
      tex[l] = canvasTexture(scene, keys[l], sz.w, sz.h)
    }
    const painter = new SwampPainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const tasks: PaintTask[] = []
    for (const layer of layers) {
      const sz = textureSize(layer)
      for (let y = 0; y < sz.h; y += STRIP_PX) tasks.push({ layer, rect: { x0: 0, y0: y, x1: sz.w, y1: Math.min(sz.h, y + STRIP_PX) } })
    }
    const put = (p: PaintPiece): void => {
      tex[p.layer].getContext().putImageData(new ImageData(p.pixels, p.rect.x1 - p.rect.x0, p.rect.y1 - p.rect.y0), p.rect.x0, p.rect.y0)
    }
    await painter.paint(tasks, put)
    painter.close()
    if (this.painter !== painter) return
    this.painter = undefined
    for (const l of layers) upload(tex[l])
    const ga = GROUND_AREA
    const gs = textureSize('ground')
    this.visuals.push(scene.add.image(ga.x0 * UNIT, ga.y0 * UNIT, GROUND_KEY).setOrigin(0, 0).setDisplaySize((gs.w / GROUND_PPU) * UNIT, (gs.h / GROUND_PPU) * UNIT).setDepth(-1))
    this.waterLayer(v, sc)
    this.low = scene.add.graphics().setDepth(-0.6)
    this.back = scene.add.graphics().setDepth(2.6)
    this.front = scene.add.graphics().setDepth(8.5)
    this.shadows = scene.add.graphics().setDepth(-0.55)
    this.glow = scene.add.graphics().setDepth(34).setBlendMode(Phaser.BlendModes.ADD)
    this.visuals.push(this.low, this.back, this.front, this.shadows, this.glow)
    const cs = textureSize('canopy')
    this.visuals.push(scene.add.image(ga.x0 * UNIT, ga.y0 * UNIT, CANOPY_KEY).setOrigin(0, 0).setDisplaySize((cs.w / CANOPY_PPU) * UNIT, (cs.h / CANOPY_PPU) * UNIT).setDepth(20))
    this.crownLayer(v, plan, tex.crowns)
    this.mistLayer(v)
    this.critters(v, plan)
    this.ventAt = plan.vents.map(() => 500 + Math.random() * 3000)
    v.lens.screen.vignette(0.78, 0.16, 0x16231f)
  }

  /** 水面的细纹：遮罩标出哪里是开阔的水 */
  private waterLayer(v: ViewCtx, sc: PaintScene): void {
    const m = waterMask(sc)
    canvasTexture(v.scene, MASK_KEY, m.w, m.h, (ctx) => ctx.putImageData(new ImageData(m.data, m.w, m.h), 0, 0))
    const ga = GROUND_AREA
    const u = this.u
    this.visuals.push(
      v.scene.add
        .shader(
          {
            name: 'SwampWater',
            fragmentSource: WATER_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uMask', 0)
              set('uArea', [ga.x0, ga.y0, m.w / MASK_PPU, m.h / MASK_PPU])
              set('uTime', u.time)
              set('uWind', [WIND.x, WIND.y])
            },
          },
          ga.x0 * UNIT,
          ga.y0 * UNIT,
          (m.w / MASK_PPU) * UNIT,
          (m.h / MASK_PPU) * UNIT,
          [MASK_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(-0.9),
    )
  }

  /** 晨雾：盖在一切之上，水上浓、岸上淡，方框边上更浓 */
  private mistLayer(v: ViewCtx): void {
    const ga = GROUND_AREA
    const u = this.u
    this.visuals.push(
      v.scene.add
        .shader(
          {
            name: 'SwampMist',
            fragmentSource: MIST_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uMask', 0)
              set('uArea', [ga.x0, ga.y0, ga.w, ga.h])
              set('uTime', u.time)
              set('uWind', [WIND.x, WIND.y])
              set('uFrame', ga.w)
            },
          },
          ga.x0 * UNIT,
          ga.y0 * UNIT,
          ga.w * UNIT,
          ga.h * UNIT,
          [MASK_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(33),
    )
  }

  /** 土台上的树冠一棵一棵裁出来：树下有队员时单独淡下去 */
  private crownLayer(v: ViewCtx, plan: SwampPlan, src: Phaser.Textures.CanvasTexture): void {
    const ctx = src.getContext()
    plan.trees.forEach((t, i) => {
      if (t.inWater) return
      const b = crownBox(t)
      const x0 = Math.floor(b.x0 * CANOPY_PPU)
      const y0 = Math.floor(b.y0 * CANOPY_PPU)
      const w = Math.ceil(b.x1 * CANOPY_PPU) - x0
      const h = Math.ceil(b.y1 * CANOPY_PPU) - y0
      const key = `${CROWNS_KEY}-${i}`
      const part = ctx.getImageData(x0, y0, w, h)
      canvasTexture(v.scene, key, w, h, (c) => c.putImageData(part, 0, 0))
      const img = v.scene.add
        .image((x0 / CANOPY_PPU) * UNIT, (y0 / CANOPY_PPU) * UNIT, key)
        .setOrigin(0, 0)
        .setDisplaySize((w / CANOPY_PPU) * UNIT, (h / CANOPY_PPU) * UNIT)
        .setDepth(20)
      this.visuals.push(img)
      this.crowns.push({ x: t.x * UNIT, y: t.y * UNIT, r: t.crown * UNIT, img, alpha: 1 })
    })
  }

  /** 蜻蜓、萤火、青蛙与白鹭 */
  private critters(v: ViewCtx, plan: SwampPlan): void {
    const scene = v.scene
    const rng = new Rng(plan.seed ^ 0x7e11)
    for (let i = 0; i < DRAGONFLIES; i++) {
      const p = this.anywhere(plan, rng)
      const img = scene.add.image(p.x * UNIT, p.y * UNIT, DRAGONFLY_KEY).setDepth(35).setDisplaySize(DRAGONFLY_U * UNIT, DRAGONFLY_U * UNIT)
      this.visuals.push(img)
      this.dragonflies.push({ x: p.x, y: p.y, tx: p.x, ty: p.y, heading: rng.next() * Math.PI * 2, rest: rng.next() * 3, flap: rng.next() * 10, img })
    }
    for (let i = 0; i < FIREFLIES; i++) {
      const home = rng.next() < 0.55 && plan.trees.length > 0 ? plan.trees[Math.floor(rng.next() * plan.trees.length)]! : null
      const a = rng.next() * Math.PI * 2
      const p = home ? { x: home.x + Math.cos(a) * home.crown * (0.8 + rng.next() * 0.8), y: home.y + Math.sin(a) * home.crown * (0.8 + rng.next() * 0.8) } : this.shoreline(plan, rng, 0.5)
      this.fireflies.push({ x: p.x, y: p.y, vx: 0, vy: 0, hx: p.x, hy: p.y, phase: rng.next() * 10, rate: 0.6 + rng.next() * 0.9 })
    }
    const pads = plan.lilies.map((l, i) => ({ l, i })).filter(({ l }) => !l.bloom && l.r > 0.28 && inShore(plan, l.x, l.y) > -3)
    for (let i = 0; i < Math.min(FROGS, pads.length); i++) {
      const { l, i: k } = pads[Math.floor(rng.next() * pads.length)]!
      if (this.frogs.some((f) => f.pad === k)) continue
      const img = scene.add.image(l.x * UNIT, l.y * UNIT, FROG_KEY).setDepth(0.95).setDisplaySize(FROG_U * UNIT, FROG_U * UNIT)
      this.visuals.push(img)
      this.frogs.push({ pad: k, x: l.x, y: l.y, heading: Math.atan2(plan.cy - l.y, plan.cx - l.x) + (rng.next() - 0.5), jump: null, hidden: 0, croak: 4000 + rng.next() * 9000, img })
    }
    const spot = this.shoreline(plan, rng, 0.8)
    const stand = scene.add.image(spot.x * UNIT, spot.y * UNIT, EGRET_KEY).setDepth(0.96).setDisplaySize(EGRET_U.w * UNIT, EGRET_U.h * UNIT)
    const wings = scene.add.image(spot.x * UNIT, spot.y * UNIT, EGRET_FLY_KEY).setDepth(36).setVisible(false)
    this.visuals.push(stand, wings)
    this.egret = { x: spot.x, y: spot.y, heading: Math.atan2(plan.cy - spot.y, plan.cx - spot.x) + Math.PI / 2, walk: 0, rest: 3, fly: null, flap: 0, stand, wings }
  }

  /** 岸外 out 格左右的浅水里随便一点，格 */
  private shoreline(plan: SwampPlan, rng: Rng, out: number): Point {
    for (let i = 0; i < 40; i++) {
      const a = rng.next() * Math.PI * 2
      const r = shoreAt(plan, a) + out * (0.6 + rng.next() * 0.8)
      const p = { x: plan.cx + Math.cos(a) * r, y: plan.cy + Math.sin(a) * r }
      if (p.x < 1 || p.y < 1 || p.x > FRAME.w / UNIT - 1 || p.y > FRAME.h / UNIT - 1) continue
      if (plan.walks.some((w) => w.pier && Math.hypot(w.pts[w.pts.length - 1]!.x - p.x, w.pts[w.pts.length - 1]!.y - p.y) < 3)) continue
      return p
    }
    return { x: plan.cx, y: plan.cy - shoreAt(plan, -Math.PI / 2) - out }
  }

  /** 泥上或近岸水上随便一点，格 */
  private anywhere(plan: SwampPlan, rng: Rng): Point {
    const a = rng.next() * Math.PI * 2
    const r = Math.sqrt(rng.next()) * (shoreAt(plan, a) + 1.5)
    return { x: plan.cx + Math.cos(a) * r, y: plan.cy + Math.sin(a) * r }
  }

  /** 这个实体陷进地面多深，按画框高的比例：身体按陷的深浅、掉落物按沉下去多少 */
  sunkAt(eid: number): number {
    const s = this.state
    const w = this.world
    if (!s || !w) return 0
    if (hasComponent(w, eid, Pickup)) return lootSunk(s, eid) * LOOT_SHOW
    const m = mireOf(s, eid)
    return m ? m.d * SINK_SHOW : 0
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const s = this.state
    const low = this.low
    if (!s || !low || !this.plan) return
    const dt = Math.min(delta, 50) / 1000
    const now = sim.elapsedMs
    this.u.time = now / 1000
    this.events(v, s)
    this.mire(v, sim, s, now)
    this.vents(v, sim, dt)
    this.drawFx(dt)
    this.fadeCrowns(sim, dt)
    this.shadows!.clear()
    this.glow!.clear()
    this.flyDragonflies(sim, dt)
    this.blinkFireflies(dt)
    this.tendFrogs(v, sim, dt)
    this.tendEgret(v, sim, dt)
  }

  /** 泥潭里刚发生的事：陷住、拔出来、掉落物沉没 */
  private events(v: ViewCtx, s: SwampState): void {
    for (const e of s.events) this.react(v, e)
    s.events.length = 0
  }

  private react(v: ViewCtx, e: SwampState['events'][number]): void {
    const near = v.lens.screen.sees(e.x, e.y, UNIT)
    if (e.kind === 'gulp') {
      this.rings.push({ x: e.x, y: e.y, r0: e.r * 0.4, r1: e.r * 2.6, age: 0, life: 0.9, alpha: 0.6, color: MUD.sheen })
      this.bubbles.push({ x: e.x, y: e.y, r: e.r * 0.8, age: 0, life: 0.45 })
      if (near) playSfx('glug')
      return
    }
    if (e.kind === 'trap') {
      this.rings.push({ x: e.x, y: e.y, r0: e.r * 0.8, r1: e.r * 2.2, age: 0, life: 0.7, alpha: 0.5, color: MUD.lip })
      if (near) playSfx('squelch')
      return
    }
    this.rings.push({ x: e.x, y: e.y, r0: e.r * 0.9, r1: e.r * 2.8, age: 0, life: 0.6, alpha: 0.55, color: MUD.sheen })
    if (near) playSfx('suck')
  }

  /**
   * 陷在泥里的身体：脚下一圈泥浆（被困住时更宽），前面一道泥沿盖住身子的下沿；在泥里走就留下一圈圈纹，挣的时候泥沿抖、溅起泥点，
   * 呛泥时身边不停冒泡；沉下去的掉落物四周一圈湿泥
   */
  private mire(v: ViewCtx, sim: Sim, s: SwampState, now: number): void {
    const back = this.back!
    const front = this.front!
    back.clear()
    front.clear()
    const cfg = v.def.swamp!
    for (const [eid, m] of s.mire) {
      if (m.uid !== Uid.v[eid] || !hasComponent(sim.world, eid, Alive) || !Alive.v[eid] || m.d <= 0.01) continue
      if (Span.lo[eid]! > 0) continue
      const x = Transform.x[eid]! + VisOff.x[eid]!
      const w = Transform.w[eid]!
      const foot = Transform.y[eid]! + VisOff.y[eid]! + (Transform.h[eid]! * ART) / 2
      const mud = inMud(s.plan, Transform.x[eid]!, Transform.y[eid]!)
      const k = Math.min(1, m.d / cfg.sink.trap)
      const shake = m.trapped ? Math.sin(now / 45 + eid) * m.effort * w * 0.03 : 0
      const rw = w * ART * (0.42 + 0.22 * k + (m.trapped ? 0.12 : 0))
      const rh = rw * 0.34
      if (mud) {
        // 脚下一摊被搅开的湿泥：几团深色的泥叠成不规则的一圈，外沿几点泛光
        const cx = x + shake
        back.fillStyle(MUD.wet, 0.42 + 0.25 * k)
        back.fillEllipse(cx, foot, rw * 2.2, rh * 2.2)
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + (eid % 7) + (m.trapped ? Math.sin(now / 160 + i) * 0.15 * m.effort : 0)
          const j = 0.75 + 0.35 * Math.abs(Math.sin(eid * 3.1 + i * 1.7))
          const bx = cx + Math.cos(a) * rw * 1.05 * j
          const by = foot + Math.sin(a) * rh * 1.05 * j
          back.fillStyle(MUD.body, 0.55 + 0.2 * k)
          back.fillEllipse(bx, by, rw * 0.62, rh * 0.62)
          back.fillStyle(MUD.sheen, 0.22 + 0.2 * k)
          back.fillEllipse(bx - rw * 0.08, by - rh * 0.12, rw * 0.22, rh * 0.16)
        }
        // 前面的泥沿：一道厚厚的泥盖住身子的下沿，上沿湿亮，几点泥巴溅在身上
        front.fillStyle(MUD.body, 0.96)
        front.fillEllipse(cx, foot + rh * 0.05, rw * 2.0, rh * 1.05)
        front.fillStyle(MUD.lip, 0.9)
        front.fillEllipse(cx, foot - rh * 0.18, rw * 1.8, rh * 0.42)
        front.fillStyle(MUD.sheen, 0.45)
        front.fillEllipse(cx - rw * 0.4, foot - rh * 0.25, rw * 0.5, rh * 0.18)
        const drips = 2 + (eid % 3)
        for (let i = 0; i < drips; i++) {
          const dx = (Math.sin(eid * 7.3 + i * 2.1) * 0.6) * rw
          const dh = rh * (0.35 + 0.5 * Math.abs(Math.sin(eid * 1.9 + i))) * (0.4 + k)
          front.fillStyle(MUD.body, 0.85)
          front.fillEllipse(cx + dx, foot - rh * 0.25 - dh * 0.5, rw * 0.16, dh)
        }
      } else {
        // 站上实地还带着泥：脚边一圈泥点
        back.fillStyle(MUD.body, 0.45 * m.d)
        back.fillEllipse(x, foot, rw * 1.8, rh * 1.6)
      }
      if (!mud) continue
      const r = Radius.v[eid]!
      // 走过留下的纹
      const last = this.trailAt.get(eid) ?? 0
      if (now - last > 520 && Math.hypot(Phys.vx[eid]!, Phys.vy[eid]!) > cfg.sink.walkU * UNIT) {
        this.trailAt.set(eid, now)
        this.rings.push({ x: Transform.x[eid]!, y: foot, r0: rw * 0.9, r1: rw * 1.8, age: 0, life: 1.1, alpha: 0.16, color: MUD.sheen })
      }
      if (m.trapped && m.effort > 0.3 && Math.random() < 0.25) sim.out.bursts.push({ x: Transform.x[eid]!, y: foot, count: 1, kind: 'mud' })
      // 呛泥：身边不停冒泡
      if (m.d >= cfg.sink.choke) {
        const at = this.chokeAt.get(eid) ?? 0
        if (now - at > 220) {
          this.chokeAt.set(eid, now)
          const a = Math.random() * Math.PI * 2
          this.bubbles.push({ x: x + Math.cos(a) * rw * 0.9, y: foot + Math.sin(a) * rh * 0.9, r: r * (0.18 + Math.random() * 0.14), age: 0, life: 0.5 })
        }
      }
    }
    // 沉在泥里的掉落物：四周一圈湿泥
    for (const [eid, l] of s.loot) {
      if (l.uid !== Uid.v[eid] || !hasComponent(sim.world, eid, Pickup)) continue
      const w = Transform.w[eid]!
      const foot = Transform.y[eid]! + (Transform.h[eid]! * ART) / 2
      back.fillStyle(MUD.wet, 0.25 + 0.45 * l.d)
      back.fillEllipse(Transform.x[eid]!, foot, w * (0.7 + 0.3 * l.d), w * 0.26)
      front.lineStyle(2, MUD.lip, 0.4 + 0.5 * l.d)
      front.beginPath()
      front.arc(Transform.x[eid]!, foot - w * 0.05, w * 0.36, Math.PI * 0.1, Math.PI * 0.9, false)
      front.strokePath()
    }
    if (this.trailAt.size > 256) this.trailAt.clear()
    if (this.chokeAt.size > 256) this.chokeAt.clear()
  }

  /** 泥眼：隔一阵鼓起一个泡、破掉，冒出一圈纹 */
  private vents(v: ViewCtx, sim: Sim, dt: number): void {
    const plan = this.plan!
    plan.vents.forEach((p, i) => {
      this.ventAt[i] = this.ventAt[i]! - dt * 1000
      if (this.ventAt[i]! > 0) return
      this.ventAt[i] = 1400 + Math.random() * 3600
      const a = Math.random() * Math.PI * 2
      const d = Math.random() * 0.25
      this.bubbles.push({ x: (p.x + Math.cos(a) * d) * UNIT, y: (p.y + Math.sin(a) * d) * UNIT, r: (0.12 + Math.random() * 0.14) * UNIT, age: 0, life: 0.8 + Math.random() * 0.5 })
      const lead = sim.leader
      if (Math.random() < 0.35 && Math.hypot(Transform.x[lead]! - p.x * UNIT, Transform.y[lead]! - p.y * UNIT) < 7 * UNIT && v.lens.screen.sees(p.x * UNIT, p.y * UNIT)) playSfx('glug')
    })
  }

  /** 纹与泡 */
  private drawFx(dt: number): void {
    const g = this.low!
    g.clear()
    const keep: Ring[] = []
    for (const r of this.rings) {
      r.age += dt
      if (r.age >= r.life) continue
      keep.push(r)
      const t = r.age / r.life
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - t) * (1 - t))
      g.lineStyle(1.6 + 1.2 * (1 - t), r.color, r.alpha * (1 - t))
      g.strokeEllipse(r.x, r.y, rad * 2, rad * 1.3)
    }
    this.rings = keep
    const left: Bubble[] = []
    for (const b of this.bubbles) {
      b.age += dt
      if (b.age >= b.life) {
        this.rings.push({ x: b.x, y: b.y, r0: b.r * 0.8, r1: b.r * 2.6, age: 0, life: 0.8, alpha: 0.45, color: MUD.sheen })
        continue
      }
      left.push(b)
      const t = b.age / b.life
      const r = b.r * (0.35 + 0.65 * Math.sqrt(t))
      g.fillStyle(MUD.wet, 0.55)
      g.fillCircle(b.x, b.y, r)
      g.lineStyle(1.5, MUD.sheen, 0.7)
      g.strokeCircle(b.x, b.y, r)
      g.fillStyle(0xf3e6c8, 0.75)
      g.fillCircle(b.x - r * 0.35, b.y - r * 0.35, r * 0.22)
    }
    this.bubbles = left
    if (this.rings.length > 160) this.rings.splice(0, this.rings.length - 160)
  }

  /** 土台上的树下有队员时树冠淡下去，走开了再回来 */
  private fadeCrowns(sim: Sim, dt: number): void {
    for (const c of this.crowns) {
      let under = false
      for (const m of sim.characters) {
        if (!Alive.v[m]) continue
        if (Math.hypot(Transform.x[m]! - c.x, Transform.y[m]! - c.y) < c.r * 0.95) under = true
      }
      const want = under ? CROWN_FADE.alpha : 1
      c.alpha += (want - c.alpha) * Math.min(1, dt * CROWN_FADE.rate)
      c.img.setAlpha(c.alpha)
    }
  }

  /** 蜻蜓：停在半空抖着翅膀，隔一会儿猛地飞到几格外，影子在地上跟着 */
  private flyDragonflies(sim: Sim, dt: number): void {
    const plan = this.plan!
    const g = this.shadows!
    for (const d of this.dragonflies) {
      d.flap += dt * 40
      const dx = d.tx - d.x
      const dy = d.ty - d.y
      const dist = Math.hypot(dx, dy)
      if (dist > 0.05) {
        const sp = Math.min(dist, 7 * dt)
        d.x += (dx / dist) * sp
        d.y += (dy / dist) * sp
        d.heading = Math.atan2(dy, dx)
      } else {
        d.rest -= dt
        d.x += Math.sin(d.flap * 0.11) * 0.002
        if (d.rest <= 0) {
          d.rest = 0.8 + Math.random() * 3
          const a = Math.random() * Math.PI * 2
          const r = 1.5 + Math.random() * 4
          let tx = d.x + Math.cos(a) * r
          let ty = d.y + Math.sin(a) * r
          if (inShore(plan, tx, ty) < -4) {
            tx = d.x + (plan.cx - d.x) * 0.3
            ty = d.y + (plan.cy - d.y) * 0.3
          }
          d.tx = tx
          d.ty = ty
        }
      }
      // 被身体惊起：附近有人走过就飞开
      if (dist <= 0.05) {
        for (const m of sim.characters) {
          if (Math.hypot(Transform.x[m]! / UNIT - d.x, Transform.y[m]! / UNIT - d.y) < 1.2) d.rest = 0
        }
      }
      const open = 0.85 + 0.15 * Math.sin(d.flap)
      d.img.setPosition(d.x * UNIT, (d.y - 0.5) * UNIT).setRotation(d.heading).setDisplaySize(DRAGONFLY_U * UNIT * 0.9, DRAGONFLY_U * UNIT * open)
      g.fillStyle(0x000000, 0.14)
      g.fillEllipse((d.x + AWAY.x * 0.9) * UNIT, (d.y + AWAY.y * 0.9) * UNIT, DRAGONFLY_U * UNIT * 0.5, DRAGONFLY_U * UNIT * 0.18)
    }
  }

  /** 萤火：在雾里慢慢游，一闪一闪 */
  private blinkFireflies(dt: number): void {
    const g = this.glow!
    for (const f of this.fireflies) {
      f.phase += dt * f.rate
      f.vx += ((f.hx - f.x) * 0.15 + (Math.random() - 0.5) * 1.2) * dt
      f.vy += ((f.hy - f.y) * 0.15 + (Math.random() - 0.5) * 1.2) * dt
      f.vx *= 1 - dt * 0.8
      f.vy *= 1 - dt * 0.8
      f.x += f.vx * dt
      f.y += f.vy * dt
      const on = Math.pow(Math.max(0, Math.sin(f.phase * Math.PI)), 6)
      if (on < 0.02) continue
      g.fillStyle(0xd7f58a, 0.18 * on)
      g.fillCircle(f.x * UNIT, f.y * UNIT, 0.22 * UNIT)
      g.fillStyle(0xf4ffc4, 0.85 * on)
      g.fillCircle(f.x * UNIT, f.y * UNIT, 0.045 * UNIT)
    }
  }

  /** 有没有身体走近这一点（格） */
  private disturbed(sim: Sim, x: number, y: number, r: number): boolean {
    for (const eid of query(sim.world, [Faction, Transform, Radius])) {
      if (hasComponent(sim.world, eid, Alive) && !Alive.v[eid]) continue
      if (Math.hypot(Transform.x[eid]! / UNIT - x, Transform.y[eid]! / UNIT - y) < r) return true
    }
    return false
  }

  /** 青蛙：蹲在睡莲叶上，时不时鼓着气叫两声；有人走近就跳进水里，过一阵在另一片叶子上冒出来 */
  private tendFrogs(v: ViewCtx, sim: Sim, dt: number): void {
    const plan = this.plan!
    for (const f of this.frogs) {
      if (f.hidden > 0) {
        f.hidden -= dt
        if (f.hidden > 0) continue
        const pads = plan.lilies.map((l, i) => ({ l, i })).filter(({ l, i }) => !l.bloom && l.r > 0.28 && !this.frogs.some((o) => o.pad === i) && !this.disturbed(sim, l.x, l.y, 3))
        const pick = pads[Math.floor(Math.random() * pads.length)]
        if (!pick) {
          f.hidden = 3
          continue
        }
        f.pad = pick.i
        f.x = pick.l.x
        f.y = pick.l.y
        f.heading = Math.random() * Math.PI * 2
        f.img.setVisible(true).setAlpha(0)
        this.rings.push({ x: f.x * UNIT, y: f.y * UNIT, r0: 0.15 * UNIT, r1: 0.6 * UNIT, age: 0, life: 0.8, alpha: 0.4, color: 0xd8e6dc })
      }
      if (f.jump) {
        const j = f.jump
        j.t += dt / 0.4
        const t = Math.min(1, j.t)
        f.x = j.fx + (j.tx - j.fx) * t
        f.y = j.fy + (j.ty - j.fy) * t
        const hop = Math.sin(Math.PI * t) * 0.35
        f.img.setPosition(f.x * UNIT, (f.y - hop) * UNIT).setRotation(f.heading).setDisplaySize(FROG_U * UNIT * (1 + hop), FROG_U * UNIT * (1 + hop))
        if (t >= 1) {
          f.jump = null
          f.hidden = 8 + Math.random() * 10
          f.img.setVisible(false)
          f.pad = -1
          this.rings.push({ x: f.x * UNIT, y: f.y * UNIT, r0: 0.1 * UNIT, r1: 0.9 * UNIT, age: 0, life: 1, alpha: 0.55, color: 0xdbe8e0 }, { x: f.x * UNIT, y: f.y * UNIT, r0: 0.05 * UNIT, r1: 0.5 * UNIT, age: 0, life: 0.7, alpha: 0.4, color: 0xdbe8e0 })
          if (v.lens.screen.sees(f.x * UNIT, f.y * UNIT)) playSfx('plip')
        }
        continue
      }
      f.img.setAlpha(Math.min(1, f.img.alpha + dt * 2))
      if (this.disturbed(sim, f.x, f.y, 1.7)) {
        // 跳进离岸更远的水里
        const away = Math.atan2(f.y - plan.cy, f.x - plan.cx) + (Math.random() - 0.5)
        f.heading = away
        f.jump = { fx: f.x, fy: f.y, tx: f.x + Math.cos(away) * 1.1, ty: f.y + Math.sin(away) * 1.1, t: 0 }
        continue
      }
      f.croak -= dt * 1000
      let puff = 1
      if (f.croak < 0) {
        if (f.croak < -600) f.croak = 7000 + Math.random() * 12000
        else puff = 1 + 0.12 * Math.abs(Math.sin(-f.croak / 60))
        if (f.croak > -dt * 1000 - 1 && v.lens.screen.sees(f.x * UNIT, f.y * UNIT)) playSfx('croak')
      }
      f.img.setPosition(f.x * UNIT, f.y * UNIT).setRotation(f.heading).setDisplaySize(FROG_U * UNIT * puff, FROG_U * UNIT * puff)
    }
  }

  /** 白鹭：站在浅水里，隔一阵抬脚慢慢走几步；有人走近就张开翅膀飞到岸的另一边落下 */
  private tendEgret(v: ViewCtx, sim: Sim, dt: number): void {
    const e = this.egret
    const plan = this.plan!
    if (!e) return
    const g = this.shadows!
    if (e.fly) {
      const f = e.fly
      f.t += dt * 1000
      const t = Math.min(1, f.t / f.ms)
      const ease = t * t * (3 - 2 * t)
      e.x = f.fx + (f.tx - f.fx) * ease
      e.y = f.fy + (f.ty - f.fy) * ease
      const alt = Math.sin(Math.PI * t) * 3
      e.flap += dt * 9
      const beat = 0.65 + 0.35 * Math.abs(Math.sin(e.flap))
      e.wings.setPosition(e.x * UNIT, (e.y - alt * 0.5) * UNIT).setRotation(e.heading).setDisplaySize(EGRET_U.fly * UNIT, EGRET_U.fly * UNIT * beat)
      g.fillStyle(0x000000, 0.12)
      g.fillEllipse((e.x + AWAY.x * alt) * UNIT, (e.y + AWAY.y * alt) * UNIT, EGRET_U.fly * UNIT * 0.4, EGRET_U.fly * UNIT * 0.7 * beat)
      if (t >= 1) {
        e.fly = null
        e.wings.setVisible(false)
        e.stand.setVisible(true)
        e.rest = 2 + Math.random() * 4
        this.rings.push({ x: e.x * UNIT, y: e.y * UNIT, r0: 0.3 * UNIT, r1: 1.2 * UNIT, age: 0, life: 1, alpha: 0.4, color: 0xdbe8e0 })
      }
      return
    }
    if (this.disturbed(sim, e.x, e.y, 2.6)) {
      const rng = new Rng((Math.random() * 0xffffffff) >>> 0)
      let to = this.shoreline(plan, rng, 0.8)
      for (let i = 0; i < 8 && Math.hypot(to.x - e.x, to.y - e.y) < 9; i++) to = this.shoreline(plan, rng, 0.8)
      const dist = Math.hypot(to.x - e.x, to.y - e.y)
      e.fly = { fx: e.x, fy: e.y, tx: to.x, ty: to.y, t: 0, ms: Math.max(1600, (dist / 5) * 1000) }
      e.heading = Math.atan2(to.y - e.y, to.x - e.x)
      e.stand.setVisible(false)
      e.wings.setVisible(true)
      this.rings.push({ x: e.x * UNIT, y: e.y * UNIT, r0: 0.3 * UNIT, r1: 1.4 * UNIT, age: 0, life: 1, alpha: 0.5, color: 0xdbe8e0 })
      if (v.lens.screen.sees(e.x * UNIT, e.y * UNIT)) playSfx('splash')
      return
    }
    if (e.walk > 0) {
      e.walk -= dt
      const nx = e.x + Math.cos(e.heading) * 0.25 * dt
      const ny = e.y + Math.sin(e.heading) * 0.25 * dt
      const wet = Math.max(-inShore(plan, nx, ny), inPond(plan, nx, ny))
      if (wet > 0.3 && wet < 1.6) {
        e.x = nx
        e.y = ny
      } else e.heading += Math.PI * 0.7
      if (e.walk <= 0) e.rest = 3 + Math.random() * 6
    } else {
      e.rest -= dt
      if (e.rest <= 0) {
        e.walk = 1 + Math.random() * 2
        e.heading += (Math.random() - 0.5) * 1.6
      }
    }
    const bob = e.walk > 0 ? Math.sin(sim.elapsedMs / 160) * 0.03 : 0
    e.stand.setPosition(e.x * UNIT, (e.y + bob) * UNIT).setRotation(e.heading)
    g.fillStyle(0x000000, 0.16)
    g.fillEllipse((e.x + AWAY.x * 0.5) * UNIT, (e.y + AWAY.y * 0.5) * UNIT, EGRET_U.w * UNIT * 0.6, EGRET_U.h * UNIT * 0.6)
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    this.crowns = []
    this.rings = []
    this.bubbles = []
    this.dragonflies = []
    this.fireflies = []
    this.frogs = []
    this.egret = undefined
    this.trailAt.clear()
    this.chokeAt.clear()
    this.state = undefined
    this.world = undefined
    this.low = this.back = this.front = this.shadows = this.glow = undefined
    const keys = [GROUND_KEY, CANOPY_KEY, CROWNS_KEY, MASK_KEY, ...(this.plan?.trees ?? []).map((_, i) => `${CROWNS_KEY}-${i}`)]
    for (const key of keys) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}

/** 把画布传上显卡并按线性插值采样：每次上传都会把过滤重设成游戏的默认值，所以上传完要重新设 */
function upload(tex: Phaser.Textures.CanvasTexture): void {
  tex.refresh()
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
}

