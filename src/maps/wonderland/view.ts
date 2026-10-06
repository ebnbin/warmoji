import Phaser from 'phaser'
import { hasComponent, query } from 'bitecs'
import { UNIT } from '../../util/units'
import { GROUND_PPU } from '../../data/texel'
import { playSfx } from '../../audio/sfx'
import { canvasTexture } from '../textures'
import { FRAME } from '../frame'
import { Depth, Phys, Slot, Transform, Uid } from '../../ecs/components'
import { footY } from '../../ecs/utils/ground'
import { clearM } from '../../ecs/utils/pass'
import { UNDER_Z } from '../../ecs/render/bands'
import { WonderPainter } from './painter'
import { textureSize } from './ground'
import { LIFT_U, makeGrids, sightZ, thingsOf } from './things'
import { drawBottle, drawCake, drawGlow, drawGrin } from './sprites'
import { wonderPlanFor } from './world'
import type { PaintPiece, PaintScene, PixelRect } from './ground'
import type { Thing } from './things'
import type { WonderPlan } from './layout'
import type { Treat, WonderState } from './world'
import type { LocalLight } from '../../ecs/render/sprites'
import type { MapView, ViewCtx } from '../../ecs/views'
import type { Framing } from '../../ecs/lens'
import type { Sim } from '../../ecs/sim'
import type { Point } from '../../util/vec'

/** 方框外的底色：暮色里的蓝紫 */
const BG = 0x1b1430
const GROUND_KEY = 'wonder-ground'
const OCC_KEY = 'wonder-occ'
const CAKE_KEY = 'wonder-cake'
const BOTTLE_KEY = 'wonder-bottle'
const GRIN_KEY = 'wonder-grin'
const GLOW_KEY = 'wonder-glow'
/** 开局最多几个线程分着画；贴图按这么多像素高的条分块交给线程 */
const PAINT_THREADS = 4
const STRIP_PX = 64
/** 立着的东西那一层：被挡住的身体之上、躺着的东西之下 */
const OCC_DEPTH = 0.75
/** 地上的光：茶点脚下的光晕、预警的光圈、体型的光圈，在地面之上、立着的东西之下 */
const FLOOR_DEPTH = -0.5
/** 茶点摆在躺着的东西之上、站着的身体之下；被立着的东西挡住时挪到挡住的那一层下面 */
const TREAT_DEPTH = 2
const TREAT_HIDDEN_DEPTH = 0.6
/** 茶点的样子：多大（格），蛋糕暖金、药水冰蓝 */
const TREAT_U = 1
const CAKE_TINT = 0xffc23d
const BOTTLE_TINT = 0x62d8ff
/** 被挡住的队员四周把立着的东西掏淡多大一圈（格）、淡到多少 */
const REVEAL_U = 1.25
const HOLES = 8
/** 柴郡猫：多大（格），隐现一回多久（毫秒），露脸的那一段占几成 */
const GRIN_U = 2.2
const GRIN_MS = 26000
const GRIN_SHOW = 0.42
/** 烛火给附近的身体补的暖光：照多远（格）、最亮多少 */
const CANDLE_U = 3
const CANDLE_FILL = 0.35

