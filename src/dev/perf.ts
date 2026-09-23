import Phaser from 'phaser'
import { FONT } from '../util/fonts'
import { textRes } from '../util/apply'
import { roundRect } from '../ui/shapes'
import { heapMB, rafHz, rendererInfo } from './diagnostics'
import { emojiCacheStats } from '../emoji/textures'
import { metricsReport, recentFrameTimes, resetMetrics } from './metrics'
import { sandboxDifficulty, sandboxEnemySet, sandboxFireRate, sandboxLevel, sandboxStarters, scaleStep } from '../run/sandbox'
import { reportDevPerf } from './probe'
import type { HudHost } from '../run/hudHost'

// 坐标以面板内容区顶为原点

const CHART_H = 74
/** ms；留出 16.7 / 33.3 两条参考线的位置 */
const CHART_FLOOR = 40
const SCALE_ROW = 32

export class PerfView {
  /** 由面板挂进滚动容器并统一销毁 */
  readonly objects: Phaser.GameObjects.GameObject[]

  private readonly chart: Phaser.GameObjects.Graphics
  private readonly scaleText: Phaser.GameObjects.Text
  private readonly text: Phaser.GameObjects.Text
  private refreshedAt = 0
  private steadyArmed = false

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly host: HudHost,
    private readonly w: number,
    private readonly top: number,
    private readonly sandbox: boolean,
  ) {
    const res = textRes()
    this.chart = scene.add.graphics()
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

  /** 每帧调用；返回内容总高 */
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
    // 直读旋钮而非预设：旋钮可逐个手改
    const step = this.sandbox ? scaleStep() : undefined
    const cache = emojiCacheStats(this.scene)
    const heap = heapMB()
    const raf = rafHz()

    // 满载后清一次采样，爬坡期不算稳态；一次性闩死，敌人数在上限附近浮动会反复触发
    if (step && !this.steadyArmed && p.enemies >= step.spawn.cap * 0.95) {
      this.steadyArmed = true
      resetMetrics()
    }
    const m = metricsReport(raf)

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
      // 中位数不可加，三段之和不等于总计
      row('· 更新', ms(m.update.p50), '场景逻辑+物理'),
      row('· 渲染', ms(m.render.p50), '渲染提交'),
      row('· 其余', ms(m.rest.p50), '帧外：vsync 等待/GC/异步任务'),
      row('· 帧间跳变', ms(m.jitter.p50), '节奏抖动'),
      '',
      '── 帧率（fps）──',
      row('平均', m.fps.toFixed(1), '采样窗口内均值'),
      row('1% 低', m.fpsLow1.toFixed(1), '卡顿体感'),
      row('引擎估计', this.scene.game.loop.actualFps.toFixed(1), 'Phaser 每秒指数平均·抹平尖峰·仅对照'),
      row('中位档', m.fpsMedian.toFixed(1), 'vsync 量化·勿当帧率'),
      row('屏幕上限', raf > 0 ? String(raf) : '—', 'Hz · 实测峰值'),
      `vsync 档  ${m.buckets.map((b, i) => `${i === 3 ? '≥4' : i + 1}×${(b * 100).toFixed(0)}%`).join(' ')}`,
      '',
      '── 在场实体（真实战斗产出）──',
      row('敌人', n(p.enemies), step ? `上限 ${n(step.spawn.cap)}` : ''),
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
      ...(step === undefined ? [] : [
        '',
        '── 本档强度 ──',
        `队伍 ${sandboxStarters().length} 人 · ${['基础', '一阶', '二阶'][sandboxLevel()]!} · 攻速 ×${sandboxFireRate()}`,
        `敌人血量 ×${sandboxDifficulty()} · ${sandboxEnemySet().size} 种`,
        `规模「${step.label}」上限 ${n(step.spawn.cap)} · 每批 ${step.spawn.batch} 只`,
      ]),
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

  /** 左旧右新；纵轴按窗口内 p95 定标，超出量程的帧顶到上边缘 */
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

    for (const [msVal, color] of [[16.7, 0x4caf50], [33.3, 0xffa726]] as const) {
      if (msVal > top) continue
      g.lineStyle(1, color, 0.5)
      g.lineBetween(0, yOf(msVal), w, yOf(msVal))
    }

    if (frames.length >= 2) {
      g.lineStyle(1.5, 0xffdc5d, 0.95)
      g.beginPath()
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
