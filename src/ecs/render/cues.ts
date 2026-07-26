import Phaser from 'phaser'
import type { BlastRing } from '../../types/abilityDefs'
import { emojiImage } from '../../emoji/textures'
import { backEaseOut, cubicEaseIn, cubicEaseOut } from '../ease'

// 一次性战斗特效（Cue，阵营中立）：放完即弃，与机制正交——纯逻辑侧只往队列里塞
// 「放一个什么样的特效」，绘制全在这里（GAS GameplayCue 思路：机制不依赖渲染）。
//
// 与 arcade 那份的区别，也正是这份要单独存在的理由。arcade 每放一个特效就 new 一个
// Arc/Rectangle/Graphics + 挂一条 tween：特效数 = GameObject 数 = tween 数，而且
// Phaser 的 Arc 按 iterations=0.01 铺满 ~100 个三角形（带描边约 300），全由它自己提交。
//
// 这里走 ECS 侧一贯的做法，与 EcsSpriteBatch 同构：
//   · 特效是**纯数据**（定长平行数组），没有任何一个 GameObject
//   · 画的活儿归少数几个 EcsShapeBatch —— 光秃秃的 GameObject，只为在显示列表里
//     占一个 depth，renderWebGL 里把本带全部特效的三角形一次性提交给核心的
//     BatchHandlerTriFlat（与 EcsSpriteBatch 提交四边形给 BatchHandlerQuad 同理）
//   · 三角化自己做，按半径自适应取 12–48 段，比 Phaser 的定额 100 段省一个数量级
//   · 动画由 step(fxMs) 自己推进，不挂 tween；时钟取 sim.fxMs（真实帧长的纯视觉钟，
//     过场冻结期照旧推进），故特效不受时停拖慢、冻结期也能自然收尾
//
// 两个例外仍是 GameObject：💥 爆裂是图集贴图不是形状（走不了三角批），全屏闪是
// 单个定屏矩形（批不批都一样）。合计 25 个，恒定不随特效密度增长。
//
// 缓动与 Phaser 同名缓动同参（见 ../ease），观感与旧实现一致。

const { getTintAppendFloatAlpha } = Phaser.Renderer.WebGL.Utils

/** 扩散淡出的圆：填充圆（可选描边），从 fromScale 缩放到 toScale 同时淡出。
 * 命中白闪、冲击环、治疗/集结/冻结脉冲共用此一处——各自传颜色/尺度/时长/深度。 */
export interface CircleCue {
  readonly fill: number
  readonly fillAlpha: number
  /** 描边色；省略即无描边（纯填充闪光） */
  readonly stroke?: number
  readonly lineWidth?: number
  readonly lineAlpha?: number
  readonly fromScale: number
  readonly toScale: number
  readonly durationMs: number
  readonly depth: number
}

// 容量 = 同屏并发上限，超出即按环形下标顶掉最老的一个（顶掉的是放了最久、
// 最接近淡完的那个，肉眼基本看不出）。纯数据，一个槽位只占几个数字
const CIRCLES = 64
const BEAMS = 16
const BOLTS = 16
const SLASHES = 16
const BOOMS = 24
/** 单条闪电的折点上限（超出截断；连锁传导实际只有三四个点） */
const BOLT_PTS = 8

const BOOM_MS = 340
const BEAM_MS = 200
const BOLT_MS = 200
const SLASH_MS = 220

/** 空闲槽位标记（born 存的是 fxMs，恒 ≥ 0） */
const FREE = -1

/** 批绘的深度分带：本带只画 depth ∈ [zMin, zMax) 的特效。
 * 分带是必需的——一个批绘对象只有一个 depth，它画的东西全落在那一层，而特效要与
 * 精灵带（7、8）和血条（11）前后穿插。三条带覆盖整个实数轴，不会有特效被静默丢掉 */