/** 立着的东西那一层：贴图照常画，掏淡的几处按 uH0–uH7 给（格子坐标除以方框边长，半径，强度） */
const OCC_FRAG = `
#pragma phaserTemplate(shaderName)
#pragma phaserTemplate(extensions)
#pragma phaserTemplate(features)
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#pragma phaserTemplate(fragmentDefine)
varying vec2 outTexCoord;
#pragma phaserTemplate(outVariables)
#pragma phaserTemplate(fragmentHeader)
uniform sampler2D uTex;
uniform vec2 uSize;
uniform vec4 uH0;
uniform vec4 uH1;
uniform vec4 uH2;
uniform vec4 uH3;
uniform vec4 uH4;
uniform vec4 uH5;
uniform vec4 uH6;
uniform vec4 uH7;

float keepFor(vec2 w, vec4 h) {
  float d = length(w - h.xy);
  return mix(1.0, 0.3, h.w * (1.0 - smoothstep(h.z * 0.55, h.z, d)));
}

void main ()
{
  vec2 tc = outTexCoord;
  // 贴图被放大两倍画：自己在四个像素间插值，免得按最近点取出锯齿
  vec2 p = tc * uSize - 0.5;
  vec2 f = fract(p);
  vec2 b = (floor(p) + 0.5) / uSize;
  vec2 d = 1.0 / uSize;
  vec4 c = mix(mix(texture2D(uTex, b), texture2D(uTex, b + vec2(d.x, 0.0)), f.x), mix(texture2D(uTex, b + vec2(0.0, d.y)), texture2D(uTex, b + d), f.x), f.y);
  vec2 w = vec2(tc.x, 1.0 - tc.y);
  float k = keepFor(w, uH0);
  k = min(k, keepFor(w, uH1));
  k = min(k, keepFor(w, uH2));
  k = min(k, keepFor(w, uH3));
  k = min(k, keepFor(w, uH4));
  k = min(k, keepFor(w, uH5));
  k = min(k, keepFor(w, uH6));
  k = min(k, keepFor(w, uH7));
  gl_FragColor = c * k;
}
`

/** 把画布传上显卡并按线性插值采样：每次上传都会把过滤重设成游戏的默认值，所以上传完要重新设 */
function upload(tex: Phaser.Textures.CanvasTexture): void {
  tex.refresh()
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
}

/** 小图只画一次，之后每局都用 */
function ensureSprites(scene: Phaser.Scene): void {
  if (!scene.textures.exists(CAKE_KEY)) canvasTexture(scene, CAKE_KEY, 128, 128, (ctx) => drawCake(ctx, 128))
  if (!scene.textures.exists(BOTTLE_KEY)) canvasTexture(scene, BOTTLE_KEY, 128, 128, (ctx) => drawBottle(ctx, 128))
  if (!scene.textures.exists(GRIN_KEY)) canvasTexture(scene, GRIN_KEY, 256, 160, (ctx) => drawGrin(ctx, 256, 160))
  if (!scene.textures.exists(GLOW_KEY)) canvasTexture(scene, GLOW_KEY, 64, 64, (ctx) => drawGlow(ctx, 64))
}

/** 画面上的一份茶点：本体、脚下的光晕 */
interface TreatFx {
  readonly img: Phaser.GameObjects.Image
  readonly glow: Phaser.GameObjects.Image
  readonly phase: number
}

/** 被挪到挡住的那一层下面的身体：原来的 z 与它的 Uid */
interface Lowered {
  readonly z: number
  readonly uid: number
}

/**
 * 奇境：草坪、花坛与躺着的东西画在地面那一层，树篱、茶桌、茶具、牌篱、矮篱、门拱与蘑菇画在立着的那一层，都是开局在后台线程画好的贴图，
 * 按同一个太阳打光投影。脚落在立着的东西后面（或钻在它底下）的身体挪到那一层下面，被挡住的队员四周把那一层掏淡，看得见自己。
 * 茶点按钟点摆出来：先在地上闪一圈光，再端出蛋糕和药水，脚下一团暖金或冰蓝的光晕；变了体型的身体脚下一圈同色的光，快变回去时闪。
 * 柴郡猫的笑脸在树篱上时隐时现，盯着队长；暮色里飘着萤火
 */
export class WonderlandView implements MapView {
  private visuals: Phaser.GameObjects.GameObject[] = []
  private plan?: WonderPlan
  private painter?: WonderPainter
  private things: Thing[] = []
  private occBuckets: number[][] = []
  private readonly treats = new Map<number, TreatFx>()
  private readonly lowered = new Map<number, Lowered>()
  private readonly holes = Array.from({ length: HOLES }, () => [0, 0, 0, 0])
  private floor?: Phaser.GameObjects.Graphics
  private grin?: Phaser.GameObjects.Image
  private candles: Point[] = []
  private ready = false

  private planOf(v: ViewCtx): WonderPlan {
    if (!this.plan) this.plan = wonderPlanFor(v.def.wonderland!, v.run.decorSeed)
    return this.plan
  }

  layout(v: ViewCtx): { w: number; h: number; origin: Point } {
    const p = this.planOf(v)
    return { w: FRAME.w, h: FRAME.h, origin: { x: p.start.x * UNIT, y: p.start.y * UNIT } }
  }

