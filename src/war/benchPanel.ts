import Phaser from 'phaser'
import { FONT, UI_FONT } from '../util/fonts'
import { textRes, viewport } from '../util/apply'
import { roundRect } from '../ui/shapes'
import { heapMB, rafHz, rendererInfo } from './diagnostics'
import { emojiCacheStats } from '../emoji/textures'
import { metricsReport, recentFrameTimes, resetMetrics } from '../bench/metrics'
import { benchFramework, benchProfile } from '../bench/spec'
import { reportBench } from '../bench/probe'
import { renderProbe } from '../bench/renderProbe'
import type { HudHost } from './hudHost'

// 基准面板：战斗内常驻的实时性能读数 + 帧时曲线。
//
// 布局是**自适应**的：先把文本写进去量出真实高度，再据此画背景框。
// 早先按「估算行数」定高，内容一多就从底部截断（渲染后端那行只剩半截）——
// 读数面板被截断是最糟的失败方式：你不知道少了什么，也不知道少了多少。
// 字号在放不下时逐级收缩，收到下限仍放不下才丢弃「说明」列。

const W = 470
const CHART_H = 62
/** 纵轴下限（ms）：轻载时也留出 60fps(16.7) / 30fps(33.3) 两条参考线的位置。
 * 上限不写死——重载下帧时能到两千毫秒，固定天花板会把曲线整条压在顶边上，
 * 而重载恰恰是本基准存在的场景 */
const CHART_FLOOR = 40
const PAD = 16
/** 字号候选：放不下就往下取。10px 是等宽字仍能扫读的下限 */
const SIZES = [20, 18, 16, 14, 12, 11, 10]

export class BenchPanel {
  private readonly bg: Phaser.GameObjects.Graphics
  private readonly chart: Phaser.GameObjects.Graphics
  private readonly text: Phaser.GameObjects.Text
  private readonly title: Phaser.GameObjects.Text
  private readonly scaleText: Phaser.GameObjects.Text
  private readonly x: number
  private readonly y: number
  private readonly chartX: number
  private readonly chartY: number
  private readonly textY: number
  private refreshedAt = 0
  /** 是否已在满载时重采样过（见 update 里的说明） */
  private steadyArmed = false

  constructor(private readonly scene: Phaser.Scene, private readonly host: HudHost) {
    const res = textRes()
    this.x = viewport.logicalWidth - W - 14
    this.y = 14
    this.chartX = this.x + PAD
    this.chartY = this.y + 48
    this.textY = this.chartY + CHART_H + 12

    this.bg = scene.add.graphics().setDepth(300)
    this.title = scene.add
      .text(this.x + PAD, this.y + 12, '', {
        fontFamily: UI_FONT, fontSize: FONT.strong, fontStyle: 'bold', color: '#ffdc5d', resolution: res,
      })
      .setDepth(302)
    this.chart = scene.add.graphics().setDepth(301)
    this.scaleText = scene.add
      .text(this.x + W - PAD, this.y + 20, '', {
        fontFamily: 'ui-monospace, monospace', fontSize: '15px', color: '#8a8a99', resolution: res,
      })
      .setOrigin(1, 0)
      .setDepth(302)
    this.text = scene.add
      .text(this.x + PAD, this.textY, '', {
        fontFamily: 'ui-monospace, monospace', fontSize: '20px', color: '#e6e6ee',
        lineSpacing: 2, resolution: res,
        wordWrap: { width: W - PAD * 2 },
      })
      .setDepth(302)
  }

  destroy(): void {
    this.bg.destroy()
    this.chart.destroy()
    this.text.destroy()
    this.title.destroy()
    this.scaleText.destroy()
  }

