import Phaser from 'phaser'
import { hasComponent, query } from 'bitecs'
import { FRAME_U, LIFT_PER_M, UNIT } from '../../util/units'
import { AWAY, SUN } from '../../data/light'
import { GROUND_PPU } from '../../data/texel'
import { rollDecor } from '../../data/maps'
import { Rng } from '../../util/rng'
import { playSfx } from '../../audio/sfx'
import { decorSprite } from '../../ecs/decor'
import { Alive, Pickup, Radius, Span, Transform } from '../../ecs/components'
import { canvasTexture, drawPuff } from '../textures'
import { FRAME } from '../frame'
import { roomAt } from '../basin'
import { CANOPY_PPU, chuteM, glyphInk, prepare, textureSize } from './ground'
import { TemplePainter } from './painter'
import { drawBeam, drawBoulder, drawDart, drawGlint, drawGlow, drawMacaw, drawMonkey, drawMorpho, drawSpikes, paintPatch, patchOf, pitShade, plateShade } from './sprites'
import { HEAD_HALF_U, plateRect, rectSd, toLocal, toMap } from './layout'
import { mouthOf, templeOf, templePlanFor } from './world'
import type { PaintTask } from './painter'
import type { PaintLayer, PaintPiece, PaintScene } from './ground'
import type { Patch } from './sprites'
import type { BoulderTrap, DartTrap, Local, Rect, TemplePlan, Trap } from './layout'
import type { TempleState, TrapPhase } from './world'
import type { TempleConfig } from '../../types/maps'
import type { EcsAtlas } from '../../ecs/atlas'
import type { MapView, ViewCtx } from '../../ecs/views'
import type { Framing } from '../../ecs/lens'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'

const BG = 0x0f1d14
const GROUND_KEY = 'temple-ground'
const CANOPY_KEY = 'temple-canopy'
const DART_KEY = 'temple-dart'
const GLOW_KEY = 'temple-glow'
const BEAM_KEY = 'temple-beam'
const GLINT_KEY = 'temple-glint'
const DUST_KEY = 'temple-dust'
const MACAW_KEY = 'temple-macaw'
const MORPHO_KEY = 'temple-morpho'
const MONKEY_KEY = 'temple-monkey'
/** 开局最多几个线程分着画 */
const PAINT_THREADS = 4
/** 贴图按这么多像素高的条分块交给线程 */
const STRIP_PX = 64
/** 压板、刺阵、陷坑的贴图每格多少像素 */
const PATCH_PPU = 64
/** 滚石贴图多少像素见方 */
const BOULDER_PX = 112
/** 预警的颜色：要发动的机关在地上罩一层暖红 */
const WARN = 0xff5a2a
/** 光柱：几道、长（格）、宽（格） */
const BEAMS = 6
const BEAM_LEN_U = 6
const BEAM_W_U = 1.5
/** 金刚鹦鹉隔多久飞过一群（毫秒）、翅展（格）、飞多快（格/秒）、离地多高（米） */
const MACAW_MS = { min: 18000, max: 36000 } as const
const MACAW_U = 1.1
const MACAW_SPEED_U = 6
const MACAW_ALT_M = 9
/** 闪蝶几只、翅展（格） */
const MORPHOS = 5
const MORPHO_U = 0.34
/** 墙头上的猴子几只、多大（格），多久叫一次（毫秒） */
const MONKEYS = 3
const MONKEY_U = 0.55
const HOWL_MS = { min: 16000, max: 32000 } as const
/** 新的一块滚石在复位的最后这么多成时间里从上面放下来 */
const LOWER_FRAC = 0.18

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/** 把画布传上显卡并按线性插值采样：重传会按游戏的像素风退回最近邻取样 */
function upload(tex: Phaser.Textures.CanvasTexture): void {
  tex.refresh()
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
}

/** 一张按世界摆正的贴图摆到它的外接框上 */
function placePatch(scene: Phaser.Scene, key: string, p: Patch, depth: number): Phaser.GameObjects.Image {
  return scene.add
    .image(p.x * UNIT, p.y * UNIT, key)
    .setOrigin(0, 0)
    .setDisplaySize((p.w / p.ppu) * UNIT, (p.h / p.ppu) * UNIT)
    .setDepth(depth)
}

/** 本地 (a, b) 压在一处机关的占地或它的压板上 */
function onTrap(cfg: TempleConfig, plan: TemplePlan, t: Trap, a: number, b: number, pad: number): boolean {
  if (rectSd(plateRect(cfg, t.plate), a, b) < pad) return true
  if (t.kind === 'spikes' || t.kind === 'pit') return rectSd(t.rect, a, b) < pad
  if (t.kind === 'boulder') return Math.abs(b - t.b) < cfg.boulder.grooveU / 2 + pad && a < plan.court.front
  return false
}

