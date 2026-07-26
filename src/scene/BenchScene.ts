import Phaser from 'phaser'
import { applyBackground } from '../util/background'
import { randomPalette } from '../util/palette'
import type { Palette } from '../util/palette'
import { Rng } from '../util/rng'
import { reportDebug } from '../debug'
import { FONT, UI_FONT } from '../util/fonts'
import { playSfx } from '../audio/sfx'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { roundRect } from '../ui/shapes'
import { emojiText } from '../ui/emojiText'
import {
  BENCH_PRESETS,
  BENCH_STEPS,
  benchFramework,
  benchRefill,
  benchSpec,
  benchTotal,
  setBenchActive,
  setBenchFramework,
  setBenchRefill,
  setBenchSpec,
  stepBenchCount,
} from '../bench/spec'
import type { BenchSpec } from '../bench/spec'
import { resetMetrics } from '../bench/metrics'
import { labCaptain, labStarters, setLabDensity, setLabInvincible } from '../run/lab'
import { beginRun } from '../run/state'
import { battleSceneFor } from '../battle'
import { loadMap } from '../save/selection'

// 性能基准配置页：选负载规格 + 选框架 → 进沙盒战斗，实时读性能面板。
//
// 与试炼场（测试模式）的区别：试炼场调的是「玩法旋钮」（出哪些敌人、难度、攻速），
// 基准调的是「实体数量」——它不关心游戏性，只要求两个框架跑在同一份负载上。
// 因此这里不复用试炼场面板，另起一页：档位跨 0→16000 两个数量级，且明确标注
// 当前测的是哪一侧实现。

const ROWS: { key: keyof BenchSpec; emoji: string; label: string; desc: string }[] = [
  { key: 'enemies', emoji: '1f9df', label: '敌人', desc: 'AI 转向 · 碰撞 · 渲染' },
  { key: 'projectiles', emoji: '1f345', label: '弹体', desc: '逐帧位移 · 命中检测 · 渲染' },
  { key: 'coins', emoji: '1fa99', label: '金币', desc: '磁吸 · 拾取判定 · 渲染' },
]

export class BenchScene extends Phaser.Scene {
  private palette?: Palette
  private preserveOnRestart = false
  private rowTexts: Phaser.GameObjects.Text[] = []
  private totalText?: Phaser.GameObjects.Text
  private fwText?: Phaser.GameObjects.Text
  private refillText?: Phaser.GameObjects.Text
  private startY = 0
  private startX = 0

  constructor() {
    super('bench')
  }

