import type Phaser from 'phaser'
import type { BlastRing } from '../../types/abilityDefs'
import { emojiImage } from '../../emoji/textures'
import { backEaseOut, cubicEaseIn, cubicEaseOut } from '../ease'

// 一次性战斗特效（Cue，阵营中立）：放完即弃，与机制正交——纯逻辑侧只往队列里塞
// 「放一个什么样的特效」，绘制全在这里（GAS GameplayCue 思路：机制不依赖渲染）。
// 持续性视觉（持有物/召唤物/光环圈）是能力生命周期状态，由各系统自管，不在此列。
//
// 与 arcade 那份的区别，也正是这份要单独存在的理由：
// arcade 每放一个特效就 new 一个 GameObject + 挂一条 Phaser tween，特效数量直接
// 等于 GameObject 数量与 tween 数量——正是自绘批量渲染要消灭的东西。这里改成
// ECS 侧一贯的做法：
//   · 每类特效一个**定长对象池**，稳态零分配；池满按环形下标顶掉最老的一个
//     （与 EcsBattleScene 的伤害飘字池同策略）
//   · 活动状态存在**平行的定长数组**（born/dur/from/to）里，不是每个特效一个对象
//   · 动画由 step(fxMs) **自己推进**，不挂 tween
// 结果：场上特效再多，GameObject 数与 tween 数都恒定为池大小。
//
// 时钟取 sim.fxMs（跑真实帧长的纯视觉钟，过场冻结期照旧推进），故特效不受时停
// 拖慢、冻结期也能自然收尾——与旧实现挂 tween 的行为一致。
// 缓动与 Phaser 同名缓动同参（见 ../ease），观感与旧实现逐帧一致。

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

// 池容量 = 同屏并发上限，超出即顶掉最老的一个。宁可取小——每个槽位都是一个常驻
// GameObject；顶掉的是已经放了最久、最接近淡完的那个，肉眼基本看不出
const CIRCLES = 48
const BOOMS = 24
const BEAMS = 12
/** 闪电与斩击共用：都是「生成一次折线/弧，此后只淡出」，几何无需逐帧重绘 */
const ARCS = 24

const BOOM_MS = 340
const BEAM_MS = 200

/** 空闲槽位标记（born 存的是 fxMs，恒 ≥ 0） */
const FREE = -1

export class CueLayer {
  private readonly circles: Phaser.GameObjects.Arc[] = []
  private readonly circleBorn = new Float64Array(CIRCLES).fill(FREE)
  private readonly circleDur = new Float32Array(CIRCLES)
  private readonly circleFrom = new Float32Array(CIRCLES)
  private readonly circleTo = new Float32Array(CIRCLES)
  private circleAt = 0

  private readonly booms: Phaser.GameObjects.Image[] = []
  private readonly boomBorn = new Float64Array(BOOMS).fill(FREE)
  /** 该槽位的满尺寸 scale：emojiImage 按 size 定的基准，逐次不同 */
  private readonly boomFull = new Float32Array(BOOMS)
  private boomAt = 0

  /** 每束光两条：外层色带 + 白芯 */
  private readonly beams: { outer: Phaser.GameObjects.Rectangle; core: Phaser.GameObjects.Rectangle }[] = []
  private readonly beamBorn = new Float64Array(BEAMS).fill(FREE)
  private beamAt = 0

  private readonly arcs: Phaser.GameObjects.Graphics[] = []
  private readonly arcBorn = new Float64Array(ARCS).fill(FREE)
  private readonly arcDur = new Float32Array(ARCS)
  private arcAt = 0

  private readonly flash: Phaser.GameObjects.Rectangle
  private flashBorn = FREE
  private flashDur = 0
  private flashAlpha = 0