const BANDS: readonly { depth: number; zMin: number; zMax: number }[] = [
  { depth: 7, zMin: -Infinity, zMax: 8 }, // 冲击环、光束外层
  { depth: 8, zMin: 8, zMax: 9 }, // 光束白芯、部分圆
  { depth: 14, zMin: 9, zMax: Infinity }, // 闪电、斩击、高层圆
]

/** 一帧一带的三角形暂存：plain array 复用，稳态零分配 */
interface Scratch {
  v: number[]
  c: number[]
  i: number[]
}

type Matrix = Phaser.GameObjects.Components.TransformMatrix

/** 追加一个三角形（顶点经相机矩阵变换到屏幕空间，与 FillTri 的做法一致） */
function tri(
  o: Scratch, m: Matrix,
  x0: number, y0: number, x1: number, y1: number, x2: number, y2: number,
  color: number,
): void {
  const base = o.c.length
  o.v.push(m.getX(x0, y0), m.getY(x0, y0), m.getX(x1, y1), m.getY(x1, y1), m.getX(x2, y2), m.getY(x2, y2))
  o.c.push(color, color, color)
  o.i.push(base, base + 1, base + 2)
}

/** 四边形 → 两个三角形（顶点须按 TL, BL, BR, TR 顺时针或逆时针连续绕） */
function quad(
  o: Scratch, m: Matrix,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number,
  color: number,
): void {
  tri(o, m, ax, ay, bx, by, cx, cy, color)
  tri(o, m, ax, ay, cx, cy, dx, dy, color)
}

/** 圆按屏幕半径自适应取段数：太少会出多边形棱角，太多是白给的三角形 */
function segsFor(radius: number): number {
  return Math.max(12, Math.min(48, Math.ceil(radius / 3)))
}

/** 填充圆：以圆心为轴的三角扇 */
function fan(o: Scratch, m: Matrix, cx: number, cy: number, r: number, color: number): void {
  const n = segsFor(r)
  const d = (Math.PI * 2) / n
  let px = cx + r
  let py = cy
  for (let k = 1; k <= n; k++) {
    const a = k * d
    const nx = cx + Math.cos(a) * r
    const ny = cy + Math.sin(a) * r
    tri(o, m, cx, cy, px, py, nx, ny, color)
    px = nx
    py = ny
  }
}

/** 圆环（描边）：内外两圈之间铺一圈四边形。a0/a1 给定即只铺该扇段（斩击弧光用）。
 * 与 CueLayer.ring 不同名以免混淆——那个是投放冲击环，这个是三角化 */
function ringStrip(
  o: Scratch, m: Matrix,
  cx: number, cy: number, r: number, width: number, color: number,
  a0 = 0, a1 = Math.PI * 2,
): void {
  const ri = r - width / 2
  const ro = r + width / 2
  const span = a1 - a0
  const n = Math.max(6, Math.ceil(segsFor(r) * (Math.abs(span) / (Math.PI * 2))))
  const d = span / n
  for (let k = 0; k < n; k++) {
    const a = a0 + k * d
    const b = a0 + (k + 1) * d
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const cb = Math.cos(b)
    const sb = Math.sin(b)
    quad(
      o, m,
      cx + ca * ri, cy + sa * ri,
      cx + ca * ro, cy + sa * ro,
      cx + cb * ro, cy + sb * ro,
      cx + cb * ri, cy + sb * ri,
      color,
    )
  }
}

/** 有向线段加粗成四边形（闪电每一截）。转角处不做接头——闪电本就锯齿状，看不出 */
function segment(
  o: Scratch, m: Matrix,
  x0: number, y0: number, x1: number, y1: number, width: number, color: number,
): void {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * (width / 2)
  const ny = (dx / len) * (width / 2)
  quad(o, m, x0 + nx, y0 + ny, x0 - nx, y0 - ny, x1 - nx, y1 - ny, x1 + nx, y1 + ny, color)
}

