import Phaser from 'phaser'
import { FONT } from '../util/fonts'
import { textRes } from '../util/apply'
import { roundRect } from '../ui/shapes'
import { heapMB, rafHz, rendererInfo } from './diagnostics'
import { emojiCacheStats } from '../emoji/textures'
import { metricsReport, recentFrameTimes, resetMetrics } from './metrics'
import { labDifficulty, labEnemySet, labFireRate, labLevel, labStarters, scaleStep } from '../run/lab'
import { reportDevPerf } from './probe'
import type { HudHost } from '../run/hudHost'

// 性能读数视图：帧时曲线 + 分位数 + 在场实体 + 引擎结构 + 渲染后端。
// 它是开发者面板「性能」页的内容，坐标以面板内容区顶为原点，装在面板的滚动容器里。
//
// 早先这块是一整个独立面板（基准模式专属），自己算高度、放不下就逐级缩字号、
// 再放不下就丢空行——因为它固定贴在屏幕上，溢出就是被截断，而**截断的读数面板
// 比没有面板更糟：你不知道少了什么，也不知道少了多少**。装进滚动容器后这个问题
// 从根上消失了：放不下就滚，字号恒定可读，那套两维降级逻辑随之删掉。

const CHART_H = 74
/** 纵轴下限（ms）：轻载时也留出 60fps(16.7) / 30fps(33.3) 两条参考线的位置。
 * 上限不写死——重载下帧时能到两千毫秒，固定天花板会把曲线整条压在顶边上，
 * 而重载恰恰是本读数存在的场景 */
const CHART_FLOOR = 40
/** 曲线与读数之间那行量程注的占位高 */
const SCALE_ROW = 32

export class PerfView {
  /** 本视图创建的全部对象，由面板挂进滚动容器并统一销毁 */
  readonly objects: Phaser.GameObjects.GameObject[]