  /** 每帧调用；内部按 250ms 节流刷新文本（读数抖动太快反而看不清） */
  update(time: number): void {
    this.drawChart()
    if (time - this.refreshedAt < 250) return
    this.refreshedAt = time

    const p = this.host.perfSnapshot()
    const prof = benchProfile()
    const cache = emojiCacheStats(this.scene)
    const heap = heapMB()
    const raf = rafHz()
    const live = p.enemies + p.projectiles + p.coins

    // 满载后清一次采样：刷怪从 0 爬到上限的那几百帧场上没几个实体、轻松满帧，
    // 混进来会把中位数整个拉到「赶上 vsync」那一档，读出来的稳态是假的。
    // 一次性闩死——敌人数会在上限附近上下浮动，否则会反复清零
    if (!this.steadyArmed && p.enemies >= prof.spawn.cap * 0.95) {
      this.steadyArmed = true
      resetMetrics()
    }
    const m = metricsReport(raf)
    const probe = renderProbe()

    this.title.setText(
      `${benchFramework() === 'ecs' ? 'ECS' : 'arcade'} · ${prof.label} · ${live.toLocaleString()} 实体`,
    )

    // 数值列右对齐到固定宽度，标签左对齐——扫读时数字成一竖列
    const row = (label: string, value: string, note = ''): string =>
      `${label.padEnd(9)}${value.padStart(9)}${note ? '  ' + note : ''}`
    const ms = (v: number): string => v.toFixed(1)
    const n = (v: number): string => v.toLocaleString()

    const lines = [
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
      row('敌人', n(p.enemies), `上限 ${n(prof.spawn.cap)}`),
      row('弹体', n(p.projectiles)),
      row('金币', n(p.coins)),
      row('刷怪预告', n(p.pending)),
      row('刷怪间隔', `${p.spawnIntervalMs}`, 'ms'),
      '',
      '── 引擎结构（架构差异所在）──',
      row('GameObject', n(p.objects)),
      row('物理体', n(p.bodies)),
      row('emoji 纹理', n(cache.textures)),
      // 图集页数：超过单批纹理上限（通常 16）就会被切成大量子批，
      // 每个子批还要换一次 shader 的取样器数量——闪屏时优先看这一行
      ...(p.atlasPages === undefined
        ? []
        : [row('图集页', n(p.atlasPages), p.atlasPages > 16 ? '⚠ 超单批上限 16' : '上限 16')]),
      ...(m.drawCount === undefined ? [] : [row('渲染对象', n(m.drawCount))]),
      row('JS 堆', heap === undefined ? '—' : n(heap), heap === undefined ? '（非 Chrome）' : 'MB'),
      '',
      '── 本档强度 ──',
      `队伍 ${prof.team} 人 · ${['基础', '一阶', '二阶'][prof.level]!} · 攻速 ×${prof.fireRate}`,
      `敌人血量 ×${prof.difficulty} · ${prof.kinds} 种 · 每批 ${prof.spawn.batch} 只`,
      '',
      '── 整帧丢失排查 ──',
      // 「空帧」= 本帧场上有实体、批绘却一个四边形都没提交。
      // 涨 → 故障在 JS 侧；恒 0 而屏幕确实闪了 → 我们提交了，问题在 GPU/合成器那一层
      row('空帧', n(probe.blankFrames), probe.blankFrames > 0 ? `间隔 ${probe.blankGap} 帧` : '批绘零提交'),
      row('JS 异常', n(probe.errors)),
      row('上下文丢失', n(probe.contextLost)),
      ...(probe.lastError === '' ? [] : [probe.lastError]),
      '',
      '── 渲染后端 ──',
      rendererInfo(this.scene.game),
      '',
      '按 B 停止基准并返回配置页',
    ]

    this.fitText(lines)


    reportBench({
      framework: benchFramework(),
      profile: prof.id,
      live: { enemies: p.enemies, projectiles: p.projectiles, coins: p.coins },
      objects: p.objects,
      bodies: p.bodies,
      metrics: m,
    })
  }

  /** 写入文本并按实测高度定框：逐级降级直到装得下，最后按实际高度画背景。
   *
   * 降级是**两维**的：先在全量文本上把字号从大到小试一遍，还放不下就丢掉空行
   * 再把字号从大到小试一遍（去掉空行比缩小字号更值——密一点仍可读，小到 10px 就不行了）。
   * 早先只在最小字号上补试一次「去空行」，加两行读数就又溢出到视口外面去了：
   * 单点兜底不是兜底，必须每一档都重新量。截断的读数面板比没有面板更糟——
   * 你不知道少了什么，也不知道少了多少。 */
  private fitText(lines: readonly string[]): void {
    const avail = viewport.logicalHeight - this.textY - PAD - 8
    const dense = lines.filter((l) => l !== '')
    outer: for (const variant of [lines, dense]) {
      for (const size of SIZES) {
        this.text.setFontSize(size)
        this.text.setText(variant as string[])
        if (this.text.height <= avail) break outer
      }
    }
    const h = Math.min(
      viewport.logicalHeight - this.y * 2,
      this.textY - this.y + this.text.height + PAD,
    )
    this.bg.clear()
    roundRect(this.bg, this.x, this.y, W, h, 16, {
      fill: 0x05060a, fillAlpha: 0.88, stroke: 0xffdc5d, strokeAlpha: 0.5, strokeWidth: 2,
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
    const x = this.chartX
    const y = this.chartY
    const w = W - PAD * 2
    roundRect(g, x, y, w, CHART_H, 8, { fill: 0x000000, fillAlpha: 0.45 })

    const frames = recentFrameTimes(w)
    const sorted = [...frames].sort((a, b) => a - b)
    const p95 = sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.round(0.95 * (sorted.length - 1)))]! : 0
    const top = Math.max(CHART_FLOOR, p95 * 1.15)
    const yOf = (msVal: number): number => y + CHART_H - (Math.min(msVal, top) / top) * CHART_H

    // 参考线：只在量程内才画，否则是条贴底的噪声
    for (const [msVal, color] of [[16.7, 0x4caf50], [33.3, 0xffa726]] as const) {
      if (msVal > top) continue
      g.lineStyle(1, color, 0.5)
      g.lineBetween(x, yOf(msVal), x + w, yOf(msVal))
    }

    if (frames.length >= 2) {
      g.lineStyle(1.5, 0xffdc5d, 0.95)
      g.beginPath()
      // 采样不足整幅宽时横向拉伸铺满：否则开局那阵曲线只占右边一小截、中间全空
      for (let px = 0; px < w; px++) {
        const idx = Math.min(frames.length - 1, Math.floor(((w - 1 - px) / (w - 1)) * (frames.length - 1)))
        const py = yOf(frames[idx]!)
        if (px === 0) g.moveTo(x + px, py)
        else g.lineTo(x + px, py)
      }
      g.strokePath()
    }
    this.scaleText.setText(`0–${top.toFixed(0)}ms · ${frames.length}帧`)
  }
}