export class CueLayer {
  // ── 圆（含冲击环）：纯数据 ──
  private readonly cBorn = new Float64Array(CIRCLES).fill(FREE)
  private readonly cX = new Float32Array(CIRCLES)
  private readonly cY = new Float32Array(CIRCLES)
  private readonly cR = new Float32Array(CIRCLES)
  private readonly cDur = new Float32Array(CIRCLES)
  private readonly cFrom = new Float32Array(CIRCLES)
  private readonly cTo = new Float32Array(CIRCLES)
  private readonly cFill = new Int32Array(CIRCLES)
  private readonly cFillA = new Float32Array(CIRCLES)
  /** 描边色；-1 = 无描边 */
  private readonly cStroke = new Int32Array(CIRCLES)
  private readonly cLineW = new Float32Array(CIRCLES)
  private readonly cLineA = new Float32Array(CIRCLES)
  private readonly cDepth = new Float32Array(CIRCLES)
  private cAt = 0

  // ── 光束：外层色带（depth 7）+ 白芯（depth 8）──
  private readonly bBorn = new Float64Array(BEAMS).fill(FREE)
  private readonly bX = new Float32Array(BEAMS)
  private readonly bY = new Float32Array(BEAMS)
  private readonly bAngle = new Float32Array(BEAMS)
  private readonly bLen = new Float32Array(BEAMS)
  private readonly bRadius = new Float32Array(BEAMS)
  private readonly bColor = new Int32Array(BEAMS)
  private bAt = 0

  // ── 闪电：折点存扁平坐标，每槽定长 ──
  private readonly lBorn = new Float64Array(BOLTS).fill(FREE)
  private readonly lPts = new Float32Array(BOLTS * BOLT_PTS * 2)
  private readonly lCount = new Int32Array(BOLTS)
  private readonly lColor = new Int32Array(BOLTS)
  private lAt = 0

  // ── 斩击弧光 ──
  private readonly sBorn = new Float64Array(SLASHES).fill(FREE)
  private readonly sX = new Float32Array(SLASHES)
  private readonly sY = new Float32Array(SLASHES)
  private readonly sAngle = new Float32Array(SLASHES)
  private readonly sR = new Float32Array(SLASHES)
  private sAt = 0

  // ── 两个例外：图集贴图 / 定屏矩形，走不了三角批 ──
  private readonly booms: Phaser.GameObjects.Image[] = []
  private readonly boomBorn = new Float64Array(BOOMS).fill(FREE)
  private readonly boomFull = new Float32Array(BOOMS)
  private boomAt = 0

  private readonly flash: Phaser.GameObjects.Rectangle
  private flashBorn = FREE
  private flashDur = 0
  private flashAlpha = 0

  private readonly batches: EcsShapeBatch[] = []
  private readonly scratch: Scratch = { v: [], c: [], i: [] }