/** 一处机关的画面：压板（复位好的、踩下去的、符号的光），刺阵的石刺或陷坑的坑，滚石，兽头的眼睛 */
interface TrapFx {
  readonly up: Phaser.GameObjects.Image
  readonly down: Phaser.GameObjects.Image
  readonly glow: Phaser.GameObjects.Image
  readonly field?: Phaser.GameObjects.Image
  readonly eyes?: readonly Phaser.GameObjects.Image[]
  readonly boulder?: { readonly tex: Phaser.Textures.CanvasTexture; readonly img: Phaser.GameObjects.Image; readonly shadow: Phaser.GameObjects.Image; readonly data: ImageData; drawn: number }
  seen: TrapPhase
  /** 这一步里扬过几次灰 */
  dust: number
}

interface Beam {
  readonly img: Phaser.GameObjects.Image
  readonly phase: number
  readonly base: number
}

interface Macaw {
  x: number
  y: number
  readonly vx: number
  readonly vy: number
  flap: number
  readonly img: Phaser.GameObjects.Image
}

interface Morpho {
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

interface Monkey {
  /** 在哪一侧的墙头（±1）、顺着墙的本地 a，要跑到哪，还歇多久（秒） */
  readonly side: number
  a: number
  to: number
  rest: number
  readonly img: Phaser.GameObjects.Image
}

/** 一根垂下来的藤：挂在 (x, y)（地图像素）的上空，从离地 top 米垂到离地 low 米，晃的相位 */
interface Vine {
  readonly x: number
  readonly y: number
  readonly top: number
  readonly low: number
  readonly phase: number
}

/**
 * 神庙：地面与树冠是开局在后台线程画好的贴图——长满青苔的石板前庭、台阶金字塔、嵌着兽头的墙、四周的丛林。机关是活的：压板复位好时板面凸起、符号泛着一点金光，
 * 踩下去沉进槽里；要发动的机关在地上罩一层闪着的暖红；兽头的眼睛亮起来、喷出飞镖，石刺从孔里弹起，滚石从金字塔的斜槽口滚下来碾过石槽，翻板翻开露出坑底的竹签。
 * 正午的光从树冠的缝里斜照下来；藤蔓从树上与墙头垂下来晃着，墙头蹲着猴子，金刚鹦鹉不时飞过，闪蝶在林缘飞
 */
export class TempleView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private plan?: TemplePlan
  private painter?: TemplePainter
  private fx: TrapFx[] = []
  private darts: Phaser.GameObjects.Image[] = []
  private warn?: Phaser.GameObjects.Graphics
  private vineGfx?: Phaser.GameObjects.Graphics
  private shadows?: Phaser.GameObjects.Graphics
  private dust?: Phaser.GameObjects.Particles.ParticleEmitter
  private beams: Beam[] = []
  private glints: { img: Phaser.GameObjects.Image; phase: number }[] = []
  private macaws: Macaw[] = []
  private morphos: Morpho[] = []
  private monkeys: Monkey[] = []
  private vines: Vine[] = []
  private macawAt = 0
  private howlAt = 0
  private falls = 0
  private keys: string[] = []

