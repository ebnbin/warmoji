import Phaser from 'phaser'
import { query } from 'bitecs'
import { LIFT_PER_M, UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { AWAY } from '../../data/light'
import { canvasTexture, drawSpark } from '../textures'
import { keepDecor } from '../../ecs/decor'
import { playSfx } from '../../audio/sfx'
import { FRAME, FRAME_MID } from '../frame'
import { BoundedView } from '../../ecs/views'
import type { ViewCtx } from '../../ecs/views'
import type { Framing } from '../../ecs/lens'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'
import { Depth, Floor, Mounted, Phys, Transform, Uid } from '../../ecs/components'
import { footY } from '../../ecs/utils/ground'
import { UNDER_Z } from '../../ecs/render/bands'
import { BELT_FRAG } from './belts'
import { paintGround, paintStanding, parkProps, RIDES } from './paint'
import { drawStage } from './stage'
import type { StagePens } from './stage'
import { cornersOf, gaugeAt } from './layout'
import { beltWarning } from './model'
import type { OpPhase } from './model'
import type { DreamlandWorld } from './world'

const BG = 0xf6b7d4
const GROUND_KEY = 'dreamland-ground'
const STANDING_KEY = 'dreamland-standing'
const SPARK_KEY = 'dreamland-spark'
const BALLOON_KEY = 'dreamland-balloon'
/** 布景按布景种子打散出自己的种子 */
const PARK_SEED = 0x9a7c
/** 各层的深度：传送带、检修口、台子的影子、立着的布景、会动的设施、台子与栏杆、天上的气球与它们的影子、彩纸 */
const DEPTH = { belts: -0.95, hatch: -0.94, shade: -0.93, standing: -0.9, rides: -0.89, deck: 0.7, fence: 0.75, balloonShade: -0.88, balloons: 36, confetti: 34 } as const
/** 彩纸、气球的颜色 */
const CANDY = [0xff5c9a, 0xffd23f, 0x5ad1c6, 0x9b7bff, 0xff9a4a, 0x7fd6ff, 0xffffff] as const
/** 天上飘几只气球，离地多高（米） */
const BALLOONS = 5
const BALLOON_M = 14

/** 一只在天上飘的气球：位置（像素）、速度（像素/秒）、身子与它投在地上的影子 */
interface Balloon {
  x: number
  y: number
  vx: number
  vy: number
  readonly bob: number
  readonly img: Phaser.GameObjects.Image
}

/** 上一帧的样子：操作员在做什么、预警的边、各入口开足了没有、传送带在不在预警，有变化才响 */
interface Heard {
  phase: OpPhase
  next: number
  open: number
  belt: boolean
}

/** 气球：圆圆的身子、一点高光、底下一个小结 */
function drawBalloon(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2
  const cy = h * 0.42
  const r = w * 0.42
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.25, '#f2f2f2')
  g.addColorStop(1, '#bdbdbd')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(cx, cy, r, r * 1.15, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#c8c8c8'
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.12, cy + r * 1.12)
  ctx.lineTo(cx + r * 0.12, cy + r * 1.12)
  ctx.lineTo(cx, cy + r * 1.3)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.lineWidth = w * 0.02
  ctx.beginPath()
  ctx.moveTo(cx, cy + r * 1.3)
  ctx.quadraticCurveTo(cx + r * 0.3, cy + r * 1.7, cx - r * 0.1, h)
  ctx.stroke()
}

/**
 * 梦幻乐园：粉色糖霜的地面与奶油色步道铺满方框，外沿一圈白栅栏，北边一座粉色城堡、南边乐园大门、四角是摩天轮、旋转茶杯、旋转木马与马戏团帐篷；
 * 两圈传送带由着色器画、按各自的方向滚动；正中的摇摆台每帧按真实高度画出倾斜，台子后面传送带上的身体压到台子底下；
 * 天上飘着气球，入口开足时撒一把彩纸，操作员预警时响铃
 */
