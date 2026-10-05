import Phaser from 'phaser'
import { FRAME_U, LIFT_PER_M, UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { playSfx } from '../../audio/sfx'
import { drawSpark } from '../textures'
import { FRAME } from '../frame'
import { textureSize } from './ground'
import { NexusPainter } from './painter'
import { CITY_FRAG, encodeTiles, TILES_FRAG } from './shader'
import { drawHolo } from './holo'
import { boxDist, hallRoom, warpEnd, warpMid } from './layout'
import { HOP_CAP, nexusPlanFor } from './world'
import type { NexusState } from './world'
import type { NexusPlan, WarpSpot } from './layout'
import type { PaintScene, PixelRect } from './ground'
import type { NexusConfig } from '../../types/maps'
import type { EcsAtlas } from '../../ecs/atlas'
import type { MapView, ViewCtx } from '../../ecs/views'
import type { Framing } from '../../ecs/lens'
import type { LocalLight, SpriteCut } from '../../ecs/render/sprites'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'

const BG = 0x030712
const GROUND_KEY = 'nexus-ground'
const TILES_KEY = 'nexus-tiles'
const WARP_KEY = 'nexus-warp'
const MASK_KEY = 'nexus-mask'
const SPARK_KEY = 'nexus-spark'
/** 开局最多几个线程分着画 */
const PAINT_THREADS = 4
/** 贴图按这么多像素高的条分块交给线程 */
const STRIP_PX = 64
/** 镜头在地板上方多高，格：玻璃外的城市按它算远近 */
const CAM_U = 26
/** 每对传送门的颜色（橙、品红、黄绿）与门柱顶上的记号（圆、三角、方），色弱也分得清 */
const PAIR_COLORS = [0xff8a1c, 0xf03cff, 0x7cff3a] as const
/** 地砖被队伍踩亮是信号蓝，被敌人踩亮是信号红 */
const TEAM_GLOW = 0x2f7dff
const FOE_GLOW = 0xff3349
/** 全息像的青色与错位时的品红重影 */
const HOLO = 0x3fe0ff
const HOLO_GHOST = 0xff4fd8
/** 门柱：白色的柱身、背光一侧的灰 */
const POST_FACE = 0xf1f5f9
const POST_SHADE = 0xb6c2cf
/** 刚踩上那一脚的方框扩到四边要多久，毫秒 */
const FLASH_MS = 280
/** 扫描线：每隔多久扫一遍、一遍扫多久，毫秒 */
const SCAN_EVERY_MS = 9000
const SCAN_MS = 2600
/** 全息像隔多久错位一下、一下多久，毫秒 */
const HOLO_GLITCH_EVERY_MS = 4200
const HOLO_GLITCH_MS = 170
/** 传送门给身边的身体打的补光：多远（格）以内，最浓多少 */
const WARP_LIGHT_U = 2.6
const WARP_FILL = 0.5
/** 激光从门柱顶上多高（格）打下来 */
const BEAM_U = 5
/** 穿门时门那头冒出的错位横条：几条、留多久 */
const GLITCH_SLICES = 6
const GLITCH_MS = [120, 260] as const

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

function rgb(c: number): [number, number, number] {
  return [((c >> 16) & 0xff) / 255, ((c >> 8) & 0xff) / 255, (c & 0xff) / 255]
}

/** 整数打散成 [0, 1)：闪烁、错位这些画面上的随机 */
function noise(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number): Phaser.Textures.CanvasTexture {
  if (scene.textures.exists(key)) scene.textures.remove(key)
  return scene.textures.createCanvas(key, w, h)!
}

/** 把画布传上显卡：每次上传都会把过滤重设成游戏的默认值，所以上传完要重新设 */
function upload(tex: Phaser.Textures.CanvasTexture, filter: Phaser.Textures.FilterMode): void {
  tex.refresh()
  tex.setFilter(filter)
}

/** 一张每格一个像素的数据图：画布与它的像素 */
interface DataTex {
  readonly tex: Phaser.Textures.CanvasTexture
  readonly img: ImageData
}

function dataTexture(scene: Phaser.Scene, key: string): DataTex {
  const tex = canvasTexture(scene, key, FRAME_U, FRAME_U)
  return { tex, img: tex.getContext().createImageData(FRAME_U, FRAME_U) }
}

function push(d: DataTex): void {
  d.tex.getContext().putImageData(d.img, 0, 0)
  upload(d.tex, Phaser.Textures.FilterMode.NEAREST)
}

/** 穿门时冒出的一条错位横条，像素 */
interface Slice {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly color: number
  readonly until: number
}

/**
 * 瓷砖的掩码：只有整块都在瓷砖地面上、不挨着立柱、全息台、电梯井、也不是检修口的瓷砖才会亮
 */
function tileMask(cfg: NexusConfig, plan: NexusPlan): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(FRAME_U * FRAME_U * 4)
  const hatches = new Set(plan.hatches.map((h) => h.y * FRAME_U + h.x))
  for (let j = 0; j < FRAME_U; j++) {
    for (let i = 0; i < FRAME_U; i++) {
      const x = i + 0.5
      const y = j + 0.5
      const o = (j * FRAME_U + i) * 4
      out[o + 3] = 255
      if (hallRoom(plan.hall, x, y) < cfg.glassU + 0.5 || hatches.has(j * FRAME_U + i)) continue
      if (plan.pillars.some((q) => Math.hypot(x - q.x, y - q.y) < q.r + 0.75)) continue
      if (plan.pedestals.some((q) => Math.hypot(x - q.x, y - q.y) < q.r + 0.75)) continue
      if (plan.cores.some((c) => boxDist(c.x0, c.y0, c.x1, c.y1, x, y) < 0.75)) continue
      out[o] = 255
    }
  }
  return out
}

