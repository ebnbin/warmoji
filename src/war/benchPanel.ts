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
// 只在基准模式挂载，与 dev 面板分开——dev 面板是「顺手看一眼」，行数受限于不挡视野；
// 基准面板是本次运行的主体，占屏幕右侧一整条，读数密度优先于观感。

const W = 460
const CHART_H = 64
/** 曲线纵轴上限（ms）：16.7 = 60fps 线，33.3 = 30fps 线 */
const CHART_MAX = 50

export class BenchPanel {
  private readonly bg: Phaser.GameObjects.Graphics
  private readonly chart: Phaser.GameObjects.Graphics
  private readonly text: Phaser.GameObjects.Text
  private readonly title: Phaser.GameObjects.Text
  private refreshedAt = 0

  constructor(private readonly scene: Phaser.Scene, private readonly host: HudHost) {
    const res = textRes()
    const x = viewport.logicalWidth - W - 16
    const y = 16
    const h = viewport.logicalHeight - 32

    this.bg = scene.add.graphics().setDepth(300).setScrollFactor(0)
    roundRect(this.bg, x, y, W, h, 16, { fill: 0x05060a, fillAlpha: 0.86, stroke: 0xffdc5d, strokeAlpha: 0.5, strokeWidth: 2 })

    this.title = scene.add
      .text(x + 18, y + 16, '', {
        fontFamily: UI_FONT, fontSize: FONT.head, fontStyle: 'bold', color: '#ffdc5d', resolution: res,
      })
      .setDepth(301)
      .setScrollFactor(0)

    this.chart = scene.add.graphics().setDepth(301).setScrollFactor(0)
    this.chartX = x + 18
    this.chartY = y + 58

    this.text = scene.add
      .text(x + 18, y + 58 + CHART_H + 14, '', {
        fontFamily: 'ui-monospace, monospace', fontSize: FONT.caption, color: '#e6e6ee',
        lineSpacing: 3, resolution: res,
      })
      .setDepth(301)
      .setScrollFactor(0)
  }

  private readonly chartX: number
  private readonly chartY: number

  destroy(): void {
    this.bg.destroy()
    this.chart.destroy()
    this.text.destroy()
    this.title.destroy()
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
      `${benchFramework() === 'ecs' ? 'ECS' : 'arcade'} · ${prof.label}  ${live.toLocaleString()} 实体`,
    )

    const ms = (v: number): string => v.toFixed(2).padStart(6)

    this.text.setText([
      m.warming ? '⏳ 预热中（前 800ms 不计入）' : `采样 ${m.samples} 帧`,
      '',
      '── 帧预算（ms）─────────────',
      `总帧时  p50 ${ms(m.total.p50)}  p95 ${ms(m.total.p95)}`,
      `        p99 ${ms(m.total.p99)}  max ${ms(m.total.max)}`,
      `  更新  p50 ${ms(m.update.p50)}  p95 ${ms(m.update.p95)}`,
      `  渲染  p50 ${ms(m.render.p50)}  p95 ${ms(m.render.p95)}`,
      `  其余      ${ms(Math.max(0, m.total.p50 - m.update.p50 - m.render.p50))}  vsync/合成`,
      '',
      '── 帧率 ───────────────────',
      `稳态 ${m.fps.toFixed(1).padStart(6)}   1%低 ${m.fpsLow1.toFixed(1).padStart(6)}`,
      `引擎 ${this.scene.game.loop.actualFps.toFixed(1).padStart(6)}   rAF ${raf > 0 ? String(raf).padStart(5) : '    -'}`,
      '',
      '── 在场（真实战斗产出）────',
      `敌人 ${String(p.enemies).padStart(6)} / 上限 ${String(prof.spawn.cap).padStart(5)}`,
      `弹体 ${String(p.projectiles).padStart(6)}   预告 ${String(p.pending).padStart(5)}`,
      `金币 ${String(p.coins).padStart(6)}   刷怪 ${String(p.spawnIntervalMs).padStart(4)}ms`,
      '',
      '── 引擎结构 ───────────────',
      `GameObject ${String(p.objects).padStart(6)}   物理体 ${String(p.bodies).padStart(6)}`,
      `渲染对象   ${String(m.drawCount).padStart(6)}   纹理   ${String(cache.textures).padStart(6)}`,
      `JS 堆   ${heap === undefined ? '     —' : String(heap).padStart(6)} MB  队伍 ${prof.team} 人 ×${prof.fireRate}`,
      rendererInfo(this.scene.game).slice(0, 30),
      '按 B 停止并返回配置页',
    ])

    reportBench({
      framework: benchFramework(),
      profile: prof.id,
      live: { enemies: p.enemies, projectiles: p.projectiles, coins: p.coins },
      objects: p.objects,
      bodies: p.bodies,
      metrics: m,
    })
  }

  /** 帧时曲线：右侧最新，横线标 60fps(16.7ms) 与 30fps(33.3ms) */
  private drawChart(): void {
    const g = this.chart
    g.clear()
    const x = this.chartX
    const y = this.chartY
    const w = W - 36
    roundRect(g, x, y, w, CHART_H, 8, { fill: 0x000000, fillAlpha: 0.45 })

    const line = (msVal: number, color: number, alpha: number): void => {
      const ly = y + CHART_H - (Math.min(msVal, CHART_MAX) / CHART_MAX) * CHART_H
      g.lineStyle(1, color, alpha)
      g.lineBetween(x, ly, x + w, ly)
    }
    line(16.7, 0x4caf50, 0.5)
    line(33.3, 0xffa726, 0.5)

    const frames = recentFrameTimes(w)
    if (frames.length < 2) return
    g.lineStyle(1.5, 0xffdc5d, 0.95)
    g.beginPath()
    for (let i = 0; i < frames.length; i++) {
      const px = x + w - i
      const py = y + CHART_H - (Math.min(frames[i]!, CHART_MAX) / CHART_MAX) * CHART_H
      if (i === 0) g.moveTo(px, py)
      else g.lineTo(px, py)
    }
    g.strokePath()
  }
}
