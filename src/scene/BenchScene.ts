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
import {
  applyBenchProfile,
  BENCH_PROFILES,
  benchFramework,
  benchProfile,
  setBenchActive,
  setBenchFramework,
  setBenchProfile,
} from '../bench/spec'
import { resetMetrics } from '../bench/metrics'
import { resetRenderProbe } from '../bench/renderProbe'
import { labCaptain, labStarters } from '../run/lab'
import { beginRun } from '../run/state'
import { battleSceneFor } from '../battle'
import { loadMap } from '../save/selection'

// 性能基准配置页：选强度档位 + 选框架 → 进真实战斗，实时读性能面板。
//
// 这里调的全是真实玩法旋钮（队伍规模/角色等级/刷怪强度/敌人血量/我方攻速/敌人种类），
// 实体数量是被观测的结果而非输入——旁路注入惰性实体测不到索敌、碰撞、伤害结算、
// 状态效果、死亡掉落、能力开火这些真实战场里真正吃帧的东西。

export class BenchScene extends Phaser.Scene {
  private palette?: Palette
  private preserveOnRestart = false
  private fwText?: Phaser.GameObjects.Text
  private profileRows: { id: string; bg: Phaser.GameObjects.Graphics; rect: { x: number; y: number; w: number; h: number } }[] = []
  private detailText?: Phaser.GameObjects.Text
  private startY = 0
  private startX = 0

  constructor() {
    super('bench')
  }