  /** 本帧视觉钟：step 每帧写入，随后的投放取它作为起点 */
  private now = 0

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < CIRCLES; i++) {
      this.circles.push(scene.add.circle(0, 0, 1, 0xffffff, 1).setVisible(false))
    }
    for (let i = 0; i < BOOMS; i++) {
      this.booms.push(emojiImage(scene, 0, 0, '1f4a5', 32).setDepth(9).setVisible(false))
    }
    for (let i = 0; i < BEAMS; i++) {
      this.beams.push({
        outer: scene.add.rectangle(0, 0, 1, 1, 0xffffff, 0.55).setOrigin(0, 0.5).setDepth(7).setVisible(false),
        core: scene.add.rectangle(0, 0, 1, 1, 0xffffff, 0.95).setOrigin(0, 0.5).setDepth(8).setVisible(false),
      })
    }
    for (let i = 0; i < ARCS; i++) {
      this.arcs.push(scene.add.graphics().setDepth(14).setVisible(false))
    }
    this.flash = scene.add
      .rectangle(scene.scale.width / 2, scene.scale.height / 2, 6000, 6000, 0xffffff, 1)
      .setScrollFactor(0)
      .setDepth(200)
      .setVisible(false)
  }

  destroy(): void {
    for (const c of this.circles) c.destroy()
    for (const b of this.booms) b.destroy()
    for (const b of this.beams) {
      b.outer.destroy()
      b.core.destroy()
    }
    for (const g of this.arcs) g.destroy()
    this.flash.destroy()
  }

  /** 逐帧推进全部在放的特效；须在本帧的投放之前调用（它同时给投放定时间起点）。
   * fxMs = sim.fxMs */
  step(fxMs: number): void {
    this.now = fxMs

    for (let i = 0; i < CIRCLES; i++) {
      if (this.circleBorn[i] === FREE) continue
      const o = this.circles[i]!
      const t = (fxMs - this.circleBorn[i]!) / this.circleDur[i]!
      if (t >= 1) {
        this.circleBorn[i] = FREE
        o.setVisible(false)
        continue
      }
      const e = cubicEaseOut(t)
      o.setScale(this.circleFrom[i]! + (this.circleTo[i]! - this.circleFrom[i]!) * e).setAlpha(1 - e)
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
      // 0.4×full → full（Back.easeOut 会略微过冲，与旧 tween 一致）
      o.setScale(full * (0.4 + 0.6 * e)).setAlpha(1 - e)
    }

    for (let i = 0; i < BEAMS; i++) {
      if (this.beamBorn[i] === FREE) continue
      const { outer, core } = this.beams[i]!
      const t = (fxMs - this.beamBorn[i]!) / BEAM_MS
      if (t >= 1) {
        this.beamBorn[i] = FREE
        outer.setVisible(false)
        core.setVisible(false)
        continue
      }
      const e = cubicEaseIn(t)
      const sy = 1 - 0.85 * e // scaleY 1 → 0.15
      outer.setScale(1, sy).setAlpha(1 - e)
      core.setScale(1, sy).setAlpha(1 - e)
    }

    for (let i = 0; i < ARCS; i++) {
      if (this.arcBorn[i] === FREE) continue
      const g = this.arcs[i]!
      const t = (fxMs - this.arcBorn[i]!) / this.arcDur[i]!
      if (t >= 1) {
        this.arcBorn[i] = FREE
        g.setVisible(false)
        continue
      }
      // 折线/弧只淡出，几何在投放时画好一次（线性，与旧实现的默认缓动一致）
      g.setAlpha(1 - t)
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

  circle(x: number, y: number, radius: number, o: CircleCue): void {
    const i = this.circleAt
    this.circleAt = (this.circleAt + 1) % CIRCLES
    const c = this.circles[i]!
    c.setPosition(x, y).setRadius(radius).setFillStyle(o.fill, o.fillAlpha).setDepth(o.depth)
    // 无描边时用无参 setStrokeStyle 关掉（Shape 据此置 isStroked = false）
    if (o.stroke === undefined) c.setStrokeStyle()
    else c.setStrokeStyle(o.lineWidth ?? 2, o.stroke, o.lineAlpha ?? 1)
    c.setScale(o.fromScale).setAlpha(1).setVisible(true)
    this.circleBorn[i] = this.now
    this.circleDur[i] = o.durationMs
    this.circleFrom[i] = o.fromScale
    this.circleTo[i] = o.toScale
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

  /** 贯穿光束：沿 angle 铺一条长 length 的双层矩形（外层色 + 白芯），纵向收拢淡出 */
  beam(x: number, y: number, angle: number, length: number, radius: number, color: number): void {
    const i = this.beamAt
    this.beamAt = (this.beamAt + 1) % BEAMS
    const { outer, core } = this.beams[i]!
    outer.setPosition(x, y).setSize(length, radius * 2).setFillStyle(color, 0.55)
    core.setPosition(x, y).setSize(length, radius * 0.7).setFillStyle(0xffffff, 0.95)
    outer.setRotation(angle).setScale(1, 1).setAlpha(1).setVisible(true)
    core.setRotation(angle).setScale(1, 1).setAlpha(1).setVisible(true)
    this.beamBorn[i] = this.now
  }

  /** 锯齿闪电折线：沿折点串每段拆几截加垂直抖动画一条电弧，短暂淡出（连锁传导路径） */
  lightning(points: readonly { x: number; y: number }[], color: number): void {
    if (points.length < 2) return
    const g = this.takeArc(200)
    g.lineStyle(3, color, 0.95)
    g.beginPath()
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!
      const b = points[i]!
      const segs = 4
      g.moveTo(a.x, a.y)
      for (let s = 1; s <= segs; s++) {
        const t = s / segs
        const nx = -(b.y - a.y)
        const ny = b.x - a.x
        const len = Math.hypot(nx, ny) || 1
        const jitter = s === segs ? 0 : (Math.random() - 0.5) * 18
        g.lineTo(a.x + (b.x - a.x) * t + (nx / len) * jitter, a.y + (b.y - a.y) * t + (ny / len) * jitter)
      }
    }
    g.strokePath()
  }

  /** 斩击弧光：以 (x,y) 为心、朝 angle 画一段 ±1.1rad 的白弧，淡出（瞬袭背刺） */
  slash(x: number, y: number, angle: number, radius: number): void {
    const g = this.takeArc(220)
    g.lineStyle(5, 0xffffff, 0.9)
    g.beginPath()
    g.arc(x, y, radius, angle - 1.1, angle + 1.1)
    g.strokePath()
  }

  /** 全屏白闪：一块盖满视口的定屏矩形淡出（天罚全域打击） */
  screenFlash(color: number, alpha: number, durationMs: number): void {
    this.flash.setFillStyle(color, 1).setAlpha(alpha).setVisible(true)
    this.flashBorn = this.now
    this.flashDur = durationMs
    this.flashAlpha = alpha
  }

  /** 取一个已清空、已就绪的弧线槽位 */
  private takeArc(durMs: number): Phaser.GameObjects.Graphics {
    const i = this.arcAt
    this.arcAt = (this.arcAt + 1) % ARCS
    const g = this.arcs[i]!
    g.clear()
    g.setAlpha(1).setVisible(true)
    this.arcBorn[i] = this.now
    this.arcDur[i] = durMs
    return g
  }
}