/** 一扇门两侧的瓷砖铺上那一对的颜色：pair 从 1 起，k 是浓度，style 0 是立着的门、2 是正在搭；箭头朝门线 */
function layWarp(out: Uint8ClampedArray, w: WarpSpot, len: number, pair: number, k: number, style: number): void {
  for (let t = 0; t < len; t++) {
    for (const s of [1, 2]) {
      const near = s === 1 ? 1 : 0.5
      const tiles =
        w.axis === 0
          ? [
              [w.x - s, w.y + t, 1],
              [w.x + s - 1, w.y + t, 2],
            ]
          : [
              [w.x + t, w.y - s, 3],
              [w.x + t, w.y + s - 1, 4],
            ]
      for (const [i, j, dir] of tiles) {
        if (i! < 0 || j! < 0 || i! >= FRAME_U || j! >= FRAME_U) continue
        const o = (j! * FRAME_U + i!) * 4
        out[o] = pair
        out[o + 1] = k * near * 255
        out[o + 2] = style * 8 + dir!
      }
    }
  }
}

/**
 * 天枢：地面是开局在后台线程画好的贴图——哑光的浅灰瓷砖、贴墙一圈半透的玻璃地面、亮的幕墙线，立柱、全息台、电梯井的顶与地上的影子；
 * 玻璃外与玻璃地面下透出夜里城市的灯海，着色器按镜头的位置分层画出远近。瓷砖按谁踩过亮起信号蓝或信号红、慢慢暗下去，刚踩上的一脚扩出一圈方框；
 * 隔一阵一道扫描线扫过地面。传送门：门线一道亮线，两头白色的门柱，中间立着一片那一对颜色的光幕，两侧的瓷砖铺着同色的箭头朝门线走；
 * 要挪走的门闪烁、错位，要挪来的地方先投出全息的虚线框，激光从上面一点点把门柱打出来。有东西穿门，门两头冒出错位的横条。
 * 全息台上悬着转动的全息像，隔一阵错一下位
 */