  /** 本帧视觉钟：step 每帧写入，随后的投放取它作为起点 */
  private now = 0

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < BOOMS; i++) {
      this.booms.push(emojiImage(scene, 0, 0, '1f4a5', 32).setDepth(9).setVisible(false))
    }
    this.flash = scene.add
      .rectangle(scene.scale.width / 2, scene.scale.height / 2, 6000, 6000, 0xffffff, 1)
      .setScrollFactor(0)
      .setDepth(200)
      .setVisible(false)
    for (let b = 0; b < BANDS.length; b++) this.batches.push(new EcsShapeBatch(scene, this, b))
  }

  destroy(): void {
    for (const b of this.booms) b.destroy()
    this.flash.destroy()
    for (const b of this.batches) b.destroy()
    this.batches.length = 0
  }

  /** 逐帧推进；须在本帧的投放之前调用（它同时给投放定时间起点）。fxMs = sim.fxMs。
   * 形状类只需判过期——顶点每帧由批绘对象按当前进度现算，不必在此写回 */
  step(fxMs: number): void {
    this.now = fxMs
    for (let i = 0; i < CIRCLES; i++) {
      if (this.cBorn[i] !== FREE && fxMs - this.cBorn[i]! >= this.cDur[i]!) this.cBorn[i] = FREE
    }
    for (let i = 0; i < BEAMS; i++) {
      if (this.bBorn[i] !== FREE && fxMs - this.bBorn[i]! >= BEAM_MS) this.bBorn[i] = FREE
    }
    for (let i = 0; i < BOLTS; i++) {
      if (this.lBorn[i] !== FREE && fxMs - this.lBorn[i]! >= BOLT_MS) this.lBorn[i] = FREE
    }
    for (let i = 0; i < SLASHES; i++) {
      if (this.sBorn[i] !== FREE && fxMs - this.sBorn[i]! >= SLASH_MS) this.sBorn[i] = FREE
    }

    for (let i = 0; i < BOOMS; i++) {
      if (this.boomBorn[i] === FREE) continue
      const o = this.booms[i]!
      const t = (fxMs - this.boomBorn[i]!) / BOOM_MS
      if (t >= 1) {
        this.boomBorn[i] = FREE
        o.setVisible(false)
        continue
      }
      const e = backEaseOut(t)
      const full = this.boomFull[i]!
      o.setScale(full * (0.4 + 0.6 * e)).setAlpha(1 - e)
    }

    if (this.flashBorn !== FREE) {
      const t = (fxMs - this.flashBorn) / this.flashDur
      if (t >= 1) {
        this.flashBorn = FREE
        this.flash.setVisible(false)
      } else {
        this.flash.setAlpha(this.flashAlpha * (1 - t))
      }
    }
  }

  /** 把某一带的全部活动特效三角化到暂存里（批绘对象在 renderWebGL 里调） */
  buildBand(band: number, m: Matrix): Scratch {
    const o = this.scratch
    o.v.length = 0
    o.c.length = 0
    o.i.length = 0
    const { zMin, zMax } = BANDS[band]!
    const fx = this.now

    for (let k = 0; k < CIRCLES; k++) {
      const born = this.cBorn[k]!
      if (born === FREE) continue
      const d = this.cDepth[k]!
      if (d < zMin || d >= zMax) continue
      const e = cubicEaseOut((fx - born) / this.cDur[k]!)
      const s = this.cFrom[k]! + (this.cTo[k]! - this.cFrom[k]!) * e
      const r = this.cR[k]! * s
      const fade = 1 - e
      fan(o, m, this.cX[k]!, this.cY[k]!, r, getTintAppendFloatAlpha(this.cFill[k]!, this.cFillA[k]! * fade))
      const stroke = this.cStroke[k]!
      if (stroke >= 0) {
        // 描边宽度随缩放走，与旧实现整体 setScale 的表现一致
        ringStrip(o, m, this.cX[k]!, this.cY[k]!, r, this.cLineW[k]! * s, getTintAppendFloatAlpha(stroke, this.cLineA[k]! * fade))
      }
    }

    // 光束：外层色带在 7 带、白芯在 8 带，纵向收拢 + 淡出
    for (let k = 0; k < BEAMS; k++) {
      const born = this.bBorn[k]!
      if (born === FREE) continue
      const outer = zMin < 8
      const core = zMin >= 8 && zMax <= 9
      if (!outer && !core) continue
      const e = cubicEaseIn((fx - born) / BEAM_MS)
      const sy = 1 - 0.85 * e
      const half = (core ? this.bRadius[k]! * 0.35 : this.bRadius[k]!) * sy
      const color = core ? 0xffffff : this.bColor[k]!
      const alpha = (core ? 0.95 : 0.55) * (1 - e)
      const a = this.bAngle[k]!
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const x = this.bX[k]!
      const y = this.bY[k]!
      const L = this.bLen[k]!
      // 原点在左中、沿 angle 铺开：局部 (0,±half) → (L,±half)
      quad(
        o, m,
        x - sa * half, y + ca * half,
        x + sa * half, y - ca * half,
        x + ca * L + sa * half, y + sa * L - ca * half,
        x + ca * L - sa * half, y + sa * L + ca * half,
        getTintAppendFloatAlpha(color, alpha),
      )
    }

    // 闪电与斩击恒在最上一带
    if (zMax === Infinity) {
      for (let k = 0; k < BOLTS; k++) {
        const born = this.lBorn[k]!
        if (born === FREE) continue
        const color = getTintAppendFloatAlpha(this.lColor[k]!, 0.95 * (1 - (fx - born) / BOLT_MS))
        const n = this.lCount[k]!
        const base = k * BOLT_PTS * 2
        for (let p = 1; p < n; p++) {
          segment(
            o, m,
            this.lPts[base + (p - 1) * 2]!, this.lPts[base + (p - 1) * 2 + 1]!,
            this.lPts[base + p * 2]!, this.lPts[base + p * 2 + 1]!,
            3, color,
          )
        }
      }
      for (let k = 0; k < SLASHES; k++) {
        const born = this.sBorn[k]!
        if (born === FREE) continue
        const a = this.sAngle[k]!
        ringStrip(
          o, m, this.sX[k]!, this.sY[k]!, this.sR[k]!, 5,
          getTintAppendFloatAlpha(0xffffff, 0.9 * (1 - (fx - born) / SLASH_MS)),
          a - 1.1, a + 1.1,
        )
      }
    }
    return o
  }

  circle(x: number, y: number, radius: number, c: CircleCue): void {
    const i = this.cAt
    this.cAt = (this.cAt + 1) % CIRCLES
    this.cBorn[i] = this.now
    this.cX[i] = x
    this.cY[i] = y
    this.cR[i] = radius
    this.cDur[i] = c.durationMs
    this.cFrom[i] = c.fromScale
    this.cTo[i] = c.toScale
    this.cFill[i] = c.fill
    this.cFillA[i] = c.fillAlpha
    this.cStroke[i] = c.stroke ?? -1
    this.cLineW[i] = c.lineWidth ?? 2
    this.cLineA[i] = c.lineAlpha ?? 1
    this.cDepth[i] = c.depth
  }

  /** 命中环：从锚点扩张淡出的一圈（弹道机器与能力效果链共用，不各画一遍） */
  ring(x: number, y: number, radius: number, r: BlastRing): void {
    this.circle(x, y, radius, {
      fill: r.color,
      fillAlpha: r.fillAlpha,
      stroke: r.color,
      lineWidth: r.lineWidth,
      lineAlpha: r.lineAlpha,
      fromScale: 0.3,
      toScale: 1,
      durationMs: r.durMs,
      depth: 7,
    })
  }

  /** 💥 爆裂：emoji 从缩小随机微转弹出到全尺寸并淡出（轰炸命中点） */
  boom(x: number, y: number, size: number): void {
    const i = this.boomAt
    this.boomAt = (this.boomAt + 1) % BOOMS
    const b = this.booms[i]!
    b.setPosition(x, y).setDisplaySize(size, size)
    const full = b.scale
    this.boomFull[i] = full
    b.setScale(full * 0.4)
      .setRotation((Math.random() - 0.5) * 0.8)
      .setAlpha(1)
      .setVisible(true)
    this.boomBorn[i] = this.now
  }

  /** 贯穿光束：沿 angle 铺一条长 length 的双层带（外层色 + 白芯），纵向收拢淡出 */
  beam(x: number, y: number, angle: number, length: number, radius: number, color: number): void {
    const i = this.bAt
    this.bAt = (this.bAt + 1) % BEAMS
    this.bBorn[i] = this.now
    this.bX[i] = x
    this.bY[i] = y
    this.bAngle[i] = angle
    this.bLen[i] = length
    this.bRadius[i] = radius
    this.bColor[i] = color
  }

  /** 锯齿闪电折线：沿折点串每段拆几截加垂直抖动，短暂淡出（连锁传导路径）。
   * 抖动在投放时算死存进数组——每帧重算会让电弧疯狂跳动 */
  lightning(points: readonly { x: number; y: number }[], color: number): void {
    if (points.length < 2) return
    const i = this.lAt
    this.lAt = (this.lAt + 1) % BOLTS
    const base = i * BOLT_PTS * 2
    let n = 0
    const put = (x: number, y: number): void => {
      if (n >= BOLT_PTS) return
      this.lPts[base + n * 2] = x
      this.lPts[base + n * 2 + 1] = y
      n++
    }
    put(points[0]!.x, points[0]!.y)
    for (let p = 1; p < points.length; p++) {
      const a = points[p - 1]!
      const b = points[p]!
      const segs = 4
      for (let s = 1; s <= segs; s++) {
        const t = s / segs
        const nx = -(b.y - a.y)
        const ny = b.x - a.x
        const len = Math.hypot(nx, ny) || 1
        const jitter = s === segs ? 0 : (Math.random() - 0.5) * 18
        put(a.x + (b.x - a.x) * t + (nx / len) * jitter, a.y + (b.y - a.y) * t + (ny / len) * jitter)
      }
    }
    this.lCount[i] = n
    this.lColor[i] = color
    this.lBorn[i] = this.now
  }

  /** 斩击弧光：以 (x,y) 为心、朝 angle 画一段 ±1.1rad 的白弧，淡出（瞬袭背刺） */
  slash(x: number, y: number, angle: number, radius: number): void {
    const i = this.sAt
    this.sAt = (this.sAt + 1) % SLASHES
    this.sBorn[i] = this.now
    this.sX[i] = x
    this.sY[i] = y
    this.sAngle[i] = angle
    this.sR[i] = radius
  }

  /** 全屏白闪：一块盖满视口的定屏矩形淡出（天罚全域打击） */
  screenFlash(color: number, alpha: number, durationMs: number): void {
    this.flash.setFillStyle(color, 1).setAlpha(alpha).setVisible(true)
    this.flashBorn = this.now
    this.flashDur = durationMs
    this.flashAlpha = alpha
  }
}