  create(): void {
    applyCamera(this)
    if (!this.preserveOnRestart || !this.palette) {
      this.palette = randomPalette(new Rng(Date.now() & 0xffff))
    }
    this.preserveOnRestart = false
    applyBackground(this.palette)
    this.buildUi()
    this.scale.on(VIEWPORT_CHANGED, this.onViewport, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(VIEWPORT_CHANGED, this.onViewport, this)
    })
    this.report()
  }

  private onViewport(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }

  private buildUi(): void {
    const res = textRes()
    const W = viewport.logicalWidth
    const H = viewport.logicalHeight
    const cx = W / 2
    const portrait = H > W
    // 横屏双栏（1280×720 单栏放不下），竖屏单栏
    const colW = portrait ? Math.min(660, W - 60) : Math.min(560, W / 2 - 40)
    const leftX = portrait ? cx : cx - colW / 2 - 12
    const rightX = portrait ? cx : cx + colW / 2 + 12

    this.add
      .text(cx, 44, '性能基准', { fontFamily: UI_FONT, fontSize: FONT.title, fontStyle: 'bold', color: '#ffffff', resolution: res })
      .setOrigin(0.5)
    this.add
      .text(cx, 86, '同一份负载，两个框架各跑一遍', { fontFamily: UI_FONT, fontSize: FONT.small, color: '#a8a8b8', resolution: res })
      .setOrigin(0.5)
    this.mkButton(84, 40, 132, 52, '← 返回', 0x000000, 0.35, () => this.scene.start('menu'))

    // ── 左栏：框架 + 各类实体数量 ──
    let y = portrait ? 150 : 132
    this.add
      .text(leftX - colW / 2, y, '框架', { fontFamily: UI_FONT, fontSize: FONT.small, color: '#8a8a99', resolution: res })
      .setOrigin(0, 0.5)
    const fwW = colW / 2 - 6
    this.mkButton(leftX - colW / 4 - 3, y + 40, fwW, 58, 'arcade', 0x000000, 0.3, () => {
      setBenchFramework('arcade')
      this.refresh()
    })
    this.mkButton(leftX + colW / 4 + 3, y + 40, fwW, 58, 'ECS', 0x000000, 0.3, () => {
      setBenchFramework('ecs')
      this.refresh()
    })
    this.fwText = this.add
      .text(leftX, y + 84, '', { fontFamily: UI_FONT, fontSize: FONT.small, color: '#ffdc5d', resolution: res })
      .setOrigin(0.5)
    y += 116

    for (const r of ROWS) {
      const rowY = y + 36
      const g = this.add.graphics()
      roundRect(g, leftX - colW / 2, rowY - 36, colW, 72, 14, { fill: 0x000000, fillAlpha: 0.24, stroke: 0xffffff, strokeAlpha: 0.08 })
      emojiText(this, leftX - colW / 2 + 20, rowY - 12, `{${r.emoji}} ${r.label}`, {
        fontFamily: UI_FONT, fontSize: FONT.small, color: '#ffffff', resolution: res,
      }, { origin: 0 })
      this.add
        .text(leftX - colW / 2 + 20, rowY + 14, r.desc, { fontFamily: UI_FONT, fontSize: FONT.caption, color: '#8a8a99', resolution: res })
        .setOrigin(0, 0.5)
      this.mkButton(leftX + colW / 2 - 176, rowY, 52, 46, '−', 0xffffff, 0.12, () => {
        stepBenchCount(r.key, -1)
        this.refresh()
      })
      const t = this.add
        .text(leftX + colW / 2 - 108, rowY, '', { fontFamily: UI_FONT, fontSize: FONT.body, fontStyle: 'bold', color: '#ffdc5d', resolution: res })
        .setOrigin(0.5)
      this.rowTexts.push(t)
      this.mkButton(leftX + colW / 2 - 40, rowY, 52, 46, '+', 0xffffff, 0.12, () => {
        stepBenchCount(r.key, 1)
        this.refresh()
      })
      y += 82
    }
    this.totalText = this.add
      .text(leftX, y + 12, '', { fontFamily: UI_FONT, fontSize: FONT.small, color: '#c8c8d4', resolution: res })
      .setOrigin(0.5)

    // ── 右栏：预设 + 补量 + 开始 ──
    let ry = portrait ? y + 60 : 132
    this.add
      .text(rightX - colW / 2, ry, '预设', { fontFamily: UI_FONT, fontSize: FONT.small, color: '#8a8a99', resolution: res })
      .setOrigin(0, 0.5)
    ry += 34
    const pw = (colW - 10) / 2
    BENCH_PRESETS.forEach((p, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      this.mkButton(rightX - colW / 2 + pw / 2 + col * (pw + 10), ry + 26 + row * 60, pw, 52, p.label, 0x000000, 0.3, () => {
        setBenchSpec(p.spec)
        this.refresh()
      })
    })
    ry += 26 + Math.ceil(BENCH_PRESETS.length / 2) * 60

    this.refillText = this.add
      .text(rightX, ry + 20, '', { fontFamily: UI_FONT, fontSize: FONT.small, color: '#c8c8d4', resolution: res })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        setBenchRefill(!benchRefill())
        this.refresh()
      })
    ry += 56

    this.startY = ry + 42
    this.startX = rightX
    this.mkButton(rightX, this.startY, Math.min(400, colW), 72, '开始基准', 0xffdc5d, 1, () => this.startBench(), '#25262e')

    this.refresh()
  }

  private mkButton(
    x: number, y: number, w: number, h: number, label: string,
    fill: number, alpha: number, onTap: () => void, color = '#ffffff',
  ): void {
    const g = this.add.graphics()
    roundRect(g, x - w / 2, y - h / 2, w, h, h / 2, { fill, fillAlpha: alpha })
    this.add
      .text(x, y, label, { fontFamily: UI_FONT, fontSize: FONT.body, color, resolution: textRes() })
      .setOrigin(0.5)
    this.add
      .zone(x, y, w, h)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        playSfx('click')
        onTap()
      })
  }

  private refresh(): void {
    const s = benchSpec()
    ROWS.forEach((r, i) => {
      const v = s[r.key]
      this.rowTexts[i]?.setText(v >= 1000 ? `${v / 1000}k` : String(v))
    })
    this.totalText?.setText(`合计 ${benchTotal().toLocaleString()} 个实体  ·  档位 ${BENCH_STEPS.join(' / ')}`)
    this.fwText?.setText(benchFramework() === 'arcade' ? '▲ 当前：arcade（一实体一 GameObject + 物理体）' : '▲ 当前：ECS（bitECS + 自绘批量渲染）')
    this.refillText?.setText(`逐秒补量：${benchRefill() ? '开（维持稳态在场数）' : '关（只投一次，看衰减）'}  — 点击切换`)
    this.report()
  }

  private startBench(): void {
    setBenchActive(true)
    resetMetrics()
    // 沙盒：免死 + 最低自然刷怪密度（基准要的量全由 benchFill 投放，不掺自然出怪）
    setLabInvincible(true)
    setLabDensity('low')
    const mapId = loadMap(undefined)
    beginRun(labCaptain(), labStarters(), mapId, true)
    this.scene.start(battleSceneFor(mapId))
  }

  private report(): void {
    const s = benchSpec()
    reportDebug({
      scene: 'bench',
      elapsed: 0, hp: 0, alive: 0, kills: 0, level: 1, enemies: 0, pending: 0, fps: 0,
      viewW: viewport.logicalWidth, viewH: viewport.logicalHeight,
      playerX: 0, playerY: 0, camX: 0, camY: 0,
      bench: { start: { x: this.startX, y: this.startY }, framework: benchFramework(), enemies: s.enemies, projectiles: s.projectiles, coins: s.coins, total: benchTotal() },
    })
  }
}
