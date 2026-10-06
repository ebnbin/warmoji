import Phaser from 'phaser'
import { query } from 'bitecs'
import { LIFT_PER_M, UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { AWAY } from '../../data/light'
import { rollDecor } from '../../data/maps'
import { playSfx } from '../../audio/sfx'
import { Depth, Mounted, Transform, Uid } from '../../ecs/components'
import { UNDER_Z } from '../../ecs/render/bands'
import { decorSprite } from '../../ecs/decor'
import { canvasTexture, drawPuff } from '../textures'
import { mix } from '../color'
import { FRAME, FRAME_MID } from '../frame'
import { Rng } from '../../util/rng'
import { roomAt } from '../basin'
import { gorgeData, textureSize } from './ground'
import { CanyonPainter } from './painter'
import { GORGE_FRAG } from './shader'
import { drawHanging, drawPosts, drawRebuild, drawShadow, drawUp, fillPoly } from './bridges'
import { canyonPlanFor } from './world'
import { CLIMBING, DOWN, FALLING, TOP } from './model'
import type { Swing } from './bridges'
import type { CanyonState } from './model'
import type { CanyonPlan } from './layout'
import type { PaintScene, PixelRect } from './ground'
import type { EcsAtlas } from '../../ecs/atlas'
import type { MapView, ViewCtx } from '../../ecs/views'
import type { BodyLook } from '../../ecs/render/sprites'
import type { Framing } from '../../ecs/lens'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'

/** 方框外的底色：谷里的暗蓝紫 */
const BG = 0x251d36
const GROUND_KEY = 'canyon-ground'
const GORGE_KEY = 'canyon-gorge'
const FLOOR_KEY = 'canyon-floor'
const PUFF_KEY = 'canyon-puff'
const PAINT_THREADS = 4
const STRIP_PX = 64
/** 雾与河的数据图每格多大，格 */
const GORGE_CELL_U = 0.25
/** 各层画在哪：谷底的影子、崖壁上的绳梯、掉下去的身体（引擎的被挡层，0.5）、雾与河、谷里的鹰、碎木板、吊桥、台上的小旗 */
const DEPTH = { shade: 0.3, ladder: 0.4, mist: 0.6, birds: 0.62, ring: 0.64, debris: 0.7, bridge: 0.8, flags: 0.9 } as const
/** 雾往哪飘，格/秒 */
const WIND = { x: 0.12, y: 0.03 } as const
/** 掉进谷里的身体画小到这么多，蒙上这层雾色 */
const SUNK_SCALE = 0.7
const SUNK_TINT = 0xb8aee0
/** 桥晃：空桥也被风吹得轻轻晃，越重晃得越大（格）；八成以上开始抖 */
const SWAY_U = { calm: 0.05, load: 0.14 } as const
const SHAKE_FROM = 0.75
/** 快压断的桥多久吱嘎一声，毫秒 */
const CREAK_MS = 1300
/** 盘旋的鹰几只 */
const BIRDS = 3

interface Debris {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  spin: number
  w: number
  h: number
  color: number
  at: number
  life: number
}

interface Bird {
  cx: number
  cy: number
  r: number
  w: number
  a: number
  flap: number
}

/**
 * 索桥：砂岩台面、露出来的崖壁、谷底的砂砾和河、两岸的台地，都是开局在后台线程画好的一张贴图；谷底的雾与河面的碎光由着色器画。
 * 吊桥每帧按载重画：越重垂得越低、晃得越厉害，绳子绷得发红；断了两截从桩子垂进谷里，重新拉绳时一截截拉回来。
 * 掉进谷里的身体画在雾和桥的底下，小一圈、蒙着雾色；绳梯挂在朝镜头的崖壁上，台沿插着小旗
 */
export class CanyonView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private plan?: CanyonPlan
  private painter?: CanyonPainter
  private state?: CanyonState
  private bridges?: Phaser.GameObjects.Graphics
  private shade?: Phaser.GameObjects.Graphics
  private flags?: Phaser.GameObjects.Graphics
  private birdsG?: Phaser.GameObjects.Graphics
  private ring?: Phaser.GameObjects.Graphics
  private debrisG?: Phaser.GameObjects.Graphics
  private puffs?: Phaser.GameObjects.Particles.ParticleEmitter
  private readonly u = { time: 0 }
  private readonly lowered = new Map<number, { z: number; uid: number }>()
  private debris: Debris[] = []
  private birds: Bird[] = []
  private creakAt = 0
  private leader = -1
  private now = 0

  private planOf(v: ViewCtx): CanyonPlan {
    if (!this.plan) this.plan = canyonPlanFor(v.def.canyon!, v.run.decorSeed)
    return this.plan
  }

  layout(): { w: number; h: number; origin: Point } {
    return { w: FRAME.w, h: FRAME.h, origin: FRAME_MID }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-2)))
    if (!v.scene.textures.exists(PUFF_KEY)) canvasTexture(v.scene, PUFF_KEY, 64, 64, (ctx) => drawPuff(ctx, 64))
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  /** 台面上零星的羽毛、碎石与枯骨：只撒在台面上，离台沿留出半格 */
  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const plan = this.planOf(v)
    const rng = new Rng(v.run.decorSeed ^ 0x3ca7)
    for (const d of rollDecor(v.def.decor, () => rng.next(), FRAME.w / UNIT, FRAME.h / UNIT)) {
      const x = d.xU * UNIT
      const y = d.yU * UNIT
      if (roomAt(plan.top, x, y) < 0.6 * UNIT) continue
      v.decor.push(decorSprite(atlas, d.emoji, x, y, d.sizeU * UNIT, d.rotation, d.alpha))
    }
  }

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const st = sim.worldState.canyon
    if (!st) return
    this.state = st
    const scene = v.scene
    const sc: PaintScene = { cfg: v.def.canyon!, plan: st.plan }
    const size = textureSize()
    const tex = canvasTexture(scene, GROUND_KEY, size.w, size.h)
    const painter = new CanyonPainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
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
    this.visuals.push(scene.add.image(0, 0, GROUND_KEY).setOrigin(0, 0).setDisplaySize((size.w / GROUND_PPU) * UNIT, (size.h / GROUND_PPU) * UNIT).setDepth(-1))
    const floor = this.gorgeLayer(v, sc)
    this.shade = scene.add.graphics().setDepth(DEPTH.shade)
    // 谷底的影子只落在露出来的谷底上：台面与崖壁上的被台挡着
    this.shade.enableFilters()
    this.shade.filters?.internal.addMask(floor)
    this.ladders(scene, st.plan)
    this.birdsG = scene.add.graphics().setDepth(DEPTH.birds)
    this.ring = scene.add.graphics().setDepth(DEPTH.ring)
    this.debrisG = scene.add.graphics().setDepth(DEPTH.debris)
    this.bridges = scene.add.graphics().setDepth(DEPTH.bridge)
    this.flags = scene.add.graphics().setDepth(DEPTH.flags)
    this.puffs = scene.add
      .particles(0, 0, PUFF_KEY, {
        lifespan: { min: 700, max: 1300 },
        speed: { min: 10, max: 46 },
        scale: { start: 0.25, end: 0.9 },
        alpha: { start: 0.45, end: 0 },
        tint: [0xc7a184, 0xa98a7a, 0x8e7c8c],
        emitting: false,
      })
      .setDepth(DEPTH.debris)
    this.visuals.push(this.shade, this.birdsG, this.ring, this.debrisG, this.bridges, this.flags, this.puffs)
    const rng = new Rng(v.run.decorSeed ^ 0xb12d)
    for (let i = 0; i < BIRDS; i++) {
      this.birds.push({ cx: (14 + rng.next() * 20) * UNIT, cy: (14 + rng.next() * 20) * UNIT, r: (2.5 + rng.next() * 3.5) * UNIT, w: (0.18 + rng.next() * 0.12) * (rng.next() < 0.5 ? -1 : 1), a: rng.next() * Math.PI * 2, flap: rng.next() * 10 })
    }
    v.lens.screen.vignette(0.72, 0.2, 0x140c22)
  }

  /** 雾与河的着色器：数据图在主线程按摆法算一次；顺便给出谷底露出来那片的遮罩 */
  private gorgeLayer(v: ViewCtx, sc: PaintScene): Phaser.GameObjects.Image {
    const d = gorgeData(sc, GORGE_CELL_U)
    const mask = canvasTexture(v.scene, FLOOR_KEY, d.cols, d.rows)
    const m = new ImageData(d.cols, d.rows)
    for (let i = 0; i < d.cols * d.rows; i++) {
      m.data[i * 4] = 255
      m.data[i * 4 + 1] = 255
      m.data[i * 4 + 2] = 255
      m.data[i * 4 + 3] = d.data[i * 4]! > 240 ? 255 : 0
    }
    mask.getContext().putImageData(m, 0, 0)
    mask.refresh()
    mask.setFilter(Phaser.Textures.FilterMode.LINEAR)
    const floor = v.scene.add.image(0, 0, FLOOR_KEY).setOrigin(0, 0).setDisplaySize(FRAME.w, FRAME.h).setVisible(false)
    this.visuals.push(floor)
    const tex = canvasTexture(v.scene, GORGE_KEY, d.cols, d.rows)
    tex.getContext().putImageData(new ImageData(d.data, d.cols, d.rows), 0, 0)
    tex.refresh()
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
    const u = this.u
    const world = [FRAME.w / UNIT, FRAME.h / UNIT]
    this.visuals.push(
      v.scene.add
        .shader(
          {
            name: 'CanyonGorge',
            fragmentSource: GORGE_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uData', 0)
              set('uWorld', world)
              set('uTime', u.time)
              set('uWind', [WIND.x, WIND.y])
            },
          },
          0,
          0,
          FRAME.w,
          FRAME.h,
          [GORGE_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(DEPTH.mist),
    )
    return floor
  }

  /** 绳梯：从台沿顺着朝镜头的崖壁垂到谷底，两根绳一档档的木横档，越往下越隐进雾里；脚下一堆垒起来的石头 */
  private ladders(scene: Phaser.Scene, plan: CanyonPlan): void {
    const g = scene.add.graphics().setDepth(DEPTH.ladder)
    this.visuals.push(g)
    for (const c of plan.climbs) {
      const x = c.x * UNIT
      const y0 = c.y * UNIT - 0.1 * UNIT
      const y1 = c.foot.y * UNIT
      const half = 0.17 * UNIT
      const n = Math.floor((y1 - y0) / (0.26 * UNIT))
      for (let k = 1; k <= n; k++) {
        const y = y0 + ((y1 - y0) * k) / n
        const f = k / n
        g.lineStyle(4, 0x2a1a14, 0.6 * (1 - f * 0.5)).lineBetween(x - half, y + 1, x + half, y + 1)
        g.lineStyle(2.5, mix(0xb98a5a, 0x6c5a7c, f * 0.6), 1 - f * 0.4).lineBetween(x - half, y, x + half, y)
      }
      for (const side of [-1, 1]) {
        g.lineStyle(4, 0x2a1a14, 0.7).lineBetween(x + side * half, y0, x + side * half, y1)
        g.lineStyle(2.2, 0xd8bf92, 1).lineBetween(x + side * half, y0, x + side * half, y1)
      }
      // 脚下的石堆
      for (const [dx, dy, r] of [[-0.18, 0.12, 0.16], [0.16, 0.14, 0.14], [0, 0.02, 0.12], [0.02, -0.1, 0.09]] as const) {
        g.fillStyle(0x1e1426, 0.55).fillEllipse(x + (dx + 0.08) * UNIT, y1 + (dy + 0.06) * UNIT + 4, r * 2.2 * UNIT, r * 1.3 * UNIT)
        g.fillStyle(0x9a8aa4, 1).fillEllipse(x + dx * UNIT, y1 + dy * UNIT, r * 2 * UNIT, r * 1.5 * UNIT)
        g.fillStyle(0xd2c6d6, 0.8).fillEllipse(x + (dx - r * 0.3) * UNIT, y1 + (dy - r * 0.3) * UNIT, r * 0.9 * UNIT, r * 0.6 * UNIT)
      }
    }
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const st = sim.worldState.canyon
    if (!st || !this.bridges) return
    this.state = st
    this.leader = sim.leader
    const now = sim.elapsedMs
    this.now = now
    this.u.time = now / 1000
    this.lower(sim, st)
    this.listen(v, sim, st)
    this.drawBridges(v, st, now)
    this.drawFlags(st, now)
    this.drawBirds(delta)
    this.drawDebris(delta, now)
    this.drawRing(sim, st, now)
  }

  /** 掉进谷里的身体连同手上的武器，z 挪到被挡住的那一层：画在雾与桥的底下；爬上来了按原样放回 */
  private lower(sim: Sim, st: CanyonState): void {
    const seen = new Set<number>()
    const put = (eid: number): void => {
      seen.add(eid)
      if (Depth.z[eid]! < UNDER_Z) return
      this.lowered.set(eid, { z: Depth.z[eid]!, uid: Uid.v[eid]! })
      Depth.z[eid] = UNDER_Z - 1000 + Depth.z[eid]!
    }
    for (const [eid, f] of st.feet) if (f.uid === Uid.v[eid] && f.mode !== TOP) put(eid)
    for (const eid of query(sim.world, [Mounted, Depth])) if (seen.has(Mounted.host[eid]!)) put(eid)
    for (const [eid, was] of this.lowered) {
      if (seen.has(eid)) continue
      if (Uid.v[eid] === was.uid && Depth.z[eid]! < UNDER_Z) Depth.z[eid] = was.z
      this.lowered.delete(eid)
    }
  }

  /** 世界报来的事：桥断了木板四散往下掉，掉下去的身体扬起一团尘，金币一闪掉进谷里；快压断的桥吱嘎作响 */
  private listen(v: ViewCtx, sim: Sim, st: CanyonState): void {
    const now = sim.elapsedMs
    for (const e of st.events) {
      if (e.kind === 'snap') {
        const b = st.bridges[e.bridge]!
        playSfx('splinter')
        playSfx('crumble')
        const n = Math.floor(b.len / (0.32 * UNIT))
        for (let k = 0; k <= n; k++) {
          const t = k / n
          const x = b.ax + b.ux * b.len * t
          const y = b.ay + b.uy * b.len * t
          const away = t < b.snapT ? -1 : 1
          this.debris.push({ x, y, vx: (Math.random() - 0.5) * 40 + away * 25, vy: -20 - Math.random() * 40, rot: Math.atan2(b.uy, b.ux) + Math.PI / 2, spin: (Math.random() - 0.5) * 6, w: b.half * 2 * (0.7 + Math.random() * 0.3), h: 0.22 * UNIT, color: [0x8f877a, 0x9c6c43, 0xcf9858][b.span.kind] ?? 0x9c6c43, at: now, life: 900 + Math.random() * 600 })
        }
        this.puffs?.explode(10, b.ax + b.ux * b.len * b.snapT, b.ay + b.uy * b.len * b.snapT)
        if (v.lens.screen) v.lens.screen.shake(220, 0.003)
      } else if (e.kind === 'fall') {
        playSfx('whoosh')
      } else if (e.kind === 'land') {
        playSfx('thud')
        this.puffs?.explode(6, e.x, e.y)
      } else if (e.kind === 'coin') {
        this.debris.push({ x: e.x, y: e.y, vx: 0, vy: -30, rot: 0, spin: 4, w: e.r * 1.4, h: e.r * 1.4, color: 0xffd54f, at: now, life: 700 })
      } else if (e.kind === 'climbed') {
        this.puffs?.explode(3, e.x, e.y)
      }
    }
    st.events.length = 0
    // 队长附近的桥压过八成就吱嘎作响
    const lx = Transform.x[sim.leader]!
    const ly = Transform.y[sim.leader]!
    if (now < this.creakAt) return
    for (const b of st.bridges) {
      if (b.phase !== 'up' || b.kg < b.cap * SHAKE_FROM) continue
      const mx = b.ax + b.ux * b.len * 0.5
      const my = b.ay + b.uy * b.len * 0.5
      if (Math.hypot(mx - lx, my - ly) > 12 * UNIT) continue
      playSfx('creak')
      this.creakAt = now + CREAK_MS * (1.2 - Math.min(1, b.kg / b.cap) * 0.5)
      break
    }
  }

  private drawBridges(v: ViewCtx, st: CanyonState, now: number): void {
    const g = this.bridges!.clear()
    const sh = this.shade!.clear()
    const cfg = v.def.canyon!
    const depth = st.plan.depth
    const t = now / 1000
    const gust = 0.6 + 0.4 * Math.sin(t * 0.21) * Math.sin(t * 0.13 + 1)
    st.bridges.forEach((b, j) => {
      const seed = st.plan.seed + j * 977
      const load = Math.min(1.3, b.kg / b.cap)
      if (b.phase === 'up') {
        const amp = (SWAY_U.calm * gust + SWAY_U.load * load) * UNIT
        const sw: Swing = { sway: amp * Math.sin(t * (1.6 + (j % 3) * 0.23) + j), shake: Math.max(0, (load - SHAKE_FROM) / (1 - SHAKE_FROM)) }
        drawShadow(sh, b, cfg, depth, 0, 1)
        drawUp(g, b, cfg, sw, now, seed)
        drawPosts(g, b, 0)
        return
      }
      const p = b.phase === 'rebuild' ? Math.min(1, (now - b.since) / cfg.bridge.rebuildMs) : 0
      drawHanging(g, b, depth, now, seed, b.phase === 'down' ? 1 : Math.max(0, 1 - p * 1.8))
      if (b.phase === 'rebuild') {
        drawRebuild(g, b, cfg, p, now, seed)
        const blink = 0.5 + 0.5 * Math.sin(now / 110)
        drawPosts(g, b, blink)
      } else drawPosts(g, b, 0)
    })
  }

  /** 绳梯上头的小旗：插在台沿的木杆上，被谷风吹得一飘一飘 */
  private drawFlags(st: CanyonState, now: number): void {
    const g = this.flags!.clear()
    const t = now / 1000
    for (const c of st.plan.climbs) {
      const x = (c.x - c.nx * 0.25) * UNIT
      const y = (c.y - c.ny * 0.25) * UNIT
      const h = 1.7 * LIFT_PER_M
      g.fillStyle(0x000000, 0.25).fillEllipse(x + AWAY.x * h * 0.6, y + AWAY.y * h * 0.6, 0.2 * UNIT, 0.1 * UNIT)
      g.lineStyle(4, 0x2a1a14, 1).lineBetween(x, y, x, y - h)
      g.lineStyle(2.2, 0xa87a4e, 1).lineBetween(x, y, x, y - h)
      const wave = (k: number): number => Math.sin(t * 5 + k * 2.2 + c.x) * 0.07 * UNIT * k
      const len = 0.62 * UNIT
      const pts = [
        { x, y: y - h },
        { x: x + len * 0.5, y: y - h + 0.06 * UNIT + wave(0.5) },
        { x: x + len, y: y - h + 0.16 * UNIT + wave(1) },
        { x: x + len * 0.5, y: y - h + 0.3 * UNIT + wave(0.5) },
        { x, y: y - h + 0.34 * UNIT },
      ]
      fillPoly(g.fillStyle(0x2a1a14, 1), pts.map((p) => ({ x: p.x + 1.5, y: p.y + 1.5 })))
      fillPoly(g.fillStyle(0x2fb6a8, 1), pts)
      fillPoly(g.fillStyle(0xf4d35e, 1), [pts[0]!, pts[1]!, { x: x + len * 0.25, y: y - h + 0.17 * UNIT }, { x, y: y - h + 0.17 * UNIT }])
      // 台沿上一盘绳
      g.fillStyle(0x2a1a14, 0.9).fillCircle(x - 0.22 * UNIT, y + 0.05 * UNIT, 0.15 * UNIT)
      g.lineStyle(2, 0xd8bf92, 1).strokeCircle(x - 0.22 * UNIT, y + 0.05 * UNIT, 0.11 * UNIT)
      g.lineStyle(2, 0xd8bf92, 1).strokeCircle(x - 0.22 * UNIT, y + 0.05 * UNIT, 0.05 * UNIT)
    }
  }

  /** 谷里盘旋的鹰：远远的一个个剪影，翅膀慢慢扇一下又滑翔；影子落在更下面的谷底 */
  private drawBirds(delta: number): void {
    const g = this.birdsG!.clear()
    const sh = this.shade!
    const dt = Math.min(delta, 50) / 1000
    for (const b of this.birds) {
      b.a += b.w * dt
      b.flap += dt
      const x = b.cx + Math.cos(b.a) * b.r
      const y = b.cy + Math.sin(b.a) * b.r * 0.8
      const head = b.a + (b.w > 0 ? Math.PI / 2 : -Math.PI / 2)
      const beat = Math.max(0, Math.sin(b.flap * 3)) ** 3 * (Math.sin(b.flap * 0.4) > 0.3 ? 1 : 0)
      const span = 0.5 * UNIT
      const fx = Math.cos(head)
      const fy = Math.sin(head)
      const wing = (side: number, k: number): Point[] => {
        const lx = -fy * side
        const ly = fx * side
        const lift = 0.25 * k
        return [
          { x: x + fx * 0.06 * UNIT, y: y + fy * 0.06 * UNIT },
          { x: x + lx * span * 0.55 + fx * 0.05 * UNIT, y: y + ly * span * 0.55 + fy * 0.05 * UNIT - lift * UNIT * 0.3 },
          { x: x + lx * span - fx * 0.08 * UNIT, y: y + ly * span - fy * 0.08 * UNIT - lift * UNIT * 0.2 },
          { x: x + lx * span * 0.45 - fx * 0.12 * UNIT, y: y + ly * span * 0.45 - fy * 0.12 * UNIT },
          { x: x - fx * 0.1 * UNIT, y: y - fy * 0.1 * UNIT },
        ]
      }
      const sx = AWAY.x * 1.6 * UNIT
      const sy = AWAY.y * 1.6 * UNIT + 0.9 * UNIT
      for (const side of [-1, 1]) fillPoly(sh.fillStyle(0x140a22, 0.16), wing(side, 0).map((p) => ({ x: p.x + sx, y: p.y + sy })))
      for (const side of [-1, 1]) fillPoly(g.fillStyle(0x3a2632, 0.88), wing(side, beat))
      g.fillStyle(0x2a1a22, 0.9).fillEllipse(x, y, 0.12 * UNIT, 0.12 * UNIT)
      g.fillStyle(0xe8ddd0, 0.85).fillCircle(x + fx * 0.11 * UNIT, y + fy * 0.11 * UNIT, 0.045 * UNIT)
    }
  }

  /** 崩断时四散的木板与掉进谷里的金币：往下掉、打着转、越掉越小越淡 */
  private drawDebris(delta: number, now: number): void {
    const g = this.debrisG!.clear()
    const dt = Math.min(delta, 50) / 1000
    this.debris = this.debris.filter((d) => now - d.at < d.life)
    for (const d of this.debris) {
      d.vy += 560 * dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.rot += d.spin * dt
      const k = (now - d.at) / d.life
      const s = 1 - k * 0.55
      const c = Math.cos(d.rot)
      const sn = Math.sin(d.rot)
      const hw = (d.w / 2) * s
      const hh = (d.h / 2) * s
      const pts = [
        { x: d.x - c * hw + sn * hh, y: d.y - sn * hw - c * hh },
        { x: d.x + c * hw + sn * hh, y: d.y + sn * hw - c * hh },
        { x: d.x + c * hw - sn * hh, y: d.y + sn * hw + c * hh },
        { x: d.x - c * hw - sn * hh, y: d.y - sn * hw + c * hh },
      ]
      fillPoly(g.fillStyle(mix(d.color, 0x4a3c6a, k * 0.7), 1 - k), pts)
    }
  }

  /** 队长在谷底时，他要去爬的那根绳梯脚下一圈圈亮起来 */
  private drawRing(sim: Sim, st: CanyonState, now: number): void {
    const g = this.ring!.clear()
    const f = st.feet.get(sim.leader)
    if (!f || f.uid !== Uid.v[sim.leader] || f.mode !== DOWN) return
    const p = sim.hooks.beacon?.(sim)
    if (!p) return
    for (let k = 0; k < 2; k++) {
      const ph = ((now / 1100 + k * 0.5) % 1)
      g.lineStyle(3, 0xffe082, (1 - ph) * 0.9).strokeEllipse(p.x, p.y, (0.4 + ph * 0.9) * UNIT * 2, (0.4 + ph * 0.9) * UNIT * 1.2)
    }
  }

  /** 掉进谷里的身体画小一圈、蒙上雾色；正在掉的越掉越小，正在爬的越爬越回原样 */
  lookOf(eid: number, out: BodyLook): boolean {
    const st = this.state
    if (!st) return false
    const f = st.feet.get(eid)
    if (!f || f.uid !== Uid.v[eid] || f.mode === TOP) return false
    let k = 1
    if (f.mode === FALLING) k = Math.min(1, (this.now - f.at) / f.ms) ** 1.5
    else if (f.mode === CLIMBING) {
      const p = Math.min(1, (this.now - f.at) / f.ms)
      k = 1 - p * p * (3 - 2 * p)
    }
    out.scale = 1 - (1 - SUNK_SCALE) * k
    out.tint = mix(0xffffff, SUNK_TINT, k)
    out.alpha = eid === this.leader ? 1 : 1 - 0.1 * k
    return true
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    this.lowered.clear()
    this.debris = []
    this.birds = []
    this.state = undefined
    this.bridges = undefined
    for (const key of [GROUND_KEY, GORGE_KEY, FLOOR_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}

