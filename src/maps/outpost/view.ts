import Phaser from 'phaser'
import { UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { AWAY, SUN } from '../../data/light'
import { playSfx } from '../../audio/sfx'
import { canvasTexture, drawSpark } from '../textures'
import { FRAME } from '../frame'
import { FACE_U_PER_M, textureSize } from './ground'
import { OutpostPainter } from './painter'
import { FENCE_FRAG, RIPPLE_SLOTS, SEG_SLOTS } from './shader'
import { outpostPlanFor } from './world'
import { groupPhase, live } from './model'
import { segDist } from './layout'
import type { OutpostState } from './world'
import type { OutpostPlan } from './layout'
import type { PaintScene, PixelRect } from './ground'
import type { OutpostConfig } from '../../types/maps'
import type { EcsAtlas } from '../../ecs/atlas'
import type { MapView, ViewCtx } from '../../ecs/views'
import type { Framing } from '../../ecs/lens'
import type { LocalLight } from '../../ecs/render/sprites'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'

/** 方框外的底色：入夜的异星荒原 */
const BG = 0x1b1524
const GROUND_KEY = 'outpost-ground'
const SPARK_KEY = 'outpost-spark'
const DRONE_KEY = 'outpost-drone'
/** 开局最多几个线程分着画；贴图按这么多像素高的条分块交给线程 */
const PAINT_THREADS = 4
const STRIP_PX = 64
/** 各层的深度：地上的光与控制台在躺着的布景之上、身体的影子之下；光墙在影子之上、立着的身体之下；高处的天线碟与无人机盖在一切之上 */
const DEPTH = { glow: 1.4, console: 1.45, consoleFx: 1.46, droneShadow: 2.45, fence: 2.6, beacon: 2.7, sparks: 9, mast: 21, spores: 30, drone: 34 } as const
/** 光墙亮起、熄灭各要多久，秒 */
const RISE_S = 0.28
const FALL_S = 0.36
/** 一圈涟漪荡多久，秒 */
const RIPPLE_S = 0.9
/** 撞上光墙的声音至少隔这么久（毫秒）才再响 */
const SHOCK_MS = 260
/** 离亮着的光墙这么近（格）以内的身体受它的光 */
const LIGHT_U = 1.3
/** 太阳在画面上每升高一米，影子往背光的方向挪多远（格） */
const SHADOW_PER_M = Math.hypot(SUN.x, SUN.y) / SUN.z
/** 无人机：几架、离地多高（米）、绕多大的圈（格）、多快（弧度/秒） */
const DRONES = 2
const DRONE_ALT_M = 3.2
const DRONE_U = 0.55

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** 把画布传上显卡并按线性插值采样：每次上传都会把过滤重设成游戏的默认值，所以上传完要重新设 */
function upload(tex: Phaser.Textures.CanvasTexture): void {
  tex.refresh()
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
}

/** 四旋翼的巡检无人机，从正上方看：深灰的机身、四个旋翼的圆盘、机头一盏灯 */
function drawDrone(ctx: CanvasRenderingContext2D, s: number): void {
  const c = s / 2
  ctx.strokeStyle = '#2c2a33'
  ctx.lineWidth = s * 0.07
  ctx.beginPath()
  ctx.moveTo(c - s * 0.3, c - s * 0.3)
  ctx.lineTo(c + s * 0.3, c + s * 0.3)
  ctx.moveTo(c + s * 0.3, c - s * 0.3)
  ctx.lineTo(c - s * 0.3, c + s * 0.3)
  ctx.stroke()
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    ctx.fillStyle = 'rgba(190,196,210,0.35)'
    ctx.beginPath()
    ctx.arc(c + dx * s * 0.3, c + dy * s * 0.3, s * 0.17, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#3a3844'
    ctx.beginPath()
    ctx.arc(c + dx * s * 0.3, c + dy * s * 0.3, s * 0.04, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#d8d6de'
  ctx.beginPath()
  ctx.ellipse(c, c, s * 0.15, s * 0.12, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#5a5866'
  ctx.beginPath()
  ctx.ellipse(c + s * 0.02, c + s * 0.03, s * 0.1, s * 0.07, 0, 0, Math.PI * 2)
  ctx.fill()
}

interface Ripple {
  readonly x: number
  readonly y: number
  readonly at: number
  readonly power: number
}

interface Drone {
  a: number
  readonly cx: number
  readonly cy: number
  readonly rx: number
  readonly ry: number
  readonly rate: number
  readonly img: Phaser.GameObjects.Image
  readonly lamp: Phaser.GameObjects.Image
}

/**
 * 前哨：地面、设施、立柱与导轨是开局在后台线程画好的贴图；能量光墙由着色器按每段此刻立起了多少、预警与过载的明暗每帧画，
 * 撞上的东西在光墙上荡出涟漪，熄灭时放一串电火花。控制台的台面按组上色，切过的组在台边走一圈倒计时；
 * 裂缝透着一明一暗的红光，着陆平台的灯一圈圈地跑，舱顶的信标一闪一闪，天线的碟慢慢转，两架巡检无人机绕着站飞，空中飘着细小的孢子。
 * 离亮着的光墙近的身体被它照上一层同色的光
 */
export class OutpostView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private plan?: OutpostPlan
  private painter?: OutpostPainter
  private st?: OutpostState
  private cfg?: OutpostConfig
  private readonly u = { time: 0 }
  private readonly seg = new Float32Array(SEG_SLOTS * 4)
  private readonly col = new Float32Array(SEG_SLOTS * 4)
  private readonly fx = new Float32Array(SEG_SLOTS * 4)
  private readonly rip = new Float32Array(RIPPLE_SLOTS * 4)
  private levels: number[] = []
  private ripples: Ripple[] = []
  private seen = 0
  private shockAt = 0
  private pressed: number[] = []
  private consoles?: { readonly base: Phaser.GameObjects.Graphics; readonly fx: Phaser.GameObjects.Graphics }
  private sparks?: Phaser.GameObjects.Particles.ParticleEmitter
  private embers?: Phaser.GameObjects.Particles.ParticleEmitter
  private riftGlows: { readonly img: Phaser.GameObjects.Image; readonly phase: number }[] = []
  private padLights: Phaser.GameObjects.Image[] = []
  private beacons: { readonly img: Phaser.GameObjects.Image; readonly phase: number; readonly color: number }[] = []
  private mast?: { readonly g: Phaser.GameObjects.Graphics; readonly shadow: Phaser.GameObjects.Graphics; readonly lamp: Phaser.GameObjects.Image; a: number }
  private drones: Drone[] = []
  private droneShadows?: Phaser.GameObjects.Graphics

  private planOf(v: ViewCtx): OutpostPlan {
    if (!this.plan) this.plan = outpostPlanFor(v.def.outpost!, v.run.decorSeed)
    return this.plan
  }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const p = this.planOf(v)
    return { w: FRAME.w, h: FRAME.h, origin: { x: p.cx * UNIT, y: p.cy * UNIT } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-2)))
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  /** 地上的东西都画在贴图里，不撒 emoji */
  decor(_v: ViewCtx, _atlas: EcsAtlas): void {}

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const st = sim.worldState.outpost
    if (!st) return
    this.st = st
    this.cfg = v.def.outpost!
    const scene = v.scene
    const sc: PaintScene = { cfg: v.def.outpost!, plan: this.planOf(v) }
    const size = textureSize()
    const tex = canvasTexture(scene, GROUND_KEY, size.w, size.h)
    const painter = new OutpostPainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const rects: PixelRect[] = []
    for (let y = 0; y < size.h; y += STRIP_PX) rects.push({ x0: 0, y0: y, x1: size.w, y1: Math.min(size.h, y + STRIP_PX) })
    await painter.paint(rects, (p) => {
      tex.getContext().putImageData(new ImageData(p.pixels, p.rect.x1 - p.rect.x0, p.rect.y1 - p.rect.y0), p.rect.x0, p.rect.y0)
    })
    painter.close()
    if (this.painter !== painter) return
    this.painter = undefined
    upload(tex)
    this.visuals.push(scene.add.image(0, 0, GROUND_KEY).setOrigin(0, 0).setDisplaySize((size.w / GROUND_PPU) * UNIT, (size.h / GROUND_PPU) * UNIT).setDepth(-1))
    if (!scene.textures.exists(SPARK_KEY)) canvasTexture(scene, SPARK_KEY, 32, 32, (ctx) => drawSpark(ctx, 32))
    if (!scene.textures.exists(DRONE_KEY)) canvasTexture(scene, DRONE_KEY, 64, 64, (ctx) => drawDrone(ctx, 64))
    this.levels = st.plan.segments.map((_, k) => (live(st.fences, st.plan, k, sim.elapsedMs) ? 1 : 0))
    this.pressed = this.cfg.groups.map(() => -Infinity)
    this.seen = st.fences.sent
    this.fenceLayer(v, st)
    this.consoleLayer(v)
    this.ambient(v, st.plan)
    v.lens.screen.vignette(0.8, 0.22, 0x120c1c)
  }

  /** 光墙：着色器铺满围栏所在的那一块，每帧按此刻的状态传一遍各段的数据 */
  private fenceLayer(v: ViewCtx, st: OutpostState): void {
    const cfg = this.cfg!
    const plan = st.plan
    if (plan.segments.length > SEG_SLOTS) throw new Error(`前哨的围栏有 ${plan.segments.length} 段，着色器只画得下 ${SEG_SLOTS} 段`)
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const p of plan.pylons) {
      x0 = Math.min(x0, p.x)
      y0 = Math.min(y0, p.y)
      x1 = Math.max(x1, p.x)
      y1 = Math.max(y1, p.y)
    }
    const pad = 2
    const ox = (x0 - pad) * UNIT
    const oy = (y0 - pad - cfg.fence.pylonM * FACE_U_PER_M) * UNIT
    const w = (x1 - x0 + pad * 2) * UNIT
    const h = (y1 - y0 + pad * 2 + cfg.fence.pylonM * FACE_U_PER_M) * UNIT
    plan.segments.forEach((s, k) => {
      this.seg.set([s.ax * UNIT, s.ay * UNIT, s.bx * UNIT, s.by * UNIT], k * 4)
    })
    const u = this.u
    const shader = v.scene.add
      .shader(
        {
          name: 'OutpostFence',
          fragmentSource: FENCE_FRAG,
          setupUniforms: (set: (name: string, value: unknown) => void) => {
            set('uSize', [w, h])
            set('uOrigin', [ox, oy])
            set('uTime', u.time)
            set('uUnit', UNIT)
            set('uH', cfg.fence.heightM * FACE_U_PER_M * UNIT)
            set('uCap', cfg.fence.pylonM * FACE_U_PER_M * UNIT)
            set('uThick', cfg.fence.thickU * UNIT)
            set('uCount', plan.segments.length)
            set('uSeg[0]', this.seg)
            set('uCol[0]', this.col)
            set('uFx[0]', this.fx)
            set('uRip[0]', this.rip)
          },
        },
        ox,
        oy,
        w,
        h,
      )
      .setOrigin(0, 0)
      .setDepth(DEPTH.fence)
    this.visuals.push(shader)
    this.sparks = v.scene.add
      .particles(0, 0, SPARK_KEY, {
        lifespan: { min: 260, max: 620 },
        speed: { min: 40, max: 170 },
        scale: { start: 0.42, end: 0 },
        alpha: { start: 1, end: 0 },
        gravityY: 220,
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(DEPTH.sparks)
    this.visuals.push(this.sparks)
  }

  private consoleLayer(v: ViewCtx): void {
    const base = v.scene.add.graphics().setDepth(DEPTH.console)
    const fx = v.scene.add.graphics().setDepth(DEPTH.consoleFx).setBlendMode(Phaser.BlendModes.ADD)
    this.consoles = { base, fx }
    this.visuals.push(base, fx)
  }

  /** 裂缝的红光与飘出来的火星，着陆平台的跑灯，舱顶的信标，天线，无人机与孢子 */
  private ambient(v: ViewCtx, plan: OutpostPlan): void {
    const scene = v.scene
    const cfg = this.cfg!
    for (const r of plan.rifts) {
      const a = r.pts[r.pts.length - 1]!
      const b = r.pts[0]!
      const len = Math.hypot(a.x - b.x, a.y - b.y)
      const img = scene.add
        .image(r.x * UNIT, r.y * UNIT, SPARK_KEY)
        .setDepth(DEPTH.glow)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xff4a24)
        .setRotation(Math.atan2(a.y - b.y, a.x - b.x))
        .setDisplaySize((len + 1.4) * UNIT, 1.5 * UNIT)
      this.riftGlows.push({ img, phase: Math.random() * Math.PI * 2 })
      this.visuals.push(img)
    }
    this.embers = scene.add
      .particles(0, 0, SPARK_KEY, {
        lifespan: { min: 1400, max: 2600 },
        speedX: { min: -8, max: 8 },
        speedY: { min: -26, max: -12 },
        scale: { start: 0.16, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint: [0xff6a3a, 0xffa060, 0xff3d2a],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(DEPTH.beacon)
    this.visuals.push(this.embers)
    const p = plan.pad
    if (p) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2
        const img = scene.add
          .image((p.x + Math.cos(a) * (p.r - 0.18)) * UNIT, (p.y + Math.sin(a) * (p.r - 0.18)) * UNIT, SPARK_KEY)
          .setDepth(DEPTH.glow)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(0xffa040)
          .setDisplaySize(0.34 * UNIT, 0.34 * UNIT)
        this.padLights.push(img)
        this.visuals.push(img)
      }
    }
    for (const d of plan.domes) {
      const top = cfg.gear.domeM * FACE_U_PER_M
      const img = scene.add
        .image(d.x * UNIT, (d.y - top) * UNIT, SPARK_KEY)
        .setDepth(DEPTH.beacon)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(0.5 * UNIT, 0.5 * UNIT)
      this.beacons.push({ img, phase: Math.random() * 3000, color: 0xff3b3b })
      this.visuals.push(img)
    }
    const m = plan.mast
    if (m) {
      const g = scene.add.graphics().setDepth(DEPTH.mast)
      const shadow = scene.add.graphics().setDepth(DEPTH.droneShadow)
      const top = cfg.gear.mastM * FACE_U_PER_M
      const lamp = scene.add
        .image(m.x * UNIT, (m.y - top - 0.12) * UNIT, SPARK_KEY)
        .setDepth(DEPTH.mast + 0.1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xff3030)
        .setDisplaySize(0.55 * UNIT, 0.55 * UNIT)
      this.mast = { g, shadow, lamp, a: Math.random() * Math.PI * 2 }
      this.visuals.push(g, shadow, lamp)
    }
    this.droneShadows = scene.add.graphics().setDepth(DEPTH.droneShadow)
    this.visuals.push(this.droneShadows)
    for (let i = 0; i < DRONES; i++) {
      const img = scene.add.image(0, 0, DRONE_KEY).setDepth(DEPTH.drone).setDisplaySize(DRONE_U * UNIT, DRONE_U * UNIT)
      const lamp = scene.add.image(0, 0, SPARK_KEY).setDepth(DEPTH.drone + 0.1).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(0.28 * UNIT, 0.28 * UNIT)
      const r = 6 + i * 3.5
      this.drones.push({ a: Math.random() * Math.PI * 2, cx: plan.cx + (Math.random() - 0.5) * 2, cy: plan.cy + (Math.random() - 0.5) * 2, rx: r, ry: r * (0.7 + Math.random() * 0.25), rate: (i % 2 === 0 ? 1 : -1) * (0.18 + Math.random() * 0.06), img, lamp })
      this.visuals.push(img, lamp)
    }
    const screen = v.lens.screen
    this.visuals.push(
      scene.add
        .particles(0, 0, SPARK_KEY, {
          lifespan: { min: 6000, max: 10000 },
          frequency: 160,
          speedX: { min: 6, max: 22 },
          speedY: { min: -12, max: 4 },
          scale: { min: 0.06, max: 0.13 },
          alpha: { start: 0.55, end: 0 },
          tint: [0xe8d8ff, 0xffe2c8, 0xc8f0ff],
          blendMode: Phaser.BlendModes.ADD,
          emitZone: {
            type: 'random',
            source: {
              getRandomPoint: (pt: Phaser.Types.Math.Vector2Like): void => {
                const view = screen.view()
                pt.x = view.x + Math.random() * view.w
                pt.y = view.y + Math.random() * view.h
              },
            },
          },
        })
        .setDepth(DEPTH.spores),
    )
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const st = this.st
    const cfg = this.cfg
    if (!st || !cfg) return
    const dt = Math.min(delta, 50) / 1000
    const now = sim.elapsedMs
    this.u.time = (this.u.time + dt) % 1000
    this.events(v, st, now)
    this.fences(st, cfg, now, dt)
    this.drawConsoles(st, cfg, now)
    this.stepAmbient(v, st.plan, now, dt)
  }

  /** 新来的事：涟漪、切换与复位的声音、熄灭与过载时的电火花 */
  private events(v: ViewCtx, st: OutpostState, now: number): void {
    const f = st.fences
    const fresh = Math.min(f.sent - this.seen, f.events.length)
    this.seen = f.sent
    const plan = st.plan
    const screen = v.lens.screen
    for (const e of f.events.slice(f.events.length - fresh)) {
      if (e.kind === 'ripple') {
        this.ripples.push({ x: e.x, y: e.y, at: now, power: 0.35 + 0.65 * e.power })
        if (this.ripples.length > RIPPLE_SLOTS) this.ripples.shift()
        if (now - this.shockAt > SHOCK_MS && screen.sees(e.x, e.y)) {
          this.shockAt = now
          playSfx('shock')
        }
        continue
      }
      if (e.kind === 'toggle' || e.kind === 'reset') {
        const on = f.on[e.group]!
        if (e.kind === 'toggle') this.pressed[e.group] = now
        playSfx(on ? 'surge' : 'arc')
        if (!on) plan.segments.forEach((s, k) => s.group === e.group && this.discharge(s.ax, s.ay, s.bx, s.by, this.cfg!.groups[s.group]!.color, k, screen))
        if (e.kind === 'toggle') playSfx('relay')
        continue
      }
      if (e.kind === 'warn') {
        playSfx('buzz')
        continue
      }
      const s = plan.segments[e.seg]!
      if (e.kind === 'overload') {
        playSfx('glitch')
        this.discharge(s.ax, s.ay, s.bx, s.by, 0xffffff, e.seg, screen)
      } else if (f.on[s.group]) playSfx('surge')
    }
  }

  /** 一段光墙熄掉：沿着导轨崩出一串电火花 */
  private discharge(ax: number, ay: number, bx: number, by: number, color: number, _seg: number, screen: ViewCtx['lens']['screen']): void {
    const sp = this.sparks
    if (!sp || !screen.sees(((ax + bx) / 2) * UNIT, ((ay + by) / 2) * UNIT, 4 * UNIT)) return
    sp.setParticleTint(color)
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 4)
    const lift = (this.cfg!.fence.heightM * FACE_U_PER_M * UNIT) / 2
    for (let i = 0; i < n; i++) {
      const t = Math.random()
      sp.emitParticleAt((ax + (bx - ax) * t) * UNIT, (ay + (by - ay) * t) * UNIT - Math.random() * lift, 1)
    }
  }

  /** 每段光墙此刻立起多少、预警与过载的明暗，写进着色器的数据 */
  private fences(st: OutpostState, cfg: OutpostConfig, now: number, dt: number): void {
    const plan = st.plan
    const f = st.fences
    const phases = cfg.groups.map((_, g) => groupPhase(f, cfg, g, now))
    plan.segments.forEach((s, k) => {
      const on = live(f, plan, k, now)
      const lv = this.levels[k]!
      this.levels[k] = on ? Math.min(1, lv + dt / RISE_S) : Math.max(0, lv - dt / FALL_S)
      const c = cfg.groups[s.group]!.color
      const level = this.levels[k]!
      this.col.set([((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, level < 1 ? level * level * (3 - 2 * level) : 1], k * 4)
      const ph = phases[s.group]!
      let flick = 1
      if (ph.phase === 'warn') {
        const rate = 1 - ph.left / (cfg.console.warnS * 1000)
        const beat = Math.floor(now / (150 - 70 * rate))
        flick = hashOf(beat, k) < 0.35 + 0.35 * rate ? 0.25 : 1
      }
      const down = f.down[k]!
      let crackle = 0
      if (down > now) {
        const left = down - now
        crackle = left < cfg.overload.warnS * 1000 ? 1 : 0.55
        if (left < cfg.overload.warnS * 1000 && f.on[s.group]) flick = Math.min(flick, hashOf(Math.floor(now / 90), k + 7) < 0.5 ? 0.3 : 1)
      }
      this.fx.set([flick, crackle, 0, 0], k * 4)
    })
    for (let k = plan.segments.length; k < SEG_SLOTS; k++) this.col[k * 4 + 3] = 0
    this.ripples = this.ripples.filter((r) => now - r.at < RIPPLE_S * 1000)
    this.rip.fill(0)
    this.ripples.forEach((r, i) => this.rip.set([r.x, r.y, (now - r.at) / 1000, r.power], i * 4))
  }

  /**
   * 控制台：台面一圈同组颜色的灯，组开着时满亮、熄着时暗；台心画着一小段围栏的图标，亮着的组图标里那道光墙也亮着。
   * 切过的组在台边走一圈倒计时，快复位时一明一暗；刚被踩下时一圈光往外荡；走空之前不能再踩的台子灯是虚的
   */
  private drawConsoles(st: OutpostState, cfg: OutpostConfig, now: number): void {
    const c = this.consoles
    if (!c) return
    const g = c.base.clear()
    const fx = c.fx.clear()
    const f = st.fences
    st.plan.consoles.forEach((k, i) => {
      const color = cfg.groups[k.group]!.color
      const on = f.on[k.group]!
      const ph = groupPhase(f, cfg, k.group, now)
      const x = k.x * UNIT
      const y = k.y * UNIT
      const r = k.r * UNIT
      const armed = f.armed[i]!
      const blink = Math.floor(now / 220) % 2 === 0
      g.fillStyle(color, on ? 0.32 : 0.12).fillCircle(x, y, r * 0.92)
      g.lineStyle(0.07 * UNIT, color, armed ? (on ? 1 : 0.55) : 0.3).strokeCircle(x, y, r * 0.86)
      const px = 0.3 * r
      g.fillStyle(0x2a2833, 1).fillCircle(x - px, y + 0.05 * r, 0.09 * r).fillCircle(x + px, y + 0.05 * r, 0.09 * r)
      g.fillStyle(0xb8b6c4, 1).fillRect(x - px - 0.05 * r, y - 0.38 * r, 0.1 * r, 0.44 * r).fillRect(x + px - 0.05 * r, y - 0.38 * r, 0.1 * r, 0.44 * r)
      if (on) {
        fx.fillStyle(color, 0.85).fillRect(x - px, y - 0.3 * r, px * 2, 0.32 * r)
        fx.fillStyle(0xffffff, 0.6).fillRect(x - px, y - 0.32 * r, px * 2, 0.05 * r)
      } else {
        g.lineStyle(0.04 * r, color, 0.5).lineBetween(x - px, y + 0.02 * r, x + px, y + 0.02 * r)
      }
      fx.fillStyle(color, on ? 0.28 : 0.1).fillCircle(x, y, r * 1.25)
      if (ph.phase !== 'idle' && (ph.phase === 'held' || blink)) {
        const left = ph.left / (cfg.console.holdS * 1000)
        fx.lineStyle(0.1 * UNIT, ph.phase === 'warn' ? 0xffffff : color, 0.95)
        fx.beginPath()
        fx.arc(x, y, r + 0.16 * UNIT, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.01, left), false)
        fx.strokePath()
      }
      const since = (now - this.pressed[k.group]!) / 1000
      if (since >= 0 && since < 0.6) {
        fx.lineStyle(0.08 * UNIT * (1 - since / 0.6), color, 1 - since / 0.6)
        fx.strokeCircle(x, y, r + since * 1.6 * UNIT)
      }
    })
  }

  private stepAmbient(v: ViewCtx, plan: OutpostPlan, now: number, dt: number): void {
    const cfg = this.cfg!
    const screen = v.lens.screen
    for (const r of this.riftGlows) r.img.setAlpha(0.32 + 0.16 * Math.sin(now / 900 + r.phase) + 0.06 * Math.sin(now / 237 + r.phase * 3))
    if (this.embers && Math.random() < dt * 3) {
      const r = plan.rifts[Math.floor(Math.random() * plan.rifts.length)]
      if (r && screen.sees(r.x * UNIT, r.y * UNIT, UNIT)) {
        const q = r.pts[Math.floor(Math.random() * r.pts.length)]!
        this.embers.emitParticleAt(q.x * UNIT, q.y * UNIT, 1)
      }
    }
    const lead = Math.floor(now / 160) % Math.max(1, this.padLights.length)
    this.padLights.forEach((img, i) => {
      const d = (i - lead + this.padLights.length) % this.padLights.length
      img.setAlpha(d === 0 ? 1 : d === 1 ? 0.45 : 0.12)
    })
    for (const b of this.beacons) {
      const t = ((now + b.phase) % 2400) / 2400
      b.img.setTint(b.color).setAlpha(t < 0.08 ? 1 : t < 0.16 ? 0.25 : 0.06)
    }
    const m = this.mast
    const pm = plan.mast
    if (m && pm) {
      m.a += dt * 0.5
      const top = cfg.gear.mastM * FACE_U_PER_M
      const x = pm.x * UNIT
      const y = (pm.y - top) * UNIT
      const g = m.g.clear()
      const w = 0.62 * UNIT
      const c = Math.cos(m.a)
      const s = Math.sin(m.a)
      const face = Math.abs(c)
      const ew = w * 2 * Math.max(0.16, face)
      const eh = w * 0.95
      const fx = x + s * 0.08 * UNIT
      g.lineStyle(0.06 * UNIT, 0x7c7e8c, 1).lineBetween(x, y + 0.3 * UNIT, x, y)
      g.fillStyle(0x3e3d48, 1).fillEllipse(fx + (c > 0 ? -1 : 1) * 0.03 * UNIT, y + 0.03 * UNIT, ew + 3, eh + 3)
      g.fillStyle(c > 0 ? 0xdcdae6 : 0x9b9aa8, 1).fillEllipse(fx, y, ew, eh)
      g.fillStyle(c > 0 ? 0xc4c2d0 : 0x8a8998, 1).fillEllipse(fx + c * 0.04 * UNIT, y + 0.02 * UNIT, ew * 0.68, eh * 0.68)
      g.fillStyle(c > 0 ? 0xb0aebc : 0x7c7b8a, 1).fillEllipse(fx + c * 0.07 * UNIT, y + 0.03 * UNIT, ew * 0.34, eh * 0.34)
      g.lineStyle(0.02 * UNIT, 0xf2f0fa, c > 0 ? 0.9 : 0.4).strokeEllipse(fx, y, ew, eh)
      const tipX = fx + c * 0.42 * UNIT
      const tipY = y - 0.3 * UNIT
      g.lineStyle(0.025 * UNIT, 0x5e5d6a, 1).lineBetween(fx - ew * 0.3, y + eh * 0.2, tipX, tipY).lineBetween(fx + ew * 0.3, y + eh * 0.2, tipX, tipY)
      g.fillStyle(0x2c2b33, 1).fillCircle(tipX, tipY, 0.055 * UNIT)
      const sh = m.shadow.clear()
      const off = cfg.gear.mastM * 0.85 * SHADOW_PER_M * UNIT
      sh.fillStyle(0x0b0612, 0.22).fillEllipse(x + AWAY.x * off, pm.y * UNIT + AWAY.y * off, ew, eh)
      m.lamp.setAlpha(Math.floor(now / 700) % 2 === 0 ? 1 : 0.15)
    }
    const shadows = this.droneShadows
    if (shadows) shadows.clear()
    for (const d of this.drones) {
      d.a += d.rate * dt
      const x = d.cx + Math.cos(d.a) * d.rx + Math.sin(d.a * 2.3) * 0.6
      const y = d.cy + Math.sin(d.a) * d.ry
      const vx = -Math.sin(d.a) * d.rx * d.rate
      const vy = Math.cos(d.a) * d.ry * d.rate
      const head = Math.atan2(vy, vx)
      const bob = Math.sin(now / 400 + d.rx) * 0.05
      d.img.setPosition(x * UNIT, (y + bob) * UNIT).setRotation(head + Math.PI / 2)
      d.lamp.setPosition((x + Math.cos(head) * 0.16) * UNIT, (y + bob + Math.sin(head) * 0.16) * UNIT).setTint(Math.floor(now / 500) % 2 === 0 ? 0x7cf5ff : 0xff5050).setAlpha(0.9)
      if (shadows) {
        const off = DRONE_ALT_M * SHADOW_PER_M * UNIT
        shadows.fillStyle(0x0b0612, 0.22).fillEllipse(x * UNIT + AWAY.x * off, y * UNIT + AWAY.y * off, DRONE_U * UNIT * 0.8, DRONE_U * UNIT * 0.7)
      }
    }
  }

  /** 离亮着的光墙近的身体：朝着光墙的那一侧叠一层它的颜色 */
  lightAt(x: number, y: number, out: LocalLight): void {
    const st = this.st
    const cfg = this.cfg
    if (!st || !cfg) return
    const u = x / UNIT
    const v = y / UNIT
    let best = LIGHT_U
    let pick = -1
    st.plan.segments.forEach((s, k) => {
      if ((this.levels[k] ?? 0) <= 0.05) return
      const d = segDist(s.ax, s.ay, s.bx, s.by, u, v)
      if (d < best) {
        best = d
        pick = k
      }
    })
    if (pick < 0) return
    const s = st.plan.segments[pick]!
    const dx = s.bx - s.ax
    const dy = s.by - s.ay
    const t = Math.min(1, Math.max(0, ((u - s.ax) * dx + (v - s.ay) * dy) / (dx * dx + dy * dy)))
    const qx = s.ax + dx * t - u
    const qy = s.ay + dy * t - v
    const l = Math.hypot(qx, qy) || 1
    out.fx = qx / l
    out.fy = qy / l
    out.color = cfg.groups[s.group]!.color
    out.fill = 0.55 * (1 - smooth(0.2, LIGHT_U, best)) * this.levels[pick]! * (this.fx[pick * 4] ?? 1)
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    this.consoles = undefined
    this.sparks = undefined
    this.embers = undefined
    this.riftGlows = []
    this.padLights = []
    this.beacons = []
    this.mast = undefined
    this.drones = []
    this.droneShadows = undefined
    this.st = undefined
    if (v.scene.textures.exists(GROUND_KEY)) v.scene.textures.remove(GROUND_KEY)
  }
}

/** 整数上的哈希，落在 [0, 1) */
function hashOf(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