  build(v: ViewCtx): void {
    this.visuals.push(v.lens.screen.cover(v.scene.add.rectangle(0, 0, 1, 1, BG).setDepth(-2)))
    ensureSprites(v.scene)
  }

  framing(): Framing {
    return { map: FRAME, edge: 'frame' }
  }

  /** 草坪上的东西都画在地面里，不另撒 emoji */
  decor(): void {}

  async onSimReady(v: ViewCtx, sim: Sim): Promise<void> {
    const st = sim.worldState.wonderland
    if (!st) return
    const scene = v.scene
    const cfg = v.def.wonderland!
    const plan = this.planOf(v)
    const sc: PaintScene = { cfg, plan }
    const size = textureSize()
    const ground = canvasTexture(scene, GROUND_KEY, size.w, size.h)
    const occ = canvasTexture(scene, OCC_KEY, size.w, size.h)
    const painter = new WonderPainter(sc, Math.max(1, Math.min(PAINT_THREADS, navigator.hardwareConcurrency - 1)))
    this.painter = painter
    const rects: PixelRect[] = []
    for (let y = 0; y < size.h; y += STRIP_PX) rects.push({ x0: 0, y0: y, x1: size.w, y1: Math.min(size.h, y + STRIP_PX) })
    // 主线程趁线程画的时候备好挡人的那几样，按列分桶，判断身体被挡住时用
    const grids = makeGrids(plan, cfg)
    this.things = thingsOf(plan, cfg, grids)
    this.bucketThings()
    await painter.paint(rects, (p: PaintPiece) => {
      const w = p.rect.x1 - p.rect.x0
      const h = p.rect.y1 - p.rect.y0
      ground.getContext().putImageData(new ImageData(p.ground, w, h), p.rect.x0, p.rect.y0)
      occ.getContext().putImageData(new ImageData(p.occ, w, h), p.rect.x0, p.rect.y0)
    })
    painter.close()
    if (this.painter !== painter) return
    this.painter = undefined
    upload(ground)
    upload(occ)
    const wpx = (size.w / GROUND_PPU) * UNIT
    const hpx = (size.h / GROUND_PPU) * UNIT
    this.visuals.push(scene.add.image(0, 0, GROUND_KEY).setOrigin(0, 0).setDisplaySize(wpx, hpx).setDepth(-1))
    const holes = this.holes
    this.visuals.push(
      scene.add
        .shader(
          {
            name: 'WonderOccluders',
            fragmentSource: OCC_FRAG,
            setupUniforms: (set: (name: string, value: unknown) => void) => {
              set('uTex', 0)
              set('uSize', [size.w, size.h])
              for (let k = 0; k < HOLES; k++) set(`uH${k}`, holes[k])
            },
          },
          0,
          0,
          wpx,
          hpx,
          [OCC_KEY],
        )
        .setOrigin(0, 0)
        .setDepth(OCC_DEPTH),
    )
    this.floor = scene.add.graphics().setDepth(FLOOR_DEPTH)
    this.visuals.push(this.floor)
    this.grin = scene.add.image(0, 0, GRIN_KEY).setDepth(21).setAlpha(0)
    this.visuals.push(this.grin)
    this.fireflies(v)
    const tb = plan.table
    this.candles = plan.items.filter((i) => i.kind === 'candle').map((i) => ({ x: (tb.horiz ? tb.x + i.u : tb.x + i.v) * UNIT, y: (tb.horiz ? tb.y + i.v : tb.y + i.u) * UNIT }))
    v.lens.screen.vignette(0.74, 0.24, 0x120a24)
    this.ready = true
    st.events.length = 0
  }

  /** 挡人的那几样按画面上的列分桶：一列一格宽 */
  private bucketThings(): void {
    const cols = Math.ceil(FRAME.w / UNIT)
    this.occBuckets = Array.from({ length: cols }, () => [])
    this.things.forEach((t, k) => {
      for (let c = Math.max(0, Math.floor(t.x0)); c <= Math.min(cols - 1, Math.floor(t.x1)); c++) this.occBuckets[c]!.push(k)
    })
  }