  create(): void {
    applyCamera(this)
    if (!this.preserveOnRestart || !this.palette) this.palette = randomPalette(new Rng(Date.now() & 0xffff))
    this.preserveOnRestart = false
    applyBackground(this.palette)
    this.profileRows = []
    this.buildUi()
    this.scale.on(VIEWPORT_CHANGED, this.onViewport, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(VIEWPORT_CHANGED, this.onViewport, this))
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
    const colW = portrait ? Math.min(660, W - 60) : Math.min(560, W / 2 - 40)
    const leftX = portrait ? cx : cx - colW / 2 - 12
    const rightX = portrait ? cx : cx + colW / 2 + 12

    this.add
      .text(cx, 42, '性能基准', { fontFamily: UI_FONT, fontSize: FONT.title, fontStyle: 'bold', color: '#ffffff', resolution: res })
      .setOrigin(0.5)
    this.add
      .text(cx, 84, '跑真实战斗：索敌 · 碰撞 · 伤害结算 · 状态 · 掉落 · 能力开火', {
        fontFamily: UI_FONT, fontSize: FONT.caption, color: '#a8a8b8', resolution: res,
      })
      .setOrigin(0.5)
    this.mkButton(84, 38, 132, 50, '← 返回', 0x000000, 0.35, () => this.scene.start('menu'))

    // ── 左栏：框架 + 强度档位 ──
    let y = 128
    this.add
      .text(leftX - colW / 2, y, '框架', { fontFamily: UI_FONT, fontSize: FONT.small, color: '#8a8a99', resolution: res })
      .setOrigin(0, 0.5)
    const fwW = colW / 2 - 6
    this.mkButton(leftX - colW / 4 - 3, y + 40, fwW, 56, 'arcade', 0x000000, 0.3, () => {
      setBenchFramework('arcade')
      this.refresh()
    })
    this.mkButton(leftX + colW / 4 + 3, y + 40, fwW, 56, 'ECS', 0x000000, 0.3, () => {
      setBenchFramework('ecs')
      this.refresh()
    })
    this.fwText = this.add
      .text(leftX, y + 80, '', { fontFamily: UI_FONT, fontSize: FONT.caption, color: '#ffdc5d', resolution: res })
      .setOrigin(0.5)
    y += 108

    this.add
      .text(leftX - colW / 2, y, '强度档位', { fontFamily: UI_FONT, fontSize: FONT.small, color: '#8a8a99', resolution: res })
      .setOrigin(0, 0.5)
    y += 24
    for (const p of BENCH_PROFILES) {
      const rect = { x: leftX - colW / 2, y, w: colW, h: 50 }
      const bg = this.add.graphics()
      this.profileRows.push({ id: p.id, bg, rect })
      this.add
        .text(rect.x + 16, y + 25, p.label, { fontFamily: UI_FONT, fontSize: FONT.small, color: '#ffffff', resolution: res })
        .setOrigin(0, 0.5)
      this.add
        .text(rect.x + 148, y + 25, p.desc, { fontFamily: UI_FONT, fontSize: FONT.caption, color: '#9a9aa8', resolution: res })
        .setOrigin(0, 0.5)
      this.add
        .zone(rect.x + rect.w / 2, y + 25, rect.w, rect.h)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          playSfx('click')
          setBenchProfile(p.id)
          this.refresh()
        })
      y += 54
    }

    // ── 右栏：档位明细 + 开始 ──
    const ry = portrait ? y + 20 : 128
    this.add
      .text(rightX - colW / 2, ry, '本档强度（全部经真实玩法旋钮生效）', {
        fontFamily: UI_FONT, fontSize: FONT.small, color: '#8a8a99', resolution: res,
      })
      .setOrigin(0, 0.5)
    const dg = this.add.graphics()
    roundRect(dg, rightX - colW / 2, ry + 20, colW, 250, 14, { fill: 0x000000, fillAlpha: 0.26, stroke: 0xffffff, strokeAlpha: 0.08 })
    this.detailText = this.add
      .text(rightX - colW / 2 + 20, ry + 38, '', {
        fontFamily: 'ui-monospace, monospace', fontSize: FONT.caption, color: '#e6e6ee', lineSpacing: 5, resolution: res,
      })
      .setOrigin(0, 0)

    this.startX = rightX
    this.startY = ry + 322
    this.mkButton(rightX, this.startY, Math.min(400, colW), 68, '开始基准', 0xffdc5d, 1, () => this.startBench(), '#25262e')

    this.refresh()
  }

  private mkButton(
    x: number, y: number, w: number, h: number, label: string,
    fill: number, alpha: number, onTap: () => void, color = '#ffffff',
  ): void {
    const g = this.add.graphics()
    roundRect(g, x - w / 2, y - h / 2, w, h, h / 2, { fill, fillAlpha: alpha })
    this.add
      .text(x, y, label, { fontFamily: UI_FONT, fontSize: FONT.small, color, resolution: textRes() })
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
    const cur = benchProfile()
    for (const t of this.profileRows) {
      t.bg.clear()
      const on = t.id === cur.id
      roundRect(t.bg, t.rect.x, t.rect.y, t.rect.w, t.rect.h, 14, {
        fill: on ? 0xffdc5d : 0x000000, fillAlpha: on ? 0.18 : 0.24,
        stroke: on ? 0xffdc5d : 0xffffff, strokeAlpha: on ? 0.7 : 0.08, strokeWidth: on ? 2 : 1,
      })
    }
    this.fwText?.setText(
      benchFramework() === 'arcade'
        ? '▲ arcade：一实体一 GameObject + Arcade Physics body'
        : '▲ ECS：bitECS 数据导向 + 自绘批量渲染',
    )
    this.detailText?.setText([
      `队伍规模  ${String(cur.team).padStart(5)} 人（真实角色，能力自动开火）`,
      `角色等级  ${['基础', '一阶', '二阶'][cur.level]!.padStart(5)}（换整套能力形态）`,
      `我方攻速  ${`×${cur.fireRate}`.padStart(5)}（冷却 ÷ 它 → 弹幕密度）`,
      '',
      `刷怪间隔  ${String(cur.spawn.intervalMs).padStart(5)} ms`,
      `在场上限  ${String(cur.spawn.cap).padStart(5)} 只`,
      `每批投放  ${String(cur.spawn.batch).padStart(5)} 只`,
      `敌人血量  ${`×${cur.difficulty}`.padStart(5)}（活得越久堆得越多）`,
      `敌人种类  ${String(cur.kinds).padStart(5)} 种`,
      '',
      '免死开启：重载下队伍几秒就没，',
      '测不到稳态',
    ])
    this.report()
  }

  private startBench(): void {
    setBenchActive(true)
    applyBenchProfile()
    resetMetrics()
    resetRenderProbe()
    const mapId = loadMap(undefined)
    beginRun(labCaptain(), labStarters(), mapId, true)
    this.scene.start(battleSceneFor(mapId))
  }

  private report(): void {
    const cur = benchProfile()
    reportDebug({
      scene: 'bench',
      elapsed: 0, hp: 0, alive: 0, kills: 0, level: 1, enemies: 0, pending: 0, fps: 0,
      viewW: viewport.logicalWidth, viewH: viewport.logicalHeight,
      playerX: 0, playerY: 0, camX: 0, camY: 0,
      bench: {
        start: { x: this.startX, y: this.startY },
        framework: benchFramework(),
        profile: cur.id,
        team: cur.team,
        cap: cur.spawn.cap,
      },
    })
  }
}