export class NexusView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private plan?: NexusPlan
  private cfg?: NexusConfig
  private painter?: NexusPainter
  private state?: NexusState
  private readonly u = { time: 0, camX: FRAME_U / 2, camY: FRAME_U / 2, scan: [-100, 0, 0, 0] }
  private tiles?: DataTex
  private warps?: DataTex
  private floorFx?: Phaser.GameObjects.Graphics
  private standFx?: Phaser.GameObjects.Graphics
  private airFx?: Phaser.GameObjects.Graphics
  private sparks?: Phaser.GameObjects.Particles.ParticleEmitter
  private slices: Slice[] = []
  private hopSeen = 0
  private moving: (WarpSpot | null)[] = []

  private planOf(v: ViewCtx): NexusPlan {
    if (!this.plan) this.plan = nexusPlanFor(v.def.nexus!, v.run.decorSeed)
    return this.plan
  }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const p = this.planOf(v)
    return { w: FRAME.w, h: FRAME.h, origin: { x: p.start.x * UNIT, y: p.start.y * UNIT } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-2)))
    if (!v.scene.textures.exists(SPARK_KEY)) {
      const tex = canvasTexture(v.scene, SPARK_KEY, 32, 32)
      drawSpark(tex.getContext(), 32)
      upload(tex, Phaser.Textures.FilterMode.LINEAR)
    }
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  /** 瓷砖地上不撒 emoji */
  decor(_v: ViewCtx, _atlas: EcsAtlas): void {}

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const plan = this.planOf(v)
    const cfg = v.def.nexus!
    this.cfg = cfg
    const scene = v.scene
    const sc: PaintScene = { cfg, plan }
    const size = textureSize()
    const tex = canvasTexture(scene, GROUND_KEY, size.w, size.h)
    const painter = new NexusPainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const rects: PixelRect[] = []
    for (let y = 0; y < size.h; y += STRIP_PX) rects.push({ x0: 0, y0: y, x1: size.w, y1: Math.min(size.h, y + STRIP_PX) })
    await painter.paint(rects, (p) => {
      tex.getContext().putImageData(new ImageData(p.pixels, p.rect.x1 - p.rect.x0, p.rect.y1 - p.rect.y0), p.rect.x0, p.rect.y0)
    })
    painter.close()
    if (this.painter !== painter) return
    this.painter = undefined
    upload(tex, Phaser.Textures.FilterMode.LINEAR)
    this.city(v)
    this.visuals.push(scene.add.image(0, 0, GROUND_KEY).setOrigin(0, 0).setDisplaySize((size.w / GROUND_PPU) * UNIT, (size.h / GROUND_PPU) * UNIT).setDepth(-1))
    this.floor(v, cfg, plan)
    this.dynamics(v)
    const st = sim.worldState.nexus
    this.hopSeen = st?.hopCount ?? 0
    this.moving = st ? st.warps.map((w) => w.next) : []
    v.lens.screen.vignette(0.86, 0.14, 0x061028)
  }

  /** 玻璃外的夜城：铺满方框，着色器按镜头的位置算每一层看到哪里 */
  private city(v: ViewCtx): void {
    const u = this.u
    const seed = (v.run.decorSeed % 997) + 0.5
    this.visuals.push(
      v.scene.add
        .shader(
          {
            name: 'NexusCity',
            fragmentSource: CITY_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uRect', [0, 0, FRAME_U, FRAME_U])
              set('uCam', [u.camX, u.camY, CAM_U])
              set('uTime', u.time)
              set('uSeed', seed)
            },
          },
          0,
          0,
          FRAME.w,
          FRAME.h,
        )
        .setOrigin(0, 0)
        .setDepth(-1.5),
    )
  }

  /** 会亮的瓷砖：数据图（谁踩过、门铺在哪）与掩码，着色器盖在地面贴图上 */
  private floor(v: ViewCtx, cfg: NexusConfig, plan: NexusPlan): void {
    const scene = v.scene
    this.tiles = dataTexture(scene, TILES_KEY)
    this.warps = dataTexture(scene, WARP_KEY)
    const mask = canvasTexture(scene, MASK_KEY, FRAME_U, FRAME_U)
    mask.getContext().putImageData(new ImageData(tileMask(cfg, plan), FRAME_U, FRAME_U), 0, 0)
    upload(mask, Phaser.Textures.FilterMode.NEAREST)
    push(this.tiles)
    push(this.warps)
    const u = this.u
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'NexusTiles',
            fragmentSource: TILES_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uData', 0)
              set('uWarp', 1)
              set('uMask', 2)
              set('uTime', u.time)
              set('uScan', u.scan)
              set('uTeam', rgb(TEAM_GLOW))
              set('uFoe', rgb(FOE_GLOW))
              set('uPair0', rgb(PAIR_COLORS[0]))
              set('uPair1', rgb(PAIR_COLORS[1]))
              set('uPair2', rgb(PAIR_COLORS[2]))
            },
          },
          0,
          0,
          FRAME.w,
          FRAME.h,
          [TILES_KEY, WARP_KEY, MASK_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(-0.9),
    )
  }

  /** 会动的东西：门线、门柱与光幕、全息像、激光、错位的横条与火花 */
  private dynamics(v: ViewCtx): void {
    const scene = v.scene
    this.floorFx = scene.add.graphics().setDepth(-0.8)
    this.standFx = scene.add.graphics().setDepth(2.7)
    this.airFx = scene.add.graphics().setDepth(9)
    this.sparks = scene.add
      .particles(0, 0, SPARK_KEY, {
        lifespan: { min: 220, max: 520 },
        speed: { min: 40, max: 200 },
        scale: { start: 0.42, end: 0 },
        alpha: { start: 1, end: 0 },
        emitting: false,
      })
      .setDepth(9.5)
    this.visuals.push(this.floorFx, this.standFx, this.airFx, this.sparks)
  }

  /** (x, y)（像素）在不在镜头里，边上再放宽 pad 格：只用来决定响不响 */
  private seen(v: ViewCtx, x: number, y: number, pad: number): boolean {
    return v.lens.screen.sees(x, y, pad * UNIT)
  }

  step(v: ViewCtx, sim: Sim, _delta: number): void {
    const st = sim.worldState.nexus
    const cfg = this.cfg
    if (!st || !cfg || !this.tiles || !this.warps || !this.floorFx || !this.standFx || !this.airFx) return
    this.state = st
    const now = sim.elapsedMs
    const t = sim.fxMs / 1000
    const view = v.lens.screen.view()
    this.u.time = t
    this.u.camX = (view.x + view.w / 2) / UNIT
    this.u.camY = (view.y + view.h / 2) / UNIT
    const tl = st.tiles
    encodeTiles(this.tiles.img.data, tl.team, tl.foe, tl.teamFrom, tl.foeFrom, now, cfg.tiles.fadeMs, FLASH_MS)
    push(this.tiles)
    this.layWarps(st, cfg, now)
    push(this.warps)
    this.scan(st.plan, now)
    this.floorFx.clear()
    this.standFx.clear()
    this.airFx.clear()
    this.events(v, st, cfg, sim.fxMs)
    st.warps.forEach((w, i) => {
      const color = PAIR_COLORS[i >> 1]!
      const p = w.next ? clamp01((now - w.since) / cfg.warps.warnMs) : 0
      this.gate(cfg, w.spot, i, color, w.next ? p : -1, t, now)
      if (w.next) this.preview(cfg, w.next, i, color, p, t)
    })
    this.holograms(st.plan, cfg, sim.fxMs, t)
    this.glitches(sim.fxMs)
  }

  /** 门两侧的瓷砖：立着的门铺满，要挪走的一闪一闪，要挪来的随预警一点点亮起来 */
  private layWarps(st: NexusState, cfg: NexusConfig, now: number): void {
    const out = this.warps!.img.data
    out.fill(0)
    for (let o = 3; o < out.length; o += 4) out[o] = 255
    const len = cfg.warps.lenU
    st.warps.forEach((w, i) => {
      const pair = (i >> 1) + 1
      if (!w.next) {
        layWarp(out, w.spot, len, pair, 1, 0)
        return
      }
      const p = clamp01((now - w.since) / cfg.warps.warnMs)
      layWarp(out, w.spot, len, pair, this.flicker(now, i, p), 0)
      layWarp(out, w.next, len, pair, 0.25 + 0.75 * p, 2)
    })
  }

  /** 要挪走的门亮不亮：越到最后断得越频繁，0.15 到 1 */
  private flicker(now: number, i: number, p: number): number {
    return noise(Math.floor(now / 55), i * 31 + 7) > p * 0.85 ? 1 : 0.15
  }

  /** 扫描线：隔一阵横着或竖着扫过大厅，亮度两头弱中间强 */
  private scan(plan: NexusPlan, now: number): void {
    const cycle = Math.floor(now / SCAN_EVERY_MS)
    const k = now - cycle * SCAN_EVERY_MS
    const s = this.u.scan
    if (k >= SCAN_MS) {
      s[2] = 0
      return
    }
    const f = k / SCAN_MS
    const axis = cycle % 2
    const back = Math.floor(cycle / 2) % 2 === 1
    const lo = axis === 0 ? plan.hall.y0 : plan.hall.x0
    const hi = axis === 0 ? plan.hall.y1 : plan.hall.x1
    s[0] = lo + (hi - lo) * (back ? 1 - f : f)
    s[1] = axis
    s[2] = Math.sqrt(Math.sin(Math.PI * f))
  }

  /** 穿门、门开始挪、门换过去：响一声，门两头冒错位的横条与火花；fx 是画面的时钟，毫秒 */
  private events(v: ViewCtx, st: NexusState, cfg: NexusConfig, fx: number): void {
    const len = cfg.warps.lenU
    let heard = false
    for (let k = Math.max(this.hopSeen, st.hopCount - HOP_CAP); k < st.hopCount; k++) {
      const h = st.hops[k % HOP_CAP]!
      const color = PAIR_COLORS[h.warp >> 1]!
      for (const i of [h.warp, h.warp ^ 1]) this.burst(st.warps[i]!.spot, len, color, fx, h.who === 'thing' ? 2 : GLITCH_SLICES)
      if (h.who !== 'thing' && this.seen(v, h.x, h.y, 2)) heard = true
    }
    this.hopSeen = st.hopCount
    if (heard) playSfx('warp')
    st.warps.forEach((w, i) => {
      const was = this.moving[i] ?? null
      if (w.next && !was && this.seen(v, warpMid(w.spot, len).x * UNIT, warpMid(w.spot, len).y * UNIT, 3)) playSfx('glitch')
      if (!w.next && was) {
        const color = PAIR_COLORS[i >> 1]!
        this.burst(w.spot, len, color, fx, GLITCH_SLICES * 2)
        const m = warpMid(w.spot, len)
        this.sparks?.setParticleTint(color)
        this.sparks?.explode(18, m.x * UNIT, m.y * UNIT)
        if (this.seen(v, m.x * UNIT, m.y * UNIT, 3)) playSfx('print')
      }
      this.moving[i] = w.next
    })
  }

  /** 门上冒出几条错位的横条与一把火花 */
  private burst(spot: WarpSpot, len: number, color: number, now: number, n: number): void {
    const lift = this.cfg!.warps.heightM * LIFT_PER_M
    const m = warpMid(spot, len)
    for (let k = 0; k < n; k++) {
      const along = (Math.random() - 0.5) * len * UNIT * 0.8
      const x = m.x * UNIT + (spot.axis === 1 ? along : (Math.random() - 0.5) * 0.6 * UNIT)
      const y = m.y * UNIT + (spot.axis === 0 ? along : 0) - Math.random() * lift
      this.slices.push({
        x,
        y,
        w: (0.3 + Math.random() * 0.9) * UNIT,
        h: 2 + Math.random() * 3,
        color: Math.random() < 0.35 ? 0xffffff : color,
        until: now + GLITCH_MS[0] + Math.random() * (GLITCH_MS[1] - GLITCH_MS[0]),
      })
    }
    this.sparks?.setParticleTint(color)
    this.sparks?.explode(Math.min(8, n + 2), m.x * UNIT, m.y * UNIT - lift * 0.4)
  }

  /** 错位的横条：每帧左右乱跳，到时候就没了 */
  private glitches(fx: number): void {
    const g = this.airFx!
    this.slices = this.slices.filter((s) => s.until > fx)
    for (const s of this.slices) {
      const jx = (Math.random() - 0.5) * 10
      g.fillStyle(s.color, 0.85)
      g.fillRect(s.x - s.w / 2 + jx, s.y, s.w, s.h)
    }
  }

  /**
   * 一扇立着的门：地上一道亮线、两头门柱脚下的光圈，门柱中间立着一片光幕，光一道道往上走；横门的光幕正对镜头，竖门的侧对镜头只剩一道亮线。
   * closing 不为 −1 时这扇门正要挪走（0 到 1）：一闪一闪、左右错位，越到最后断得越频繁；t 是画面的时钟（秒），now 是对局的时钟（毫秒）
   */
  private gate(cfg: NexusConfig, spot: WarpSpot, i: number, color: number, closing: number, t: number, now: number): void {
    const w = cfg.warps
    const len = w.lenU
    const post = w.postU * UNIT
    const lift = w.heightM * LIFT_PER_M
    const a = { x: spot.x * UNIT, y: spot.y * UNIT }
    const e = warpEnd(spot, len)
    const b = { x: e.x * UNIT, y: e.y * UNIT }
    const on = closing < 0 ? 1 : this.flicker(now, i, closing)
    const jitter = closing < 0 ? 0 : (noise(Math.floor(now / 40), i * 17 + 3) - 0.5) * 10 * closing
    const f = this.floorFx!
    const g = this.standFx!
    // 地上：门线一道亮线，门柱脚下的光圈
    f.fillStyle(color, 0.28 * on)
    for (const q of [a, b]) f.fillCircle(q.x, q.y, post * 2)
    f.lineStyle(0.14 * UNIT, color, 0.9 * on)
    f.lineBetween(a.x, a.y, b.x, b.y)
    f.lineStyle(0.045 * UNIT, 0xffffff, 0.95 * on)
    f.lineBetween(a.x, a.y, b.x, b.y)
    // 光幕
    for (const [dx, tint, alpha] of [
      [jitter, color, 1],
      [-jitter, 0x7ff9ff, closing < 0 ? 0 : 0.5],
    ] as const) {
      if (alpha <= 0) continue
      const k = on * alpha
      if (spot.axis === 1) {
        const x0 = a.x + post + dx
        const width = b.x - a.x - post * 2
        g.fillGradientStyle(tint, tint, tint, tint, 0.06 * k, 0.06 * k, 0.5 * k, 0.5 * k)
        g.fillRect(x0, a.y - lift, width, lift)
        for (let n = 0; n < 4; n++) {
          const h = (t * 0.55 + n / 4) % 1
          g.lineStyle(2, 0xffffff, (1 - h) * 0.7 * k)
          g.lineBetween(x0, a.y - h * lift, x0 + width, a.y - h * lift)
        }
        g.lineStyle(1.5, tint, 0.7 * k)
        g.lineBetween(x0, a.y - lift, x0 + width, a.y - lift)
      } else {
        const x = a.x + dx
        g.fillGradientStyle(tint, tint, tint, tint, 0.12 * k, 0.12 * k, 0.6 * k, 0.6 * k)
        g.fillRect(x - 0.08 * UNIT, a.y - lift + post, 0.16 * UNIT, b.y - a.y + lift - post * 2)
        g.lineStyle(2, 0xffffff, 0.85 * k)
        g.lineBetween(x, a.y - lift + post, x, b.y - post)
      }
    }
    for (const q of [a, b]) this.post(g, q.x, q.y, post, lift, color, i >> 1, on, 1)
  }

  /** 一根门柱：白的柱身、背光一侧发灰，正面一条那一对颜色的灯带，柱顶上是那一对的记号；fill 是从下往上打出来了多少 */
  private post(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, lift: number, color: number, pair: number, alpha: number, fill: number): void {
    const h = lift * fill
    g.fillStyle(POST_SHADE, alpha)
    g.fillCircle(x, y, r)
    g.fillStyle(POST_FACE, alpha)
    g.fillRect(x - r, y - h, r * 2, h)
    g.fillStyle(POST_SHADE, alpha)
    g.fillRect(x + r * 0.35, y - h, r * 0.65, h)
    g.fillStyle(color, alpha)
    g.fillRect(x - r * 0.2, y - h + r * 0.6, r * 0.4, Math.max(0, h - r * 1.2))
    if (fill < 1) return
    g.fillStyle(POST_FACE, alpha)
    g.fillCircle(x, y - h, r)
    g.lineStyle(1.5, color, alpha)
    g.strokeCircle(x, y - h, r * 0.82)
    g.fillStyle(color, alpha)
    const s = r * 0.5
    if (pair === 0) g.fillCircle(x, y - h, s * 0.8)
    else if (pair === 1) g.fillTriangle(x, y - h - s, x - s * 0.9, y - h + s * 0.6, x + s * 0.9, y - h + s * 0.6)
    else g.fillRect(x - s * 0.7, y - h - s * 0.7, s * 1.4, s * 1.4)
  }

  /** 要挪来的地方：地上虚线的门线从两头往中间搭，门柱的全息轮廓，上面打下来两道激光，一点点把门柱打出来 */
  private preview(cfg: NexusConfig, spot: WarpSpot, i: number, color: number, p: number, t: number): void {
    const w = cfg.warps
    const len = w.lenU
    const post = w.postU * UNIT
    const lift = w.heightM * LIFT_PER_M
    const a = { x: spot.x * UNIT, y: spot.y * UNIT }
    const e = warpEnd(spot, len)
    const b = { x: e.x * UNIT, y: e.y * UNIT }
    const f = this.floorFx!
    const g = this.standFx!
    const air = this.airFx!
    const flick = 0.65 + 0.35 * noise(Math.floor(t * 30), i * 13 + 1)
    // 虚线的门线：两头各搭上 p 的一半
    const dash = 0.18 * UNIT
    const total = Math.hypot(b.x - a.x, b.y - a.y)
    const ux = (b.x - a.x) / total
    const uy = (b.y - a.y) / total
    f.lineStyle(0.06 * UNIT, color, 0.7 * flick)
    for (let s = 0; s < total; s += dash * 2) {
      const s1 = Math.min(total, s + dash)
      f.lineBetween(a.x + ux * s, a.y + uy * s, a.x + ux * s1, a.y + uy * s1)
    }
    const built = (total / 2) * p
    f.lineStyle(0.1 * UNIT, color, 0.9)
    f.lineBetween(a.x, a.y, a.x + ux * built, a.y + uy * built)
    f.lineBetween(b.x, b.y, b.x - ux * built, b.y - uy * built)
    for (const q of [a, b]) {
      f.lineStyle(1.5, color, 0.8 * flick)
      f.strokeCircle(q.x, q.y, post * (2.2 - p))
      // 门柱的全息轮廓与已经打出来的那一截
      g.lineStyle(1.2, color, 0.75 * flick)
      g.strokeRect(q.x - post, q.y - lift, post * 2, lift)
      g.strokeCircle(q.x, q.y - lift, post)
      this.post(g, q.x, q.y, post, lift, color, i >> 1, 0.9, p)
      // 从上面打下来的激光，打在已经打出来的那一截顶上
      const hit = q.y - lift * p
      air.lineStyle(3, color, 0.25 * flick)
      air.lineBetween(q.x, q.y - lift - BEAM_U * UNIT, q.x, hit)
      air.lineStyle(1.2, 0xffffff, 0.85 * flick)
      air.lineBetween(q.x, q.y - lift - BEAM_U * UNIT, q.x, hit)
      air.fillStyle(0xffffff, 0.9 * flick)
      air.fillCircle(q.x, hit, 2.5 + 1.5 * flick)
      air.fillStyle(color, 0.35 * flick)
      air.fillCircle(q.x, hit, 7)
    }
  }

  /** 全息台上的像：各台错开着转，隔一阵错一下位 */
  private holograms(plan: NexusPlan, cfg: NexusConfig, fxMs: number, t: number): void {
    const g = this.airFx!
    const top = cfg.pedestals.heightM * LIFT_PER_M
    plan.pedestals.forEach((q, k) => {
      const cycle = Math.floor((fxMs + k * 1300) / HOLO_GLITCH_EVERY_MS)
      const inGlitch = (fxMs + k * 1300) % HOLO_GLITCH_EVERY_MS < HOLO_GLITCH_MS && noise(cycle, k) < 0.6
      const glitch = inGlitch ? 0.4 + 0.6 * noise(Math.floor(fxMs / 30), k + 5) : 0
      const flicker = 0.75 + 0.25 * noise(Math.floor(fxMs / 70), k + 9)
      drawHolo(g, q.holo, q.x * UNIT, q.y * UNIT, top, top + 0.35 * UNIT, q.r * UNIT * 1.05, t + q.phase, HOLO, HOLO_GHOST, glitch, flicker)
    })
  }

  /** 传送门给身边的身体打一层那一对颜色的补光，从门线那边照过来 */
  lightAt(x: number, y: number, out: LocalLight): void {
    const st = this.state
    const cfg = this.cfg
    if (!st || !cfg) return
    const len = cfg.warps.lenU
    let best = WARP_LIGHT_U
    st.warps.forEach((w, i) => {
      const s = w.spot
      const px = x / UNIT
      const py = y / UNIT
      const cx = s.axis === 0 ? s.x : Math.min(s.x + len, Math.max(s.x, px))
      const cy = s.axis === 0 ? Math.min(s.y + len, Math.max(s.y, py)) : s.y
      const d = Math.hypot(px - cx, py - cy)
      if (d >= best) return
      best = d
      const l = d || 1
      out.fx = (cx - px) / l
      out.fy = (cy - py) / l
      out.color = PAIR_COLORS[i >> 1]!
      out.fill = WARP_FILL * (1 - d / WARP_LIGHT_U)
    })
  }

  /** 正穿过门线的精灵切成两份：门这边画还没过去的那一半，另一扇门那边画已经过去的那一半 */
  cutAt(x: number, y: number, hw: number, hh: number, out: SpriteCut[]): number {
    const st = this.state
    const cfg = this.cfg
    if (!st || !cfg) return 0
    const len = cfg.warps.lenU * UNIT
    for (let i = 0; i < st.warps.length; i++) {
      const s = st.warps[i]!.spot
      const o = st.warps[i ^ 1]!.spot
      const lx = s.x * UNIT
      const ly = s.y * UNIT
      const axis = s.axis
      const across = axis === 0 ? x - lx : y - ly
      const along = axis === 0 ? y - ly : x - lx
      if (Math.abs(across) >= (axis === 0 ? hw : hh) || along <= 0 || along >= len) continue
      const side = across < 0 ? -1 : 1
      const at = axis === 0 ? lx : ly
      const a = out[0]!
      a.dx = 0
      a.dy = 0
      a.axis = axis
      a.at = at
      a.keep = side
      const b = out[1]!
      b.dx = (o.x - s.x) * UNIT
      b.dy = (o.y - s.y) * UNIT
      b.axis = axis
      b.at = at
      b.keep = side < 0 ? 1 : -1
      return 2
    }
    return 0
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    this.slices = []
    this.tiles = undefined
    this.warps = undefined
    this.floorFx = undefined
    this.standFx = undefined
    this.airFx = undefined
    this.sparks = undefined
    this.state = undefined
    for (const key of [GROUND_KEY, TILES_KEY, WARP_KEY, MASK_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