  /**
   * 身体此刻是不是在挡人的东西后面：脚落在画面上的那一点被一样东西盖着，而那样东西在身体前面；
   * 跨得过的东西不算，身体站在它上面。clear 是这个身体跨得过多高（米）
   */
  private hidden(x: number, fy: number, gy: number, clear: number): boolean {
    const col = this.occBuckets[Math.floor(x / UNIT)]
    if (!col) return false
    const xu = x / UNIT
    const sy = fy / UNIT
    for (const k of col) {
      const t = this.things[k]!
      if (t.over <= clear + 1e-6) continue
      if (sy < t.y0 - t.hmax * LIFT_U || sy > t.y1) continue
      const z = sightZ(t, xu, sy)
      if (z >= 0 && sy + z * LIFT_U > gy / UNIT + 0.02) return true
    }
    return false
  }

  /** 脚落在立着的东西后面的身体，连同它的 z 挪到被挡住的那一层；出来了按原样放回。被挡住的队员记下来，那一层在他们四周掏淡 */
  private behind(sim: Sim): void {
    const seen = new Set<number>()
    let n = 0
    for (const h of this.holes) h[3] = 0
    for (const eid of query(sim.world, [Phys, Transform, Depth])) {
      const x = Transform.x[eid]!
      const fy = footY(sim.world, eid)
      if (!this.hidden(x, fy, Transform.y[eid]!, hasComponent(sim.world, eid, Phys) ? clearM(eid) : 0)) continue
      seen.add(eid)
      if (Depth.z[eid]! >= UNDER_Z) {
        this.lowered.set(eid, { z: Depth.z[eid]!, uid: Uid.v[eid]! })
        Depth.z[eid] = UNDER_Z - 1000 + Depth.z[eid]!
      }
      if (hasComponent(sim.world, eid, Slot) && n < HOLES) {
        const h = this.holes[n++]!
        h[0] = x / FRAME.w
        h[1] = (Transform.y[eid]! - Transform.h[eid]! * 0.3) / FRAME.h
        h[2] = (REVEAL_U * UNIT) / FRAME.w
        h[3] = 1
      }
    }
    for (const [eid, was] of this.lowered) {
      if (seen.has(eid)) continue
      if (Uid.v[eid] === was.uid && Depth.z[eid]! < UNDER_Z) Depth.z[eid] = was.z
      this.lowered.delete(eid)
    }
  }

