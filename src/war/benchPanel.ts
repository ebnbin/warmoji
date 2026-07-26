import Phaser from 'phaser'
import { FONT, UI_FONT } from '../util/fonts'
import { textRes, viewport } from '../util/apply'
import { roundRect } from '../ui/shapes'
import { heapMB, rafHz, rendererInfo } from './diagnostics'
import { emojiCacheStats } from '../emoji/textures'
import { metricsReport, recentFrameTimes } from '../bench/metrics'
import { benchFramework, benchProfile } from '../bench/spec'
import { reportBench } from '../bench/probe'
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
/** 字号候选：放不下就往下取 */
const SIZES = [20, 18, 16, 14, 12]

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

    const m = metricsReport()
    const p = this.host.perfSnapshot()
    const prof = benchProfile()
    const cache = emojiCacheStats(this.scene)
    const heap = heapMB()
    const raf = rafHz()
    const live = p.enemies + p.projectiles + p.coins

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
        : `已采样 ${m.samples} 帧`,
      '',
      '── 帧耗时（毫秒 · 越小越好）──',
      row('总计 p50', ms(m.total.p50)),
      row('     p95', ms(m.total.p95)),
      row('     p99', ms(m.total.p99)),
      row('     最大', ms(m.total.max)),
      row('· 更新', ms(m.update.p50), '场景逻辑+物理'),
      row('· 渲染', ms(m.render.p50), '渲染提交'),
      row('· 其余', ms(Math.max(0, m.total.p50 - m.update.p50 - m.render.p50)), 'vsync/合成'),
      '',
      '── 帧率（fps）──',
      row('稳态', m.fps.toFixed(1), '由 p50 换算'),
      row('1% 低', m.fpsLow1.toFixed(1), '卡顿体感'),
      row('引擎报告', this.scene.game.loop.actualFps.toFixed(1)),
      row('屏幕 rAF', raf > 0 ? String(raf) : '—', 'Hz'),
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
      ...(m.drawCount === undefined ? [] : [row('渲染对象', n(m.drawCount))]),
      row('JS 堆', heap === undefined ? '—' : n(heap), heap === undefined ? '（非 Chrome）' : 'MB'),
      '',
      '── 本档强度 ──',
      `队伍 ${prof.team} 人 · ${['基础', '一阶', '二阶'][prof.level]!} · 攻速 ×${prof.fireRate}`,
      `敌人血量 ×${prof.difficulty} · ${prof.kinds} 种 · 每批 ${prof.spawn.batch} 只`,
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

  /** 写入文本并按实测高度定框：字号逐级收缩直到装得下，最后按实际高度画背景。
   * 这样无论内容怎么变都不会被截断——截断的读数面板比没有更糟 */
  private fitText(lines: readonly string[]): void {
    const avail = viewport.logicalHeight - this.textY - PAD - 8
    let used = SIZES[SIZES.length - 1]!
    for (const size of SIZES) {
      this.text.setFontSize(size)
      this.text.setText(lines as string[])
      if (this.text.height <= avail) {
        used = size
        break
      }
    }
    // 全部档位都放不下（极窄视口）：用最小字号，丢掉空行争取空间
    if (this.text.height > avail) {
      this.text.setFontSize(used)
      this.text.setText(lines.filter((l) => l !== '') as string[])
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