  private readonly chart: Phaser.GameObjects.Graphics
  private readonly scaleText: Phaser.GameObjects.Text
  private readonly text: Phaser.GameObjects.Text
  private refreshedAt = 0
  /** 是否已在满载时重采样过（见 refresh 里的说明） */
  private steadyArmed = false

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly host: HudHost,
    private readonly w: number,
    private readonly top: number,
  ) {
    const res = textRes()
    this.chart = scene.add.graphics()
    // 量程注在曲线**下方**而非压在图上：曲线本身是黄色细线，叠字上去两者互相糊掉
    this.scaleText = scene.add
      .text(w, top + CHART_H + 6, '', {
        fontFamily: 'ui-monospace, monospace', fontSize: FONT.caption, color: '#8a8a99', resolution: res,
      })
      .setOrigin(1, 0)
    this.text = scene.add
      .text(0, top + CHART_H + SCALE_ROW, '', {
        fontFamily: 'ui-monospace, monospace', fontSize: '18px', color: '#e6e6ee',
        lineSpacing: 2, resolution: res,
      })
    this.objects = [this.chart, this.scaleText, this.text]
  }

  /** 每帧调用（曲线逐帧，文本 250ms 节流——读数抖动太快反而看不清）。
   * 返回内容总高，面板据此设滚动高度 */
  update(time: number): number {
    this.drawChart()
    if (time - this.refreshedAt >= 250) {
      this.refreshedAt = time
      this.refresh()
    }
    return this.top + CHART_H + SCALE_ROW + this.text.height
  }

  private refresh(): void {
    const p = this.host.perfSnapshot()
    // 强度直读旋钮而非预设：旋钮可以逐个手改，照着预设念会念出一份与场上不符的强度
    const step = scaleStep()
    const cache = emojiCacheStats(this.scene)
    const heap = heapMB()
    const raf = rafHz()

    // 满载后清一次采样：刷怪从 0 爬到上限的那几百帧场上没几个实体、轻松满帧，
    // 混进来会把中位数整个拉到「赶上 vsync」那一档，读出来的稳态是假的。
    // 一次性闩死——敌人数会在上限附近上下浮动，否则会反复清零
    if (!this.steadyArmed && p.enemies >= step.spawn.cap * 0.95) {
      this.steadyArmed = true
      resetMetrics()
    }
    const m = metricsReport(raf)

    // 数值列右对齐到固定宽度，标签左对齐——扫读时数字成一竖列
    const row = (label: string, value: string, note = ''): string =>
      `${label.padEnd(9)}${value.padStart(9)}${note ? '  ' + note : ''}`
    const ms = (v: number): string => v.toFixed(1)
    const n = (v: number): string => v.toLocaleString()

    this.text.setText([
      m.warming
        ? '预热中：前 800ms 的帧不计入统计'
        : `已采样 ${m.samples} 帧${this.steadyArmed ? '（满载后重采）' : '（刷怪爬坡中）'}`,
      '',
      '── 帧耗时（毫秒 · 越小越好）──',
      row('总计 p50', ms(m.total.p50)),
      row('     p95', ms(m.total.p95)),
      row('     p99', ms(m.total.p99)),
      row('     最大', ms(m.total.max)),
      // 三段各自取中位数：不保证相加等于总计 p50（中位数不可加），但每个都是真读数
      row('· 更新', ms(m.update.p50), '场景逻辑+物理'),
      row('· 渲染', ms(m.render.p50), '渲染提交'),
      row('· 其余', ms(m.rest.p50), 'vsync/合成'),
      row('· 帧间跳变', ms(m.jitter.p50), '节奏抖动'),
      '',
      '── 帧率（fps）──',
      row('平均', m.fps.toFixed(1), '每秒实交付帧数'),
      row('1% 低', m.fpsLow1.toFixed(1), '卡顿体感'),
      row('引擎报告', this.scene.game.loop.actualFps.toFixed(1), '独立口径·对照'),
      row('中位档', m.fpsMedian.toFixed(1), 'vsync 量化·勿当帧率'),
      row('屏幕上限', raf > 0 ? String(raf) : '—', 'Hz · 实测峰值'),
      // vsync 档位分布：双峰（如 1× 与 2× 各占一半）就是肉眼可见的 judder，
      // 任何单个分位数都看不出来——这正是「显示 59fps 却觉得卡」的真相
      `vsync 档  ${m.buckets.map((b, i) => `${i === 3 ? '≥4' : i + 1}×${(b * 100).toFixed(0)}%`).join(' ')}`,
      '',
      '── 在场实体（真实战斗产出）──',
      row('敌人', n(p.enemies), `上限 ${n(step.spawn.cap)}`),
      row('弹体', n(p.projectiles)),
      row('金币', n(p.coins)),
      row('刷怪预告', n(p.pending)),
      row('刷怪间隔', `${p.spawnIntervalMs}`, 'ms'),
      '',
      '── 引擎结构（架构差异所在）──',
      row('GameObject', n(p.objects)),
      row('物理体', n(p.bodies)),
      row('emoji 纹理', n(cache.textures)),
      ...(m.drawCount === undefined ? [] : [row('渲染对象', n(m.drawCount))]),
      row('JS 堆', heap === undefined ? '—' : n(heap), heap === undefined ? '（非 Chrome）' : 'MB'),
      '',
      '── 本档强度 ──',
      `队伍 ${labStarters().length} 人 · ${['基础', '一阶', '二阶'][labLevel()]!} · 攻速 ×${labFireRate()}`,
      `敌人血量 ×${labDifficulty()} · ${labEnemySet().size} 种`,
      `规模「${step.label}」上限 ${n(step.spawn.cap)} · 每批 ${step.spawn.batch} 只`,
      '',
      '── 渲染后端 ──',
      rendererInfo(this.scene.game),
    ])

    reportDevPerf({
      live: { enemies: p.enemies, projectiles: p.projectiles, coins: p.coins },
      objects: p.objects,
      bodies: p.bodies,
      metrics: m,
    })
  }

  /** 帧时曲线：左旧右新，已有采样横向铺满整幅。
   *
   * 纵轴按窗口内 p95 定标而非峰值——单个几千毫秒的尖峰会把量程拉满，
   * 其余帧全压成贴底的平线（换个方式失真而已）。超出量程的帧直接顶到上边缘，
   * 视觉上就读作「冲出图表」，正是想要的表达。 */
  private drawChart(): void {
    const g = this.chart
    g.clear()
    const w = this.w
    const y = this.top
    roundRect(g, 0, y, w, CHART_H, 10, { fill: 0x000000, fillAlpha: 0.45 })

    const frames = recentFrameTimes(Math.round(w))
    const sorted = [...frames].sort((a, b) => a - b)
    const p95 = sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.round(0.95 * (sorted.length - 1)))]! : 0
    const top = Math.max(CHART_FLOOR, p95 * 1.15)
    const yOf = (msVal: number): number => y + CHART_H - (Math.min(msVal, top) / top) * CHART_H

    // 参考线：只在量程内才画，否则是条贴底的噪声
    for (const [msVal, color] of [[16.7, 0x4caf50], [33.3, 0xffa726]] as const) {
      if (msVal > top) continue
      g.lineStyle(1, color, 0.5)
      g.lineBetween(0, yOf(msVal), w, yOf(msVal))
    }

    if (frames.length >= 2) {
      g.lineStyle(1.5, 0xffdc5d, 0.95)
      g.beginPath()
      // 采样不足整幅宽时横向拉伸铺满：否则开局那阵曲线只占右边一小截、中间全空
      for (let px = 0; px < w; px++) {
        const idx = Math.min(frames.length - 1, Math.floor(((w - 1 - px) / (w - 1)) * (frames.length - 1)))
        const py = yOf(frames[idx]!)
        if (px === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
      g.strokePath()
    }
    this.scaleText.setText(`0–${top.toFixed(0)}ms · ${frames.length}帧`)
  }
}