  private planOf(v: ViewCtx): TemplePlan {
    if (!this.plan) this.plan = templePlanFor(v.def.temple!, v.run.decorSeed)
    return this.plan
  }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const p = this.planOf(v)
    return { w: FRAME.w, h: FRAME.h, origin: { x: p.start.x * UNIT, y: p.start.y * UNIT } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-2)))
    const scene = v.scene
    const once = (key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): void => {
      if (!scene.textures.exists(key)) canvasTexture(scene, key, w, h, draw)
    }
    once(DART_KEY, 48, 12, (ctx) => drawDart(ctx, 48, 12))
    once(GLOW_KEY, 64, 64, (ctx) => drawGlow(ctx, 64))
    once(BEAM_KEY, 64, 256, (ctx) => drawBeam(ctx, 64, 256))
    once(GLINT_KEY, 32, 32, (ctx) => drawGlint(ctx, 32))
    once(DUST_KEY, 32, 32, (ctx) => drawPuff(ctx, 32))
    once(MACAW_KEY, 96, 96, (ctx) => drawMacaw(ctx, 96, 96))
    once(MORPHO_KEY, 32, 32, (ctx) => drawMorpho(ctx, 32))
    once(MONKEY_KEY, 48, 48, (ctx) => drawMonkey(ctx, 48))
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  /** 地上的小草与落叶只落在石板上，不落进机关与它的压板 */
  decor(v: ViewCtx, atlas: EcsAtlas): void {
    const plan = this.planOf(v)
    const cfg = v.def.temple!
    const rng = new Rng(v.run.decorSeed)
    const L: Local = { a: 0, b: 0 }
    for (const d of rollDecor(v.def.decor, () => rng.next(), FRAME_U, FRAME_U)) {
      const x = d.xU * UNIT
      const y = d.yU * UNIT
      if (roomAt(plan.basin, x, y) < (d.sizeU / 2 + 0.2) * UNIT) continue
      toLocal(plan.frame, d.xU, d.yU, L)
      if (plan.traps.some((t) => onTrap(cfg, plan, t, L.a, L.b, 0.4))) continue
      v.decor.push(decorSprite(atlas, d.emoji, x, y, d.sizeU * UNIT, d.rotation * 0.4, d.alpha))
    }
  }

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const plan = this.planOf(v)
    const cfg = v.def.temple!
    const scene = v.scene
    const sc: PaintScene = { cfg, plan }
    const sizes: Record<PaintLayer, { w: number; h: number }> = { ground: textureSize('ground'), canopy: textureSize('canopy') }
    const tex: Record<PaintLayer, Phaser.Textures.CanvasTexture> = {
      ground: canvasTexture(scene, GROUND_KEY, sizes.ground.w, sizes.ground.h),
      canopy: canvasTexture(scene, CANOPY_KEY, sizes.canopy.w, sizes.canopy.h),
    }
    const painter = new TemplePainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
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
    this.visuals.push(scene.add.image(0, 0, GROUND_KEY).setOrigin(0, 0).setDisplaySize((sizes.ground.w / GROUND_PPU) * UNIT, (sizes.ground.h / GROUND_PPU) * UNIT).setDepth(-1))
    this.visuals.push(scene.add.image(0, 0, CANOPY_KEY).setOrigin(0, 0).setDisplaySize((sizes.canopy.w / CANOPY_PPU) * UNIT, (sizes.canopy.h / CANOPY_PPU) * UNIT).setDepth(20))
    const s = templeOf(sim)
    this.shadows = scene.add.graphics().setDepth(0.96)
    this.warn = scene.add.graphics().setDepth(0.97)
    this.vineGfx = scene.add.graphics().setDepth(19.5)
    this.visuals.push(this.shadows, this.warn, this.vineGfx)
    this.dust = scene.add.particles(0, 0, DUST_KEY, {
      lifespan: { min: 500, max: 1100 },
      speed: { min: 8, max: 40 },
      scale: { start: 0.35, end: 0.9 },
      alpha: { start: 0.55, end: 0 },
      tint: 0xb8a990,
      emitting: false,
    })
    this.dust.setDepth(9.5)
    this.visuals.push(this.dust)
    plan.traps.forEach((t, k) => this.fx.push(this.trapFx(v, cfg, plan, t, k)))
    this.glintsFor(v, plan, cfg)
    this.beamsFor(v, plan)
    this.vinesFor(plan, cfg)
    this.critters(v, plan)
    this.macawAt = 12000 + Math.random() * 10000
    this.howlAt = HOWL_MS.min
    this.falls = s.falls.length
    v.lens.screen.vignette(0.76, 0.2, 0x020804)
  }

  /** 一处机关的贴图：压板两张、符号的光，刺阵或陷坑，滚石，兽头的眼睛 */
  private trapFx(v: ViewCtx, cfg: TempleConfig, plan: TemplePlan, t: Trap, k: number): TrapFx {
    const scene = v.scene
    const f = plan.frame
    const pr = plateRect(cfg, t.plate)
    const half = cfg.plate.sizeU / 2
    const pp = patchOf(f, pr, PATCH_PPU, 0.02)
    const center = toMap(f, t.plate.a, t.plate.b)
    const own = (key: string, p: Patch, fn: (a: number, b: number, x: number, y: number, out: number[]) => void): string => {
      this.keys.push(key)
      canvasTexture(scene, key, p.w, p.h, (ctx) => paintPatch(ctx, f, p, fn))
      return key
    }
    const plate = (sunk: boolean): string =>
      own(`temple-plate-${k}-${sunk ? 'down' : 'up'}`, pp, (a, b, x, y, out) => plateShade(t.kind, (a - t.plate.a) / half, (b - t.plate.b) / half, x - center.x, y - center.y, half, sunk, x, y, out))
    const up = placePatch(scene, plate(false), pp, -0.9)
    const down = placePatch(scene, plate(true), pp, -0.9).setVisible(false)
    const glowKey = own(`temple-plate-${k}-glow`, pp, (a, b, _x, _y, out) => {
      const u = (a - t.plate.a) / half
      const w = (b - t.plate.b) / half
      if (Math.abs(u) > 1 || Math.abs(w) > 1) return
      out[0] = out[1] = out[2] = 255
      out[3] = 255 * glyphInk(t.kind, u / 0.74, w / 0.74)
    })
    const glow = placePatch(scene, glowKey, pp, -0.89).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0)
    this.visuals.push(up, down, glow)
    const fx: TrapFx = { up, down, glow, seen: 'armed', dust: 0 }
    if (t.kind === 'spikes' || t.kind === 'pit') {
      const tall = cfg.spikes.heightM * LIFT_PER_M / UNIT
      const fp = patchOf(f, t.rect, PATCH_PPU, t.kind === 'spikes' ? tall + 0.2 : 0.02)
      let key = `temple-field-${k}`
      if (t.kind === 'spikes') {
        this.keys.push(key)
        canvasTexture(scene, key, fp.w, fp.h, (ctx) => drawSpikes(ctx, f, fp, t.rect, 0.5, tall))
      } else key = own(key, fp, (a, b, x, y, out) => pitShade(t.rect, a, b, x, y, out))
      const field = placePatch(scene, key, fp, t.kind === 'spikes' ? 0.95 : -0.88).setAlpha(0)
      this.visuals.push(field)
      return { ...fx, field }
    }
    if (t.kind === 'darts') {
      const eyes = [-1, 1].map((side) => {
        const p = this.eyeAt(cfg, plan, t, side)
        return scene.add.image(p.x * UNIT, p.y * UNIT, GLOW_KEY).setDepth(1.2).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff6a2a).setDisplaySize(0.6 * UNIT, 0.6 * UNIT).setAlpha(0)
      })
      this.visuals.push(...eyes)
      return { ...fx, eyes }
    }
    const key = `temple-boulder-${k}`
    this.keys.push(key)
    const btex = canvasTexture(scene, key, BOULDER_PX, BOULDER_PX)
    const data = btex.getContext().createImageData(BOULDER_PX, BOULDER_PX)
    const R = cfg.boulder.radiusU
    const img = scene.add.image(0, 0, key).setDisplaySize(R * 2 * UNIT, R * 2 * UNIT).setDepth(9)
    const shadow = scene.add.image(0, 0, GLOW_KEY).setTint(0x000000).setDisplaySize(R * 2.3 * UNIT, R * 1.8 * UNIT).setDepth(0.96)
    this.visuals.push(img, shadow)
    return { ...fx, boulder: { tex: btex, img, shadow, data, drawn: NaN } }
  }

  /** 兽头的一只眼睛在地图上的哪里（格） */
  private eyeAt(cfg: TempleConfig, plan: TemplePlan, t: DartTrap, side: number): Point {
    const u = 0.36 * cfg.walls.snoutU
    const w = HEAD_HALF_U * (1 - 0.32 * smooth(0.25, 1, 0.36))
    return toMap(plan.frame, t.a + side * 0.4 * w, t.side * (plan.court.half - u))
  }

  /** 散落在祭坛旁的金色祭器一闪一闪：按画地面时的同一份数据找位置 */
  private glintsFor(v: ViewCtx, plan: TemplePlan, cfg: TempleConfig): void {
    for (const q of prepare({ cfg, plan }).gold) {
      const p = toMap(plan.frame, q.a, q.b)
      const img = v.scene.add.image(p.x * UNIT, p.y * UNIT, GLINT_KEY).setDepth(1.1).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff1b0).setAlpha(0)
      this.visuals.push(img)
      this.glints.push({ img, phase: Math.random() * 10 })
    }
  }

  /** 光柱：落在前庭边上、林缘树冠下的几处，顺着背光的方向斜着拖开 */
  private beamsFor(v: ViewCtx, plan: TemplePlan): void {
    const rng = new Rng(plan.seed ^ 0x6ea3)
    const c = plan.court
    const ang = Math.atan2(AWAY.y, AWAY.x)
    for (let i = 0, tries = 0; i < BEAMS && tries < 200; tries++) {
      const b = (rng.next() * 2 - 1) * (c.half + 1)
      const a = -c.back + rng.next() * (c.back + c.front - 2)
      const edge = Math.min(c.half - Math.abs(b), a + c.back)
      if (edge > 3 || edge < -1.5) continue
      const p = toMap(plan.frame, a, b)
      const len = BEAM_LEN_U * (0.8 + 0.4 * rng.next())
      const img = v.scene.add
        .image(p.x * UNIT - AWAY.x * len * 0.35 * UNIT, p.y * UNIT - AWAY.y * len * 0.35 * UNIT, BEAM_KEY)
        .setDepth(19)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xfff2c8)
        .setRotation(ang - Math.PI / 2)
        .setDisplaySize(BEAM_W_U * UNIT * (0.7 + 0.6 * rng.next()), len * UNIT)
        .setAlpha(0)
      this.visuals.push(img)
      this.beams.push({ img, phase: rng.next() * 10, base: 0.06 + 0.06 * rng.next() })
      i++
    }
  }

  /** 藤蔓：藤蔓出怪口那几处各垂一根，墙头与林缘再垂几根 */
  private vinesFor(plan: TemplePlan, cfg: TempleConfig): void {
    const rng = new Rng(plan.seed ^ 0x51e3)
    for (const m of plan.marks.vine) this.vines.push({ x: m.x, y: m.y, top: 7, low: 1.6 + rng.next() * 0.6, phase: rng.next() * 10 })
    const c = plan.court
    for (let i = 0; i < 10; i++) {
      const side = rng.next() < 0.5 ? -1 : 1
      const onWall = i < 5
      const a = onWall ? -c.back + rng.next() * (c.back + c.front - 3) : -c.back - 0.4 + rng.next() * 0.6
      const b = onWall ? side * (c.half + 0.3) : (rng.next() * 2 - 1) * (c.half - 1)
      const p = toMap(plan.frame, a, b)
      this.vines.push({ x: p.x * UNIT, y: p.y * UNIT, top: onWall ? cfg.walls.heightM : 7, low: onWall ? 0.8 + rng.next() * 1.4 : 2 + rng.next() * 2, phase: rng.next() * 10 })
    }
  }

  /** 墙头的猴子、林缘的闪蝶 */
  private critters(v: ViewCtx, plan: TemplePlan): void {
    const scene = v.scene
    const rng = new Rng(plan.seed ^ 0x3c7a)
    const c = plan.court
    for (let i = 0; i < MONKEYS; i++) {
      const side = i % 2 === 0 ? -1 : 1
      const a = -c.back + 1 + rng.next() * (c.back + c.front - 3)
      const img = scene.add.image(0, 0, MONKEY_KEY).setDepth(19.2).setDisplaySize(MONKEY_U * UNIT, MONKEY_U * UNIT)
      this.visuals.push(img)
      this.monkeys.push({ side, a, to: a, rest: 2 + rng.next() * 6, img })
    }
    for (let i = 0; i < MORPHOS; i++) {
      const b = (rng.next() * 2 - 1) * (c.half - 2)
      const a = -c.back + 1.5 + rng.next() * 3
      const p = toMap(plan.frame, a, b)
      const img = scene.add.image(p.x * UNIT, p.y * UNIT, MORPHO_KEY).setDepth(21).setDisplaySize(MORPHO_U * UNIT, MORPHO_U * UNIT)
      this.visuals.push(img)
      this.morphos.push({ x: p.x, y: p.y, vx: 0, vy: 0, tx: p.x, ty: p.y, hx: p.x, hy: p.y, flap: rng.next() * 10, img })
    }
  }

  step(v: ViewCtx, sim: Sim, delta: number): void {
    const plan = this.plan
    const s = sim.worldState.temple
    if (!plan || !s || !this.warn) return
    const cfg = v.def.temple!
    const dt = Math.min(delta, 50) / 1000
    const now = sim.elapsedMs
    this.shadows!.clear()
    this.warn.clear()
    plan.traps.forEach((t, k) => this.stepTrap(v, cfg, plan, s, t, k, now))
    this.stepDarts(v, cfg, plan, s)
    this.stepFalls(v, s)
    for (const g of this.glints) {
      const tw = Math.max(0, Math.sin(now / 900 + g.phase * 3)) ** 8
      g.img.setAlpha(tw * 0.9).setDisplaySize(0.5 * UNIT * (0.6 + tw), 0.5 * UNIT * (0.6 + tw)).setRotation(now / 3000 + g.phase)
    }
    for (const b of this.beams) b.img.setAlpha(b.base * (0.75 + 0.25 * Math.sin(now / 2300 + b.phase)))
    this.stepVines(now)
    this.stepCritters(v, sim, plan, cfg, dt, now)
  }

  /** 一处机关：压板凸起或沉下、符号的光，预警的红，发动时的样子；每进一步响一声 */
  private stepTrap(v: ViewCtx, cfg: TempleConfig, plan: TemplePlan, s: TempleState, t: Trap, k: number, now: number): void {
    const fx = this.fx[k]!
    const run = s.runs[k]!
    const age = now - run.at
    const phase = run.phase
    const armed = phase === 'armed'
    const primed = phase === 'primed'
    fx.up.setVisible(armed)
    fx.down.setVisible(!armed)
    const pulse = 0.5 + 0.5 * Math.sin(now / 520 + k)
    fx.glow.setTint(primed ? WARN : 0xffd27a).setAlpha(armed ? 0.14 + 0.14 * pulse : primed ? 0.8 : 0)
    if (phase !== fx.seen) {
      this.sound(v, plan, t, phase)
      fx.seen = phase
      fx.dust = 0
    }
    const blink = 0.18 + 0.2 * Math.abs(Math.sin(now / 90))
    const f = plan.frame
    const band = (r: Rect, alpha: number): void => {
      const pts = [toMap(f, r.a0, r.b0), toMap(f, r.a1, r.b0), toMap(f, r.a1, r.b1), toMap(f, r.a0, r.b1)]
      const g = this.warn!
      g.fillStyle(WARN, alpha * 0.55)
      g.beginPath()
      g.moveTo(pts[0]!.x * UNIT, pts[0]!.y * UNIT)
      for (const p of pts.slice(1)) g.lineTo(p.x * UNIT, p.y * UNIT)
      g.closePath()
      g.fillPath()
      g.lineStyle(0.07 * UNIT, WARN, Math.min(1, alpha * 2.2))
      g.strokePath()
    }
    const c = plan.court
    if (t.kind === 'darts') {
      if (primed) band({ a0: t.a - cfg.darts.laneU / 2, a1: t.a + cfg.darts.laneU / 2, b0: -c.half, b1: c.half }, blink)
      const eye = primed ? smooth(0, cfg.darts.primeMs, age) : phase === 'firing' ? 1 - smooth(0, 900, age) : 0
      for (const e of fx.eyes!) e.setAlpha(eye * (0.75 + 0.25 * Math.sin(now / 40)))
      if (phase === 'firing' && fx.dust < 1) {
        fx.dust = 1
        const m = mouthOf(cfg, plan, t)
        const p = toMap(f, m.a, m.b)
        this.puff(p.x, p.y, 6)
      }
      return
    }
    if (t.kind === 'spikes') {
      if (primed) {
        band(t.rect, blink)
        // 孔里冒灰：弹起前石板底下咔咔作响
        if (fx.dust < Math.floor(age / 110)) {
          fx.dust++
          const p = toMap(f, t.rect.a0 + Math.random() * (t.rect.a1 - t.rect.a0), t.rect.b0 + Math.random() * (t.rect.b1 - t.rect.b0))
          this.puff(p.x, p.y, 2)
        }
      }
      fx.field!.setAlpha(phase === 'firing' ? Math.min(smooth(0, 110, age), 1 - smooth(cfg.spikes.upMs - 220, cfg.spikes.upMs, age)) : 0)
      return
    }
    if (t.kind === 'pit') {
      if (primed) band(t.rect, blink)
      fx.field!.setAlpha(phase === 'firing' ? Math.min(smooth(0, 160, age), 1 - smooth(cfg.pit.openMs - 260, cfg.pit.openMs, age)) : 0)
      if (phase === 'firing' && fx.dust < 1) {
        fx.dust = 1
        for (const q of [0.2, 0.5, 0.8]) {
          const p = toMap(f, t.rect.a0 + (t.rect.a1 - t.rect.a0) * q, (t.rect.b0 + t.rect.b1) / 2)
          this.puff(p.x, p.y, 3)
        }
      }
      return
    }
    if (primed) band({ a0: -c.back - c.jungle - 2, a1: c.front, b0: t.b - cfg.boulder.grooveU / 2, b1: t.b + cfg.boulder.grooveU / 2 }, blink * 0.8)
    this.stepBoulder(cfg, plan, t, phase, age, run.roll, fx, now)
  }

  /**
   * 滚石：复位好时停在金字塔上的斜槽口，踩下去后在槽口晃、往下掉碎石，接着顺斜槽滚下来、沿石槽碾过前庭滚进丛林；
   * 复位快完时新的一块从上面放下来。按它脚下的高抬起来画，影子落在背光的那一边
   */
  private stepBoulder(cfg: TempleConfig, plan: TemplePlan, t: BoulderTrap, phase: TrapPhase, age: number, roll: number, fx: TrapFx, now: number): void {
    const bo = fx.boulder!
    const c = plan.court
    const R = cfg.boulder.radiusU
    const rest = t.top + 0.45
    let a = rest
    let alpha = 1
    let drop = 0
    if (phase === 'firing') a = roll
    else if (phase === 'rearm') {
      const k = age / cfg.boulder.rearmMs
      alpha = smooth(1 - LOWER_FRAC, 1 - LOWER_FRAC * 0.4, k)
      drop = (1 - smooth(1 - LOWER_FRAC, 1, k)) * 4
    }
    const p = toMap(plan.frame, a, t.b)
    const base = a > c.front ? chuteM(cfg, c, t.top, Math.min(a, t.top)) : a > -c.back - c.jungle ? -0.4 : -0.6
    const wob = phase === 'primed' ? Math.sin(now / 55) * 0.05 : 0
    // 滚过的角度：每滚过一格转 1/R 弧度；滚动轴横着石槽
    const spin = (rest - a) / R
    if (spin !== bo.drawn) {
      drawBoulder(bo.data, spin, Math.atan2(plan.frame.ty, plan.frame.tx))
      bo.tex.getContext().putImageData(bo.data, 0, 0)
      upload(bo.tex)
      bo.drawn = spin
    }
    // 滚进丛林以后被树冠遮住，渐渐看不见
    const gone = smooth(-c.back - c.jungle - 1, -c.back - c.jungle - 4, a)
    bo.img.setPosition(p.x * UNIT + wob * UNIT, p.y * UNIT - (base + R * cfg.meterPerU + drop) * LIFT_PER_M).setAlpha(alpha * (1 - gone))
    const off = (0.35 + Math.max(0, base) * 0.12) * UNIT
    bo.shadow.setPosition(p.x * UNIT + AWAY.x * off, p.y * UNIT + AWAY.y * off - base * LIFT_PER_M).setAlpha(0.5 * alpha * (1 - gone) * (1 - smooth(0, 4, drop)))
    if (phase === 'primed' && fx.dust < Math.floor(age / 200)) {
      fx.dust++
      this.puff(p.x + (Math.random() - 0.5) * R, p.y + (Math.random() - 0.5) * R, 2)
    }
    if (phase === 'firing' && a < c.front && Math.random() < 0.5) {
      const back = toMap(plan.frame, a + R * 0.8, t.b + (Math.random() - 0.5) * R)
      this.puff(back.x, back.y, 1)
    }
  }

  /** 机关每进一步的声音：踩下去咔哒一声，发动时各响各的，复位时咚的一声 */
  private sound(v: ViewCtx, plan: TemplePlan, t: Trap, phase: TrapPhase): void {
    const p = toMap(plan.frame, t.plate.a, t.plate.b)
    if (!v.lens.screen.sees(p.x * UNIT, p.y * UNIT, 10 * UNIT)) return
    if (phase === 'primed') {
      playSfx('latch')
      if (t.kind === 'boulder') playSfx('rumble')
    } else if (phase === 'firing') {
      if (t.kind === 'darts') playSfx('darts')
      else if (t.kind === 'spikes') playSfx('spikes')
      else if (t.kind === 'boulder') playSfx('grind')
      else playSfx('trapdoor')
    } else if (phase === 'armed') playSfx('clunk')
  }

  /** 飞镖：按规则里的位置画，飞在离地 heightM 的高度；钉在墙上的停在那 */
  private stepDarts(v: ViewCtx, cfg: TempleConfig, plan: TemplePlan, s: TempleState): void {
    const list = s.darts
    while (this.darts.length < list.length) {
      const img = v.scene.add.image(0, 0, DART_KEY).setDepth(9.2).setDisplaySize(0.62 * UNIT, 0.16 * UNIT)
      this.visuals.push(img)
      this.darts.push(img)
    }
    const f = plan.frame
    const lift = cfg.darts.heightM * LIFT_PER_M
    for (let i = 0; i < this.darts.length; i++) {
      const img = this.darts[i]!
      const d = list[i]
      if (!d) {
        img.setVisible(false)
        continue
      }
      const p = toMap(f, d.a, d.b)
      img
        .setVisible(true)
        .setPosition(p.x * UNIT, p.y * UNIT - lift)
        .setRotation(Math.atan2(f.ty * d.dir, f.tx * d.dir))
    }
  }

  /** 掉进陷坑的身体：坑口扬一团灰，咚的一声 */
  private stepFalls(v: ViewCtx, s: TempleState): void {
    if (s.falls.length === this.falls) return
    for (let i = Math.min(this.falls, s.falls.length); i < s.falls.length; i++) {
      const q = s.falls[i]!
      this.puff(q.x / UNIT, q.y / UNIT, 5)
      if (v.lens.screen.sees(q.x, q.y)) playSfx('thud')
    }
    this.falls = s.falls.length
  }

  /** 在 (x, y) 格处扬一团灰 */
  private puff(x: number, y: number, n: number): void {
    this.dust?.emitParticleAt(x * UNIT, y * UNIT, n)
  }

  /** 藤蔓：从高处垂下来，按高抬起来画，梢头慢慢晃，一路挂着叶子 */
  private stepVines(now: number): void {
    const g = this.vineGfx!
    g.clear()
    for (const vn of this.vines) {
      const n = 10
      const sway = Math.sin(now / 1700 + vn.phase) * 0.18 * UNIT
      const pts: Point[] = []
      for (let i = 0; i <= n; i++) {
        const t = i / n
        const z = vn.top + (vn.low - vn.top) * t
        pts.push({ x: vn.x + sway * t * t + Math.sin(t * 5 + vn.phase) * 0.04 * UNIT, y: vn.y - z * LIFT_PER_M })
      }
      g.lineStyle(0.07 * UNIT, 0x2d4a22, 0.95)
      g.beginPath()
      g.moveTo(pts[0]!.x, pts[0]!.y)
      for (const p of pts.slice(1)) g.lineTo(p.x, p.y)
      g.strokePath()
      for (let i = 1; i <= n; i++) {
        const p = pts[i]!
        const side = i % 2 === 0 ? 1 : -1
        g.fillStyle(i % 3 === 0 ? 0x5f8a3a : 0x46702e, 1)
        g.fillEllipse(p.x + side * 0.1 * UNIT, p.y, 0.2 * UNIT, 0.12 * UNIT)
      }
    }
  }

  private stepCritters(v: ViewCtx, sim: Sim, plan: TemplePlan, cfg: TempleConfig, dt: number, now: number): void {
    const g = this.shadows!
    const lead = sim.leader
    const lx = Transform.x[lead]! / UNIT
    const ly = Transform.y[lead]! / UNIT
    const shx = (-SUN.x / SUN.z / cfg.meterPerU) * UNIT * 0.6
    const shy = (-SUN.y / SUN.z / cfg.meterPerU) * UNIT * 0.6
    const c = plan.court
    const f = plan.frame
    // 墙头的猴子：蹲着东张西望，隔一阵顺着墙头跑一段；队长走近就跑开
    let near = false
    for (const m of this.monkeys) {
      const b = m.side * (c.half + cfg.walls.thickU * 0.5)
      const here = toMap(f, m.a, b)
      const d = Math.hypot(here.x - lx, here.y - ly)
      near ||= d < 8
      if (d < 3 && Math.abs(m.to - m.a) < 0.1) m.to = m.a + (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 3)
      m.rest -= dt
      if (m.rest <= 0 && Math.abs(m.to - m.a) < 0.1) {
        m.rest = 4 + Math.random() * 8
        m.to = m.a + (Math.random() * 2 - 1) * 3
      }
      m.to = Math.min(c.front - 1, Math.max(-c.back - 1.5, m.to))
      const step = Math.sign(m.to - m.a) * Math.min(Math.abs(m.to - m.a), (d < 3 ? 5 : 2.2) * dt)
      m.a += step
      const p = toMap(f, m.a, b)
      const run = Math.abs(step) > 1e-4
      const face = run ? Math.atan2(f.ny * Math.sign(step), f.nx * Math.sign(step)) : Math.atan2(-f.ty * m.side, -f.tx * m.side) + Math.sin(now / 1300 + m.side) * 0.5
      const hop = run ? Math.abs(Math.sin(now / 70)) * 0.08 * UNIT : 0
      m.img.setPosition(p.x * UNIT, p.y * UNIT - cfg.walls.heightM * LIFT_PER_M - hop).setRotation(face)
    }
    if (now >= this.howlAt) {
      this.howlAt = now + HOWL_MS.min + Math.random() * (HOWL_MS.max - HOWL_MS.min)
      if (near) playSfx('howl')
    }
    // 金刚鹦鹉：隔一阵一小群从丛林飞出来掠过前庭，影子在地上跟着跑
    if (now >= this.macawAt && this.macaws.length === 0) {
      this.macawAt = now + MACAW_MS.min + Math.random() * (MACAW_MS.max - MACAW_MS.min)
      const ang = Math.random() * Math.PI * 2
      const n = 2 + Math.floor(Math.random() * 3)
      const from = { x: plan.start.x - Math.cos(ang) * 30, y: plan.start.y - Math.sin(ang) * 30 }
      for (let i = 0; i < n; i++) {
        const img = v.scene.add.image(0, 0, MACAW_KEY).setDepth(36).setDisplaySize(MACAW_U * UNIT, MACAW_U * UNIT)
        this.visuals.push(img)
        const sp = MACAW_SPEED_U * (0.92 + Math.random() * 0.16)
        this.macaws.push({ x: from.x + (Math.random() - 0.5) * 3, y: from.y + (Math.random() - 0.5) * 3, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, flap: Math.random() * 6, img })
      }
      playSfx('squawk')
    }
    this.macaws = this.macaws.filter((b) => {
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.flap += dt * 9
      if (Math.hypot(b.x - plan.start.x, b.y - plan.start.y) > 34) {
        b.img.destroy()
        this.visuals = this.visuals.filter((o) => o !== b.img)
        return false
      }
      const open = 0.55 + 0.45 * Math.abs(Math.sin(b.flap))
      b.img.setPosition(b.x * UNIT, b.y * UNIT).setRotation(Math.atan2(b.vy, b.vx)).setDisplaySize(MACAW_U * UNIT, MACAW_U * UNIT * open)
      g.fillStyle(0x000000, 0.14)
      g.fillEllipse(b.x * UNIT + shx * MACAW_ALT_M, b.y * UNIT + shy * MACAW_ALT_M, MACAW_U * UNIT * 0.6, MACAW_U * UNIT * 0.35 * open)
      return true
    })
    // 闪蝶：守着林缘那一片飞，有身体走近就惊起飞开
    for (const b of this.morphos) {
      let scared = false
      for (const eid of query(sim.world, [Transform, Radius])) {
        if (!Alive.v[eid] || hasComponent(sim.world, eid, Pickup) || Span.lo[eid]! > 0) continue
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
        const ang = Math.random() * Math.PI * 2
        const r = Math.random() * 2.5
        b.tx = b.hx + Math.cos(ang) * r
        b.ty = b.hy + Math.sin(ang) * r
      }
      b.flap += dt * 11
      const speed = scared ? 3 : 1
      const dx = b.tx - b.x
      const dy = b.ty - b.y
      const d = Math.hypot(dx, dy) || 1
      const jitter = Math.sin(b.flap * 0.37) * 0.9
      b.vx += ((dx / d) * speed - (dy / d) * jitter - b.vx) * Math.min(1, dt * 3)
      b.vy += ((dy / d) * speed + (dx / d) * jitter - b.vy) * Math.min(1, dt * 3)
      b.x += b.vx * dt
      b.y += b.vy * dt
      const open = 0.3 + 0.7 * Math.abs(Math.sin(b.flap))
      const alt = 0.8 + 0.3 * Math.sin(b.flap * 0.21)
      b.img.setPosition(b.x * UNIT, b.y * UNIT - alt * LIFT_PER_M).setRotation(Math.atan2(b.vy, b.vx)).setDisplaySize(MORPHO_U * UNIT * 0.7, MORPHO_U * UNIT * open)
      g.fillStyle(0x000000, 0.16)
      g.fillCircle(b.x * UNIT + shx * alt, b.y * UNIT + shy * alt, MORPHO_U * UNIT * 0.18)
    }
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    v.decor.length = 0
    this.fx = []
    this.darts = []
    this.beams = []
    this.glints = []
    this.macaws = []
    this.morphos = []
    this.monkeys = []
    this.vines = []
    this.warn = undefined
    this.vineGfx = undefined
    this.shadows = undefined
    this.dust = undefined
    for (const key of [GROUND_KEY, CANOPY_KEY, ...this.keys]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
    this.keys = []
  }
}