/** 一条深度带的形状批绘：光秃秃的 GameObject，只为在显示列表里占一个 depth。
 * 与 EcsSpriteBatch 同构——那边提交四边形给 BatchHandlerQuad，这边提交三角形给
 * BatchHandlerTriFlat。注意 renderWebGL 由 RenderSteps 以裸函数方式调用，无 this
 * 绑定，状态一律走 src。 */
class EcsShapeBatch extends Phaser.GameObjects.GameObject {
  private readonly camMatrix = new Phaser.GameObjects.Components.TransformMatrix()
  // 裸 GameObject 无 BlendMode 组件，显式给正常混合，否则 setBlendMode(undefined) 报错
  blendMode = Phaser.BlendModes.NORMAL
  depth: number

  constructor(scene: Phaser.Scene, private readonly layer: CueLayer, private readonly band: number) {
    super(scene, 'EcsShapeBatch')
    this.depth = BANDS[band]!.depth
    scene.add.existing(this)
  }

  renderWebGL(
    renderer: Phaser.Renderer.WebGL.WebGLRenderer,
    src: Phaser.GameObjects.GameObject,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    const self = src as EcsShapeBatch
    const camera = drawingContext.camera
    if (!camera) return
    const node = renderer.renderNodes.getNode('BatchHandlerTriFlat') as
      | { batch: (ctx: unknown, i: number[], v: number[], c: number[], l: null) => void }
      | null
    if (!node) return
    // v4 的视图矩阵已含 scroll；实参与核心各 Transformer 一致（!useCanvas）
    const m = self.camMatrix.copyFrom(camera.getViewMatrix(!drawingContext.useCanvas))
    const o = self.layer.buildBand(self.band, m)
    if (o.i.length === 0) return
    node.batch(drawingContext, o.i, o.v, o.c, null)
  }
}
