import Phaser from 'phaser'
import { UNIT } from '../../util/units'
import { Rng } from '../../util/rng'
import { keepDecor } from '../../ecs/decor'
import type { Point } from '../../util/vec'
import type { Sim } from '../../ecs/sim'
import { canvasTexture, drawPuff } from '../textures'
import { roomAt } from '../basin'
import { DECK_PPU, deckFrame, drawEdgeField, drawRig, EDGE_PPU, drawRigShadow, drawWaveTile, paintDeck, paintWet, rigOf, SEA_FRAG, SHADOW_PER_U, WAVE_TILE, WET_PPU } from './render'
import { SUN } from '../../data/light'
import { deckPoint } from './model'
import type { ShipState } from './model'
import { GRAVITY, halfBeamAt } from './physics'
import type { ShipConfig } from '../../types/maps'
import { playSfx } from '../../audio/sfx'
import type { Framing } from '../../ecs/lens'
import { FRAME, FRAME_MID } from '../frame'
import { BoundedView } from '../../ecs/views'
import type { ViewCtx } from '../../ecs/views'

const SHIP_BG = 0x056b6b
const WAVE_KEY = 'ship-wave'
const EDGE_KEY = 'ship-edge'
const WET_KEY = 'ship-wet'
/** 每局都是同一艘船：甲板、海面的波纹与船形的距离场按横竖屏各画一次，之后一直留着 */
const SHIP_SEED = 0x5eaf
const DECK_KEY = 'ship-deck'
const BALL_KEY = 'ship-ball'
const GULL_KEY = 'ship-gull'
const LANTERN_KEY = 'ship-lantern'
const SHIP_PUFF_KEY = 'ship-puff'
/** 风从左舷偏船尾吹来，往右舷偏船头吹：船上的方向（沿船长、横过船宽） */
const SHIP_WIND = { s: 0.3, t: 0.95 }
const GULL_SCALE = (1.4 * UNIT) / 96
/** 船壳上端到水面有多高才画出一圈船舷，米 */
const HULL_BAND_M = 0.16

/** 一盏吊灯：挂钩在船上 (s, t) 格、离甲板 hook 米，灯绳 cord 米；灯按单摆摆，角度相对铅垂线 */
interface Lantern {
  readonly s: number
  readonly t: number
  readonly hook: number
  readonly cord: number
  across: number
  along: number
  vAcross: number
  vAlong: number
  readonly body: Phaser.GameObjects.Image
}

/** 一只海鸥绕着船上空的一点盘旋，偶尔扇几下翅膀 */
interface Gull {
  s: number
  t: number
  readonly r: number
  a: number
  readonly w: number
  readonly img: Phaser.GameObjects.Image
  flapAt: number
}

/** 甲板上的铁炮弹：暗铁色的球，左上方一点高光 */
function drawBall(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  const g = ctx.createRadialGradient(c * 0.7, c * 0.62, size * 0.04, c, c, c * 0.98)
  g.addColorStop(0, '#8d8c96')
  g.addColorStop(0.25, '#43424a')
  g.addColorStop(0.8, '#17161a')
  g.addColorStop(1, '#070709')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(c, c, c * 0.96, 0, Math.PI * 2)
  ctx.fill()
}