  /** 暮色里飘的萤火：在镜头里随处亮起来，慢慢飘、慢慢暗 */
  private fireflies(v: ViewCtx): void {
    const screen = v.lens.screen
    this.visuals.push(
      v.scene.add
        .particles(0, 0, GLOW_KEY, {
          lifespan: { min: 3200, max: 6000 },
          frequency: 260,
          speedX: { min: -14, max: 14 },
          speedY: { min: -18, max: 8 },
          scale: { min: 0.14, max: 0.3 },
          alpha: { start: 0, end: 0, ease: (t: number) => Math.sin(t * Math.PI) },
          tint: [0xfff1a8, 0xd8ff9a, 0xffd28a],
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
        .setDepth(30),
    )
  }

  /** 读走规则层记下的事：谁吃了什么就在那里响一声、地上漾开一圈光 */
  private events(v: ViewCtx, st: WonderState): void {
    for (const e of st.events) {
      if (e.kind !== 'eat' || !v.lens.screen.sees(e.x, e.y, UNIT)) continue
      playSfx(e.treat === 'cake' ? 'grow' : 'shrink')
      const tint = e.treat === 'cake' ? CAKE_TINT : BOTTLE_TINT
      const ring = v.scene.add.image(e.x, e.y, GLOW_KEY).setDepth(FLOOR_DEPTH).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(UNIT, UNIT * 0.6)
      v.scene.tweens.add({ targets: ring, displayWidth: UNIT * 4, displayHeight: UNIT * 2.4, alpha: 0, duration: 600, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() })
    }
    st.events.length = 0
  }

  /** 茶点：预警时地上一圈慢慢收拢的光、半透明的影子；摆出来以后上下轻轻浮着、脚下一团光晕；快收走时闪 */
  private drawTreats(v: ViewCtx, sim: Sim, st: WonderState): void {
    const now = sim.elapsedMs
    const g = this.floor!
    const sv = v.def.wonderland!.serve
    const live = new Set<number>()
    let fresh = false
    for (const t of st.treats) {
      live.add(t.id)
      let fx = this.treats.get(t.id)
      if (!fx) {
        fx = this.spawnTreat(v, t)
        this.treats.set(t.id, fx)
        fresh = true
      }
      const tint = t.kind === 'cake' ? CAKE_TINT : BOTTLE_TINT
      const warn = now < t.shownAt
      const s = TREAT_U * UNIT
      if (warn) {
        // 预警：一圈光从大往小收，正中一个淡淡的影子越来越实
        const k = 1 - (t.shownAt - now) / sv.warnMs
        const r = UNIT * (1.4 - 0.9 * k)
        g.lineStyle(0.06 * UNIT, tint, 0.35 + 0.5 * k)
        g.strokeEllipse(t.x, t.y, r * 2, r * 1.2)
        g.lineStyle(0.03 * UNIT, 0xffffff, 0.3 * k)
        g.strokeEllipse(t.x, t.y, r * 1.4, r * 0.84)
        fx.img.setAlpha(0.15 + 0.35 * k).setPosition(t.x, t.y - s * 0.38)
        fx.glow.setAlpha(0.25 * k)
        continue
      }
      const left = t.until - now
      const blink = left < sv.warnMs && Math.floor(now / 160) % 2 === 0 ? 0.35 : 1
      const bob = Math.sin(now / 420 + fx.phase) * 0.06 * UNIT
      fx.img.setAlpha(blink).setPosition(t.x, t.y - s * 0.42 + bob)
      fx.glow.setAlpha((0.8 + 0.2 * Math.sin(now / 300 + fx.phase)) * blink)
      g.fillStyle(0x0c0614, 0.28)
      g.fillEllipse(t.x + 0.12 * UNIT, t.y + 0.04 * UNIT, s * 0.7, s * 0.28)
      // 地上一圈一圈往外漾的光，远远就看得见那里摆着茶点
      const wave = ((now + fx.phase * 1000) % 1400) / 1400
      g.lineStyle(0.05 * UNIT, tint, 0.7 * (1 - wave) * blink)
      g.strokeEllipse(t.x, t.y, s * (0.8 + 1.2 * wave), s * (0.48 + 0.72 * wave))
    }
    for (const [id, fx] of this.treats) {
      if (live.has(id)) continue
      fx.img.destroy()
      fx.glow.destroy()
      this.treats.delete(id)
    }
    if (fresh && st.treats.some((t) => v.lens.screen.sees(t.x, t.y, UNIT * 4))) playSfx('serve')
  }

  private spawnTreat(v: ViewCtx, t: Treat): TreatFx {
    const s = TREAT_U * UNIT
    const hidden = this.hidden(t.x, t.y, t.y - 1, 0)
    const img = v.scene.add
      .image(t.x, t.y, t.kind === 'cake' ? CAKE_KEY : BOTTLE_KEY)
      .setDisplaySize(s, s)
      .setDepth(hidden ? TREAT_HIDDEN_DEPTH : TREAT_DEPTH)
    const glow = v.scene.add
      .image(t.x, t.y, GLOW_KEY)
      .setDisplaySize(s * 2.2, s * 1.3)
      .setTint(t.kind === 'cake' ? CAKE_TINT : BOTTLE_TINT)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(FLOOR_DEPTH)
    return { img, glow, phase: Math.random() * 10 }
  }

  /** 变了体型的身体脚下一圈同色的光：变大暖金、变小冰蓝，快变回去时闪；正被挤出去的一圈白 */
  private drawSizes(v: ViewCtx, sim: Sim, st: WonderState): void {
    const g = this.floor!
    const now = sim.elapsedMs
    const warnMs = v.def.wonderland!.size.warnMs
    for (const [eid, z] of st.sizes) {
      if (z.uid !== Uid.v[eid] || (z.now === 0 && !z.squeeze)) continue
      const x = Transform.x[eid]!
      const y = Transform.y[eid]!
      if (!v.lens.screen.sees(x, y, UNIT * 2)) continue
      const r = Transform.w[eid]! * 0.42
      const left = z.want === z.now ? z.until - now : 0
      const blink = z.squeeze || (left < warnMs && Math.floor(now / 140) % 2 === 0)
      const tint = z.squeeze ? 0xffffff : z.now > 0 ? CAKE_TINT : BOTTLE_TINT
      const a = blink ? 0.35 : 1
      const cy = y + r * 0.35
      g.fillStyle(tint, 0.22 * a)
      g.fillEllipse(x, cy, r * 2.3, r * 1.05)
      g.lineStyle(0.1 * UNIT, 0x1b1430, 0.5 * a)
      g.strokeEllipse(x, cy, r * 2.3, r * 1.05)
      g.lineStyle(0.06 * UNIT, tint, 0.95 * a)
      g.strokeEllipse(x, cy, r * 2.3, r * 1.05)
    }
  }

  /** 柴郡猫：在树篱上慢慢浮现、笑着盯着队长看一阵，又慢慢隐去，下一回换个地方 */
  private drawGrin(sim: Sim, plan: WonderPlan, cfg: NonNullable<ViewCtx['def']['wonderland']>): void {
    const img = this.grin
    if (!img) return
    const now = sim.elapsedMs
    const cycle = Math.floor(now / GRIN_MS)
    const t = (now % GRIN_MS) / GRIN_MS
    const shown = t < GRIN_SHOW ? Math.sin((t / GRIN_SHOW) * Math.PI) : 0
    if (shown <= 0) {
      img.setAlpha(0)
      return
    }
    // 每一回沿树篱挪一段：在兔子洞对面的那一片里转
    const c = plan.cat
    const a = Math.atan2(c.y - 24, c.x - 24) + Math.sin(cycle * 2.3) * 0.5
    const R = Math.hypot(c.x - 24, c.y - 24) + 0.9
    const x = (24 + Math.cos(a) * R) * UNIT
    const y = (24 + Math.sin(a) * R - cfg.lawn.hedgeM * LIFT_U) * UNIT
    const lx = Transform.x[sim.leader]!
    const tilt = Math.max(-0.25, Math.min(0.25, (lx - x) / (UNIT * 30)))
    img
      .setPosition(x, y + Math.sin(now / 900) * 0.08 * UNIT)
      .setDisplaySize(GRIN_U * UNIT, GRIN_U * UNIT * 0.62)
      .setRotation(tilt)
      .setAlpha(Math.min(1, shown * 1.3) * 0.92)
  }

  step(v: ViewCtx, sim: Sim, _delta: number): void {
    const st = sim.worldState.wonderland
    if (!st || !this.ready || !this.plan) return
    this.floor!.clear()
    this.behind(sim)
    this.events(v, st)
    this.drawTreats(v, sim, st)
    this.drawSizes(v, sim, st)
    this.drawGrin(sim, this.plan, v.def.wonderland!)
  }

  /** 茶桌上的烛火把附近的身体朝着它的一侧映暖 */
  lightAt(x: number, y: number, out: LocalLight): void {
    let best = 0
    for (const c of this.candles) {
      const d = Math.hypot(c.x - x, c.y - y) / UNIT
      if (d >= CANDLE_U) continue
      const k = CANDLE_FILL * (1 - d / CANDLE_U)
      if (k <= best) continue
      best = k
      const len = d * UNIT || 1
      out.fx = (c.x - x) / len
      out.fy = (c.y - y) / len
    }
    if (best <= 0) return
    out.color = 0xffb26a
    out.fill = best
  }

  resize(): void {}

  destroy(v: ViewCtx): void {
    this.painter?.close()
    this.painter = undefined
    for (const o of this.visuals) o.destroy()
    this.visuals = []
    for (const fx of this.treats.values()) {
      fx.img.destroy()
      fx.glow.destroy()
    }
    this.treats.clear()
    this.lowered.clear()
    this.floor = undefined
    this.grin = undefined
    this.ready = false
    for (const key of [GROUND_KEY, OCC_KEY]) if (v.scene.textures.exists(key)) v.scene.textures.remove(key)
  }
}