export class DreamlandView extends BoundedView {
  private readonly u = { inner: 0, outer: 0, dir: 1, bright: 1 }
  private pens?: StagePens
  private rides?: Phaser.GameObjects.Graphics
  private balloonShade?: Phaser.GameObjects.Graphics
  private balloons: Balloon[] = []
  private confetti?: Phaser.GameObjects.Particles.ParticleEmitter
  private heard?: Heard
  /** 压到台子底下的身体：原来的 z 与认实体的 uid */
  private readonly lowered = new Map<number, { z: number; uid: number }>()

  layout(): { w: number; h: number; origin: Point } {
    return { w: FRAME.w, h: FRAME.h, origin: FRAME_MID }
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-3)))
    if (!v.scene.textures.exists(SPARK_KEY)) canvasTexture(v.scene, SPARK_KEY, 32, 32, (ctx) => drawSpark(ctx, 32))
    if (!v.scene.textures.exists(BALLOON_KEY)) canvasTexture(v.scene, BALLOON_KEY, 64, 96, (ctx) => drawBalloon(ctx, 64, 96))
  }

  onSimReady(v: ViewCtx, sim: Sim): void {
    const w = sim.worldState.dreamland
    if (!w) return
    const scene = v.scene
    const plan = w.s.plan
    const castle = w.marks.castle![0]!
    const entry = w.marks.entry![0]!
    const park = parkProps(plan, { castle, entry }, (v.run.decorSeed ^ PARK_SEED) >>> 0)
    const pw = Math.ceil((FRAME.w / UNIT) * GROUND_PPU)
    const ph = Math.ceil((FRAME.h / UNIT) * GROUND_PPU)
    canvasTexture(scene, GROUND_KEY, pw, ph, (ctx) => paintGround(ctx, plan, park, GROUND_PPU))
    canvasTexture(scene, STANDING_KEY, pw, ph, (ctx) => paintStanding(ctx, plan, park, GROUND_PPU))
    this.visuals.push(scene.add.image(FRAME.x, FRAME.y, GROUND_KEY).setOrigin(0, 0).setDisplaySize(FRAME.w, FRAME.h).setDepth(-1))
    const reach = plan.outer / Math.cos(Math.PI / plan.sides)
    const rect = [plan.cx - reach, plan.cy - reach, reach * 2, reach * 2] as const
    const u = this.u
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'DreamlandBelts',
            fragmentSource: BELT_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uRect', [...rect])
              set('uShape', [plan.cx, plan.cy, plan.sides, plan.rot])
              set('uApo', [plan.stage, plan.inner, plan.outer])
              set('uRun', [u.inner, u.outer])
              set('uFlow', [u.dir, u.bright])
              set('uUnit', UNIT)
            },
          },
          rect[0],
          rect[1],
          rect[2],
          rect[3],
        )
        .setOrigin(0, 0)
        .setDepth(DEPTH.belts),
    )
    const hatch = scene.add.graphics().setDepth(DEPTH.hatch)
    for (const m of w.marks.hatch ?? []) {
      hatch.fillStyle(0x5b2a6e, 0.35).fillCircle(m.x + 0.06 * UNIT, m.y + 0.08 * UNIT, m.r)
      hatch.fillStyle(0xb9a6dd, 1).fillCircle(m.x, m.y, m.r)
      hatch.lineStyle(0.07 * UNIT, 0xfff3dc, 1).strokeCircle(m.x, m.y, m.r * 0.92)
      hatch.lineStyle(0.05 * UNIT, 0x7a5fae, 1)
      for (let k = -1; k <= 1; k++) hatch.lineBetween(m.x - m.r * 0.55, m.y + k * m.r * 0.32, m.x + m.r * 0.55, m.y + k * m.r * 0.32)
    }
    this.visuals.push(hatch, scene.add.image(FRAME.x, FRAME.y, STANDING_KEY).setOrigin(0, 0).setDisplaySize(FRAME.w, FRAME.h).setDepth(DEPTH.standing))
    const shade = scene.add.graphics().setDepth(DEPTH.shade)
    const deck = scene.add.graphics().setDepth(DEPTH.deck)
    const fence = scene.add.graphics().setDepth(DEPTH.fence)
    this.pens = { shade, deck, fence }
    this.rides = scene.add.graphics().setDepth(DEPTH.rides)
    this.balloonShade = scene.add.graphics().setDepth(DEPTH.balloonShade)
    this.visuals.push(shade, deck, fence, this.rides, this.balloonShade)
    for (let i = 0; i < BALLOONS; i++) {
      const a = Math.random() * Math.PI * 2
      const img = scene.add.image(0, 0, BALLOON_KEY).setDepth(DEPTH.balloons).setDisplaySize(0.9 * UNIT, 1.35 * UNIT).setTint(CANDY[i % (CANDY.length - 1)]!).setAlpha(0.92)
      this.balloons.push({ x: Math.random() * FRAME.w, y: Math.random() * FRAME.h, vx: Math.cos(a) * 0.35 * UNIT, vy: Math.sin(a) * 0.25 * UNIT, bob: Math.random() * 10, img })
      this.visuals.push(img)
    }
    this.confetti = scene.add
      .particles(0, 0, SPARK_KEY, {
        lifespan: { min: 700, max: 1300 },
        speed: { min: 60, max: 220 },
        angle: { min: 200, max: 340 },
        gravityY: 260,
        scale: { start: 0.45, end: 0.2 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: [...CANDY],
        emitting: false,
      })
      .setDepth(DEPTH.confetti)
    this.visuals.push(this.confetti)
    keepDecor(v.decor, () => false)
    v.lens.screen.vignette(0.78, 0.1, 0x7a2a5e)
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const w = sim.worldState.dreamland
    const cfg = v.def.dreamland
    if (!w || !cfg || !this.pens) return
    const s = w.s
    const ms = s.t
    const b = s.belts
    this.u.inner = b.innerRun
    this.u.outer = b.outerRun
    this.u.dir = b.speed !== 0 ? Math.sign(b.speed) : b.dir
    this.u.bright = beltWarning(s) ? 0.25 + 0.75 * (Math.floor(ms / 160) % 2) : Math.min(1, Math.abs(b.speed) * 1.4 + 0.2)
    drawStage(this.pens, s.plan, cfg, s, ms, v.def.light?.shadow?.length ?? 0.75)
    this.behind(sim, w, cfg.pivotM)
    this.drawRides(sim.elapsedMs / 1000)
    this.drift(Math.min(delta, 50) / 1000, sim.elapsedMs / 1000)
    this.listen(w, cfg.pivotM)
  }

  /** 台子后面的身体：脚落在画面上台面盖住的地方、自己又站在传送带上的，连同手上的武器、身边的物件，z 挪到被挡住的那一层；出来了按原样放回 */
  private behind(sim: Sim, w: DreamlandWorld, pivot: number): void {
    const plan = w.s.plan
    const L = LIFT_PER_M
    const { sx, sy } = w.s
    const seen = new Set<number>()
    const lower = (eid: number): void => {
      seen.add(eid)
      if (Depth.z[eid]! < UNDER_Z) return
      this.lowered.set(eid, { z: Depth.z[eid]!, uid: Uid.v[eid]! })
      Depth.z[eid] = UNDER_Z - 1000 + Depth.z[eid]!
    }
    for (const eid of query(sim.world, [Phys, Transform, Depth])) {
      if (Floor.z[eid]! > 0.02) continue
      const x = Transform.x[eid]!
      const fy = footY(sim.world, eid)
      const py = (fy + L * pivot - L * sx * (x - plan.cx) + L * sy * plan.cy) / (1 + L * sy)
      if (gaugeAt(plan, x, py) < plan.stage) lower(eid)
    }
    for (const eid of query(sim.world, [Mounted, Depth])) if (seen.has(Mounted.host[eid]!)) lower(eid)
    for (const [eid, was] of this.lowered) {
      if (seen.has(eid)) continue
      if (Uid.v[eid] === was.uid && Depth.z[eid]! < UNDER_Z) Depth.z[eid] = was.z
      this.lowered.delete(eid)
    }
  }

  /** 四角会动的设施：摩天轮慢慢转、茶杯一边绕圈一边自转、旋转木马的顶篷转着 */
  private drawRides(t: number): void {
    const g = this.rides
    if (!g) return
    g.clear()
    const wheel = RIDES.wheel
    const wx = wheel.x * UNIT
    const wy = wheel.y * UNIT
    const r = wheel.r * UNIT * 0.92
    const hub = { x: wx, y: wy - (wheel.r + 0.4) * UNIT }
    g.fillStyle(0x5b2346, 0.22).fillEllipse(wx + AWAY.x * 1.2 * UNIT, wy + AWAY.y * 0.6 * UNIT, r * 1.6, r * 0.5)
    g.lineStyle(0.22 * UNIT, 0xffffff, 1)
    g.lineBetween(wx - r * 0.7, wy, hub.x, hub.y)
    g.lineBetween(wx + r * 0.7, wy, hub.x, hub.y)
    g.lineStyle(0.18 * UNIT, 0xff79ad, 1).strokeCircle(hub.x, hub.y, r)
    g.lineStyle(0.07 * UNIT, 0xffe9f3, 1).strokeCircle(hub.x, hub.y, r * 0.78)
    const cars = 10
    const spin = t * 0.12
    for (let i = 0; i < cars; i++) {
      const a = spin + (i / cars) * Math.PI * 2
      const px = hub.x + Math.cos(a) * r
      const py = hub.y + Math.sin(a) * r
      g.lineStyle(0.05 * UNIT, 0xfff3dc, 0.9).lineBetween(hub.x, hub.y, px, py)
      g.fillStyle(CANDY[i % (CANDY.length - 1)]!, 1).fillRoundedRect(px - 0.38 * UNIT, py + 0.08 * UNIT, 0.76 * UNIT, 0.58 * UNIT, 0.14 * UNIT)
      g.fillStyle(0xffffff, 0.7).fillRect(px - 0.24 * UNIT, py + 0.2 * UNIT, 0.48 * UNIT, 0.16 * UNIT)
    }
    g.fillStyle(0xffd23f, 1).fillCircle(hub.x, hub.y, 0.36 * UNIT)
    const cups = RIDES.teacups
    const cx = cups.x * UNIT
    const cy = cups.y * UNIT
    g.fillStyle(0xd7f6ff, 1).fillCircle(cx, cy - 0.15 * UNIT, cups.r * UNIT)
    g.lineStyle(0.12 * UNIT, 0x7fd6ff, 1).strokeCircle(cx, cy - 0.15 * UNIT, cups.r * UNIT)
    for (let i = 0; i < 5; i++) {
      const a = t * 0.5 + (i / 5) * Math.PI * 2
      const px = cx + Math.cos(a) * cups.r * 0.58 * UNIT
      const py = cy - 0.15 * UNIT + Math.sin(a) * cups.r * 0.58 * UNIT
      const cr = 0.95 * UNIT
      const turn = t * 1.6 + i
      g.fillStyle(0x5b2346, 0.2).fillCircle(px + AWAY.x * 0.25 * UNIT, py + AWAY.y * 0.25 * UNIT, cr)
      g.fillStyle(CANDY[(i + 2) % (CANDY.length - 1)]!, 1).fillCircle(px, py - 0.4 * UNIT, cr)
      g.fillStyle(0xffffff, 1).fillCircle(px, py - 0.4 * UNIT, cr * 0.72)
      g.fillStyle(0xfff6c9, 1).fillCircle(px, py - 0.4 * UNIT, cr * 0.42)
      g.lineStyle(0.14 * UNIT, CANDY[(i + 2) % (CANDY.length - 1)]!, 1).strokeCircle(px + Math.cos(turn) * cr * 1.1, py - 0.4 * UNIT + Math.sin(turn) * cr * 1.1, cr * 0.22)
    }
    const car = RIDES.carousel
    const kx = car.x * UNIT
    const ky = car.y * UNIT
    const cr = car.r * UNIT
    g.fillStyle(0x5b2346, 0.24).fillEllipse(kx + AWAY.x * 1.4 * UNIT, ky + AWAY.y * 1.4 * UNIT, cr * 2.1, cr * 1.6)
    g.fillStyle(0xfff3dc, 1).fillCircle(kx, ky - 0.25 * UNIT, cr)
    const top = ky - 1.9 * UNIT
    const n = 12
    const roll = t * 0.4
    for (let i = 0; i < n; i++) {
      const a0 = roll + (i / n) * Math.PI * 2
      const a1 = roll + ((i + 1) / n) * Math.PI * 2
      g.fillStyle(i % 2 === 0 ? 0xff79ad : 0xfff6fb, 1)
      g.fillTriangle(kx, top - 0.5 * UNIT, kx + Math.cos(a0) * cr * 0.95, top + Math.sin(a0) * cr * 0.8, kx + Math.cos(a1) * cr * 0.95, top + Math.sin(a1) * cr * 0.8)
    }
    for (let i = 0; i < n; i++) {
      const a = roll + ((i + 0.5) / n) * Math.PI * 2
      g.fillStyle(0xffd23f, 1).fillCircle(kx + Math.cos(a) * cr * 0.95, top + Math.sin(a) * cr * 0.8, 0.14 * UNIT)
    }
    g.fillStyle(0xffd23f, 1).fillCircle(kx, top - 0.5 * UNIT, 0.28 * UNIT)
  }

  /** 气球在天上慢慢飘，出了方框从另一头飘回来；影子背着太阳落在地上 */
  private drift(dt: number, t: number): void {
    const shade = this.balloonShade
    if (!shade) return
    shade.clear()
    const up = BALLOON_M * LIFT_PER_M
    for (const b of this.balloons) {
      b.x += b.vx * dt
      b.y += b.vy * dt
      if (b.x < -UNIT) b.x += FRAME.w + 2 * UNIT
      if (b.x > FRAME.w + UNIT) b.x -= FRAME.w + 2 * UNIT
      if (b.y < -UNIT + up) b.y += FRAME.h + 2 * UNIT - up
      if (b.y > FRAME.h + UNIT + up) b.y -= FRAME.h + 2 * UNIT - up
      const bob = Math.sin(t * 0.9 + b.bob) * 0.12 * UNIT
      b.img.setPosition(b.x, b.y - up + bob).setRotation(Math.sin(t * 0.7 + b.bob) * 0.08)
      shade.fillStyle(0x5b2346, 0.14).fillEllipse(b.x + AWAY.x * up * 0.75, b.y + AWAY.y * up * 0.75, 0.75 * UNIT, 0.45 * UNIT)
    }
  }

  /** 操作员预警时响铃、台子动起来时电机转、入口开足或开始关时咔嗒一声并在开足时撒一把彩纸；传送带预警换向时嗡一声 */
  private listen(w: DreamlandWorld, pivot: number): void {
    const s = w.s
    const op = s.op
    const open = op.side >= 0 && s.gates[op.side]! >= 1 ? op.side : -1
    const belt = beltWarning(s)
    const was = this.heard
    this.heard = { phase: op.phase, next: op.next, open, belt }
    if (!was) return
    if (op.phase === 'warn' && (was.phase !== 'warn' || was.next !== op.next)) playSfx('chime')
    if ((op.phase === 'tilt' || op.phase === 'level') && was.phase !== op.phase) playSfx('whir')
    if (open !== was.open) {
      playSfx('clunk')
      if (open >= 0) this.burst(w, open, pivot)
    }
    if (belt && !was.belt) playSfx('buzz')
  }

  /** 入口开足时从门口往外撒一把彩纸 */
  private burst(w: DreamlandWorld, k: number, pivot: number): void {
    const em = this.confetti
    if (!em) return
    const plan = w.s.plan
    const corners = cornersOf(plan, plan.stage)
    const c0 = corners[(k - 1 + plan.sides) % plan.sides]!
    const c1 = corners[k]!
    for (let i = 0; i <= 6; i++) {
      const f = 0.15 + (i / 6) * 0.7
      const x = c0.x + (c1.x - c0.x) * f
      const y = c0.y + (c1.y - c0.y) * f
      const z = pivot - w.s.sx * (x - plan.cx) - w.s.sy * (y - plan.cy)
      em.emitParticleAt(x, y - (z + 1) * LIFT_PER_M, 4)
    }
  }

  destroy(v: ViewCtx): void {
    super.destroy(v)
    this.pens = undefined
    this.rides = undefined
    this.balloonShade = undefined
    this.balloons = []
    this.confetti = undefined
    this.heard = undefined
    this.lowered.clear()
  }
}