/** 从上往下看的海鸥：白身子，灰翅膀，翅尖发黑 */
function drawGull(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2
  const cy = h * 0.46
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#b9bec4'
    ctx.beginPath()
    ctx.moveTo(cx, cy - h * 0.06)
    ctx.quadraticCurveTo(cx + side * w * 0.22, cy - h * 0.3, cx + side * w * 0.48, cy - h * 0.04)
    ctx.quadraticCurveTo(cx + side * w * 0.26, cy - h * 0.02, cx, cy + h * 0.12)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#2a2b2f'
    ctx.beginPath()
    ctx.moveTo(cx + side * w * 0.38, cy - h * 0.1)
    ctx.quadraticCurveTo(cx + side * w * 0.44, cy - h * 0.12, cx + side * w * 0.48, cy - h * 0.04)
    ctx.quadraticCurveTo(cx + side * w * 0.42, cy - h * 0.03, cx + side * w * 0.36, cy - h * 0.04)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = '#f2f1ec'
  ctx.beginPath()
  ctx.ellipse(cx, cy + h * 0.05, w * 0.045, h * 0.3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e8b54a'
  ctx.beginPath()
  ctx.arc(cx, cy - h * 0.26, w * 0.018, 0, Math.PI * 2)
  ctx.fill()
}

/** 从上往下看的吊灯：黑铁的灯罩顶，四周一圈映着天光的玻璃；白天不点 */
function drawLantern(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  const hexagon = (r: number): void => {
    ctx.beginPath()
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2
      const x = c + Math.cos(a) * size * r
      const y = c + Math.sin(a) * size * r
      if (k === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }
  ctx.fillStyle = 'rgba(214,230,232,0.85)'
  hexagon(0.3)
  ctx.fill()
  ctx.fillStyle = '#1b1612'
  hexagon(0.2)
  ctx.fill()
  ctx.fillStyle = '#6a5436'
  ctx.beginPath()
  ctx.arc(c, c, size * 0.07, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 船：海面由着色器画，正午的松石绿浅海、风浪两层交错、白浪、船舷、水线白沫、船头浪与尾流，铺满方框；甲板是一张程序画出的木板贴图；
 * 桅杆、帆桁、索具与帆按高度随船的横摇纵摇甩开，影子背着太阳投在甲板上；吊灯按单摆挂着，白天不点；
 * 炮弹顺坡滚，低的一侧舷边溅浪花，海鸥在桅顶上空盘旋。船长沿进场时屏幕的长边摆，之后不再随屏幕转
 */
export class ShipView extends BoundedView {
  private readonly u = { time: 0, roll: 0, pitch: 0 }
  private rig?: Phaser.GameObjects.Graphics
  private shade?: Phaser.GameObjects.Graphics
  private ballShade?: Phaser.GameObjects.Graphics
  private deckImg?: Phaser.GameObjects.Image
  private balls: Phaser.GameObjects.Image[] = []
  private lanterns: Lantern[] = []
  private gulls: Gull[] = []
  private spray?: Phaser.GameObjects.Particles.ParticleEmitter
  /** 两舷的湿甲板：溅上浪花就湿，慢慢晾干 */
  private wet: { side: number; img: Phaser.GameObjects.Image; level: number }[] = []
  private rate = { roll: 0, pitch: 0 }
  private sprayAt = 0
  private creakAt = 0

  layout(): { w: number; h: number; origin: Point } {
    return { w: FRAME.w, h: FRAME.h, origin: FRAME_MID }
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, SHIP_BG).setDepth(-3)))
    const scene = v.scene
    if (!scene.textures.exists(SHIP_PUFF_KEY)) canvasTexture(scene, SHIP_PUFF_KEY, 64, 64, (ctx) => drawPuff(ctx, 64))
    if (!scene.textures.exists(BALL_KEY)) canvasTexture(scene, BALL_KEY, 48, 48, (ctx) => drawBall(ctx, 48))
    if (!scene.textures.exists(GULL_KEY)) canvasTexture(scene, GULL_KEY, 96, 48, (ctx) => drawGull(ctx, 96, 48))
    if (!scene.textures.exists(LANTERN_KEY)) canvasTexture(scene, LANTERN_KEY, 48, 48, (ctx) => drawLantern(ctx, 48))
  }

  onSimReady(v: ViewCtx, sim: Sim): void {
    const s = sim.worldState.ship
    if (!s) return
    const cfg = v.def.ship!
    const scene = v.scene
    const deck = s.deck
    const seed = v.run.decorSeed
    const toWorld = (ls: number, lt: number): Point => ({ x: deck.bx * ls + deck.sx * lt, y: deck.by * ls + deck.sy * lt })
    const sunH = Math.hypot(SUN.x, SUN.y)
    const light = { s: (SUN.x * deck.bx + SUN.y * deck.by) / sunH, t: (SUN.x * deck.sx + SUN.y * deck.sy) / sunH }
    const wl = Math.hypot(SHIP_WIND.s, SHIP_WIND.t)
    const wind = toWorld(SHIP_WIND.s / wl, SHIP_WIND.t / wl)
    const turn = deck.bx !== 0 ? 'h' : 'v'
    const waveKey = `${WAVE_KEY}-${turn}`
    const edgeKey = `${EDGE_KEY}-${turn}`
    const deckKey = `${DECK_KEY}-${turn}`
    if (!scene.textures.exists(waveKey)) canvasTexture(scene, waveKey, WAVE_TILE, WAVE_TILE, (ctx) => drawWaveTile(ctx, wind, SHIP_SEED ^ 0x3a7)).setWrap(Phaser.Textures.WrapMode.REPEAT, Phaser.Textures.WrapMode.REPEAT)
    const ec = Math.ceil((v.w / UNIT) * EDGE_PPU)
    const er = Math.ceil((v.h / UNIT) * EDGE_PPU)
    if (!scene.textures.exists(edgeKey)) canvasTexture(scene, edgeKey, ec, er, (ctx) => drawEdgeField(ctx, cfg, deck, ec, er))
    const h = cfg.hull
    const rect = [FRAME.x, FRAME.y, FRAME.w, FRAME.h]
    const freeU = (cfg.hydro.depthM - cfg.hydro.draftM) / cfg.meterPerU
    const shadowU = freeU * SHADOW_PER_U
    const away = { x: -SUN.x / sunH, y: -SUN.y / sunH }
    const shadowPx = [away.x * shadowU * UNIT, away.y * shadowU * UNIT]
    const u = this.u
    const speedU = cfg.sea.speedMs / cfg.meterPerU
    const sunLen = Math.hypot(SUN.x, SUN.y, SUN.z)
    const sunDir = [SUN.x / sunLen, SUN.y / sunLen, SUN.z / sunLen]
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'ShipSea',
            fragmentSource: SEA_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uWave', 0)
              set('uEdge', 1)
              set('uTime', u.time)
              set('uRect', rect)
              set('uUnit', UNIT)
              set('uGrid', [(ec * UNIT) / EDGE_PPU, (er * UNIT) / EDGE_PPU, UNIT / EDGE_PPU])
              set('uShip', [deck.ox, deck.oy, deck.bx, deck.by])
              set('uHullA', [h.lengthU, h.beamU, h.bow * h.lengthU, h.bowPow])
              set('uHullB', [h.stern * h.lengthU, h.sternPow, (h.beamU / 2) * h.transom, h.transomBulge * h.beamU])
              set('uHullC', [h.bulwarkU, freeU, speedU, HULL_BAND_M / cfg.meterPerU + 0.12])
              set('uTilt', [Math.sin(u.roll), Math.sin(u.pitch), 0, 0])
              set('uWind', [wind.x, wind.y, shadowPx[0], shadowPx[1]])
              set('uSun', sunDir)
            },
          },
          rect[0]!,
          rect[1]!,
          rect[2]!,
          rect[3]!,
          [waveKey, edgeKey],
        )
        .setOrigin(0, 0)
        .setDepth(-2),
    )
    const fr = deckFrame(cfg)
    const dw = Math.ceil((fr.s1 - fr.s0) * DECK_PPU)
    const dh = Math.ceil(2 * fr.t1 * DECK_PPU)
    if (!scene.textures.exists(deckKey)) canvasTexture(scene, deckKey, dw, dh, (ctx) => paintDeck(ctx, cfg, SHIP_SEED, light))
    const corner = deckPoint(deck, fr.s0, -fr.t1)
    this.deckImg = scene.add
      .image(corner.x, corner.y, deckKey)
      .setOrigin(0, 0)
      .setDisplaySize((dw / DECK_PPU) * UNIT, (dh / DECK_PPU) * UNIT)
      .setRotation(Math.atan2(deck.by, deck.bx))
      .setDepth(-1)
    const ww = Math.ceil((fr.s1 - fr.s0) * WET_PPU)
    const wh = Math.ceil(fr.t1 * WET_PPU)
    for (const side of [-1, 1]) {
      const key = `${WET_KEY}-${side > 0 ? 's' : 'p'}`
      if (!scene.textures.exists(key)) canvasTexture(scene, key, ww, wh, (ctx) => paintWet(ctx, cfg, side))
      const at = deckPoint(deck, fr.s0, side > 0 ? 0 : -fr.t1)
      const img = scene.add
        .image(at.x, at.y, key)
        .setOrigin(0, 0)
        .setDisplaySize((ww / WET_PPU) * UNIT, (wh / WET_PPU) * UNIT)
        .setRotation(Math.atan2(deck.by, deck.bx))
        .setDepth(-0.9)
        .setAlpha(0)
      this.wet.push({ side, img, level: 0 })
      this.visuals.push(img)
    }
    this.shade = scene.add.graphics().setDepth(-0.8)
    this.ballShade = scene.add.graphics().setDepth(-0.6)
    this.rig = scene.add.graphics().setDepth(31)
    this.visuals.push(this.deckImg, this.shade, this.ballShade, this.rig)
    keepDecor(v.decor, (s) => roomAt(deck.basin, s.x, s.y) >= 0.7 * UNIT && roomAt(deck.basin, s.x, s.y) < 2.5 * UNIT)
    this.balls = s.balls.map(() => scene.add.image(0, 0, BALL_KEY).setDepth(0.9).setDisplaySize(cfg.balls.radiusU * 2 * UNIT, cfg.balls.radiusU * 2 * UNIT))
    this.visuals.push(...this.balls)
    const masts = rigOf(cfg)
    const hangs: { s: number; t: number; hook: number; cord: number }[] = [
      { s: -h.transomBulge * h.beamU - h.bulwarkU - 0.5, t: 0, hook: 1.9, cord: 0.25 },
      ...masts.map((m, i) => ({ s: m.s + (i === masts.length - 1 ? -0.7 : 0.7), t: 0, hook: 2.7, cord: 0.5 })),
    ]
    const rng = new Rng(seed ^ 0x1a77)
    for (const hg of hangs) {
      const body = scene.add.image(0, 0, LANTERN_KEY).setDepth(32.1).setScale((0.62 * UNIT) / 48)
      this.lanterns.push({ ...hg, across: 0, along: 0, vAcross: 0, vAlong: 0, body })
      this.visuals.push(body)
    }
    for (let i = 0; i < 3; i++) {
      const m = masts[Math.floor(rng.next() * masts.length)]!
      const img = scene.add.image(0, 0, GULL_KEY).setDepth(37).setScale(GULL_SCALE).setAlpha(0.88)
      this.gulls.push({ s: m.s + (rng.next() * 2 - 1) * 4.5, t: (rng.next() * 2 - 1) * 3, r: (3.5 + rng.next() * 4.5) * UNIT, a: rng.next() * Math.PI * 2, w: (0.18 + rng.next() * 0.14) * (rng.next() < 0.5 ? -1 : 1), img, flapAt: 0 })
      this.visuals.push(img)
    }
    this.spray = scene.add
      .particles(0, 0, SHIP_PUFF_KEY, {
        lifespan: { min: 450, max: 900 },
        speed: { min: 30, max: 120 },
        scale: { start: 0.25, end: 0.9 },
        alpha: { start: 0.55, end: 0 },
        tint: [0xe8f1f0, 0xcfe0e0, 0xffffff],
        emitting: false,
      })
      .setDepth(34)
    this.visuals.push(this.spray)
    v.lens.screen.vignette(0.72, 0.12, 0x000000)
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const s = sim.worldState.ship
    if (!s || !this.rig || !this.shade) return
    const cfg = v.def.ship!
    const deck = s.deck
    const dt = Math.min(delta, 50) / 1000
    const now = sim.elapsedMs
    const roll = s.roll.angle
    const pitch = s.pitch.angle
    const rollAcc = dt > 0 ? (s.roll.rate - this.rate.roll) / dt : 0
    const pitchAcc = dt > 0 ? (s.pitch.rate - this.rate.pitch) / dt : 0
    this.rate.roll = s.roll.rate
    this.rate.pitch = s.pitch.rate
    this.u.time = now / 1000
    this.u.roll = roll
    this.u.pitch = pitch
    const pose = { roll, pitch }
    const wind = { s: SHIP_WIND.s, t: SHIP_WIND.t }
    this.rig.clear()
    drawRig(this.rig, cfg, deck, pose, now / 1000, wind)
    this.shade.clear()
    drawRigShadow(this.shade, cfg, deck, pose)
    // 甲板的法线随倾斜偏向低的一侧，朝着太阳偏就亮一点
    const sunLen = Math.hypot(SUN.x, SUN.y, SUN.z)
    const nx = Math.sin(pitch) * deck.bx + Math.sin(roll) * deck.sx
    const ny = Math.sin(pitch) * deck.by + Math.sin(roll) * deck.sy
    const lambert = (nx * SUN.x + ny * SUN.y + Math.cos(roll) * Math.cos(pitch) * SUN.z) / sunLen
    const lit = Math.round(255 * Math.min(1, Math.max(0.6, 0.9 + (lambert - SUN.z / sunLen) * 1.1)))
    this.deckImg?.setTint((lit << 16) | (lit << 8) | lit)
    const bs = this.ballShade
    bs?.clear()
    const r = cfg.balls.radiusU * UNIT
    s.balls.forEach((b, i) => {
      this.balls[i]?.setPosition(b.x, b.y)
      bs?.fillStyle(0x000000, 0.35)
      bs?.fillEllipse(b.x - SUN.x * r * 0.9, b.y - SUN.y * r * 0.9, r * 2.3, r * 2)
    })
    const mpu = cfg.meterPerU
    const g = GRAVITY
    // 吊灯是单摆：相对铅垂线的角度按 θ'' = −(g/l)·sinθ − (r·φ''/l)·cosθ − cθ' 推进，挂钩随船横摇纵摇的角加速度甩它
    for (const l of this.lanterns) {
      const arm = l.hook + (cfg.hydro.depthM - cfg.hydro.draftM)
      const steps = Math.max(1, Math.ceil(dt / 0.008))
      const h2 = dt / steps
      for (let k = 0; k < steps; k++) {
        const aA = -(g / l.cord) * Math.sin(l.across) - ((arm * rollAcc) / l.cord) * Math.cos(l.across) - 1.2 * l.vAcross
        const aL = -(g / l.cord) * Math.sin(l.along) - ((arm * pitchAcc) / l.cord) * Math.cos(l.along) - 1.2 * l.vAlong
        l.vAcross += aA * h2
        l.vAlong += aL * h2
        l.across += l.vAcross * h2
        l.along += l.vAlong * h2
      }
      const hookUp = l.hook / mpu
      const ls = l.s + hookUp * Math.sin(pitch) + (l.cord * Math.sin(l.along)) / mpu
      const lt = l.t + hookUp * Math.sin(roll) + (l.cord * Math.sin(l.across)) / mpu
      const p = deckPoint(deck, ls, lt)
      l.body.setPosition(p.x, p.y)
    }
    for (const gl of this.gulls) {
      gl.a += gl.w * dt
      gl.s += 0.15 * dt * Math.sin(now / 7000 + gl.r)
      const c = deckPoint(deck, gl.s, gl.t)
      const x = c.x + Math.cos(gl.a) * gl.r
      const y = c.y + Math.sin(gl.a) * gl.r * 0.8
      const heading = gl.a + (gl.w > 0 ? Math.PI / 2 : -Math.PI / 2)
      if (now > gl.flapAt + 2600 && Math.random() < dt * 0.4) gl.flapAt = now
      const flap = now - gl.flapAt < 900 ? 0.72 + 0.28 * Math.abs(Math.cos((now - gl.flapAt) / 60)) : 1
      gl.img.setPosition(x, y).setRotation(heading + Math.PI / 2).setScale(GULL_SCALE * flap, GULL_SCALE)
    }
    this.splash(cfg, s, now, roll, pitch)
    for (const w of this.wet) {
      const low = Math.max(0, Math.sin(roll) * w.side)
      w.level = Math.max(0, w.level - dt / 7)
      w.img.setAlpha(Math.min(1, w.level * (0.45 + low * 6)))
    }
  }

  /** 低的一侧舷边往下压得快时溅起浪花，船头往下扎时船头也溅；船摇到头时木头吱呀一声 */
  private splash(cfg: ShipConfig, s: ShipState, now: number, roll: number, pitch: number): void {
    const em = this.spray
    if (!em) return
    const deck = s.deck
    const h = cfg.hull
    const dip = Math.abs(s.roll.rate) * (Math.sign(s.roll.rate) === Math.sign(roll) ? 1 : 0)
    if (now >= this.sprayAt && (dip > 0.012 || (s.pitch.rate > 0.02 && pitch > 0.008))) {
      this.sprayAt = now + 160
      const side = Math.sign(roll) || 1
      const n = Math.min(7, Math.round(dip * 110 + Math.abs(roll) * 18))
      for (let k = 0; k < n; k++) {
        const at = h.stern * h.lengthU + Math.random() * h.lengthU * 0.7
        const p = deckPoint(deck, at, side * (halfBeamAt(h, at) + h.bulwarkU + 0.35))
        em.emitParticleAt(p.x, p.y, 1)
      }
      if (s.pitch.rate > 0.02 && pitch > 0.008) {
        const p = deckPoint(deck, h.lengthU + 0.4, (Math.random() * 2 - 1) * 0.6)
        em.emitParticleAt(p.x, p.y, 3)
      }
      if (n > 3) playSfx('wash')
      for (const w of this.wet) if (w.side === side) w.level = Math.min(1, w.level + n * 0.05)
    }
    if (now >= this.creakAt && Math.abs(roll) > 0.03 && Math.abs(s.roll.rate) < 0.004) {
      this.creakAt = now + 2600
      playSfx('creak')
    }
  }

  destroy(v: ViewCtx): void {
    super.destroy(v)
    this.balls = []
    this.lanterns = []
    this.gulls = []
    this.wet = []
    this.rig = undefined
    this.shade = undefined
    this.ballShade = undefined
    this.deckImg = undefined
    this.spray = undefined
  }
}
