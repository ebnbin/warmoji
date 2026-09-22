import Phaser from 'phaser'
import { CHARACTERS } from '../data/characters'
import { mapEnemyRoster } from '../data/maps'
import type { CharacterId } from '../types/characters'
import {
  applySandboxPreset,
  isSandboxCharacterOn,
  isSandboxEnemyOn,
  sandboxCaptain,
  sandboxDifficulty,
  sandboxFireRate,
  sandboxInvincible,
  sandboxLevel,
  sandboxPresetId,
  sandboxScale,
  sandboxStarters,
  SANDBOX_PRESETS,
  SCALES,
  setSandboxDifficulty,
  setSandboxFireRate,
  setSandboxInvincible,
  setSandboxLevel,
  setSandboxScale,
  toggleSandboxCharacter,
  toggleSandboxEnemy,
} from '../run/sandbox'
import type { SandboxLevel, SandboxMul } from '../run/sandbox'
import { beginRun } from '../run/state'
import type { HudHost } from '../run/hudHost'
import { battleSceneFor } from '../battle'
import { loadSettings, saveSettings } from '../save/settings'
import { browserStorage } from '../util/storage'
import { ScrollView } from '../ui/scroll'
import { roundRect } from '../ui/shapes'
import { FONT, UI_FONT } from '../util/fonts'
import { safeInsets, textRes, viewport } from '../util/apply'
import { playSfx } from '../audio/sfx'
import { emojiImage } from '../emoji/textures'
import { attachMetrics, detachMetrics, resetMetrics } from './metrics'
import { startRafMeter } from './diagnostics'
import { PerfView } from './perf'
import { clearDevPerf } from './probe'

const DEPTH = 320
/** 收起时滚动区挪出画面：其监听常驻，留在原位会吞掉战场手势 */
const OFFSCREEN = { x: -10_000, y: -10_000, w: 0, h: 0 }

export type DevTab = 'field' | 'team' | 'preset' | 'perf'

// 开合与页签挂模块级：视口变化会重启 UIScene，挂实例上会被一起重置
let open = false
let tab: DevTab = 'field'

interface ChipItem {
  readonly label: string
  readonly on: boolean
  readonly tap: () => void
}

export class DevPanel {
  private objs: Phaser.GameObjects.GameObject[] = []
  private readonly view: ScrollView
  private perf?: PerfView
  private perfH = 0

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly host: HudHost,
  ) {
    // 只建一次：其监听挂在 scene.input 上，重建会累积
    this.view = new ScrollView(scene, OFFSCREEN)
    this.view.setDepth(DEPTH + 4)
    this.rebuild()
  }

  /** 每帧调用 */
  update(time: number): void {
    if (!this.perf) return
    const h = this.perf.update(time)
    if (Math.abs(h - this.perfH) > 1) {
      this.perfH = h
      this.view.setContentHeight(h)
    }
  }

  destroy(): void {
    this.clearObjs()
    this.view.destroy()
    detachMetrics()
    clearDevPerf()
  }

  private clearObjs(): void {
    for (const o of this.objs) o.destroy()
    this.objs = []
    this.perf = undefined
    this.perfH = 0
    this.view.clear()
  }

  private toggle(): void {
    playSfx('click')
    open = !open
    this.rebuild()
  }

  private rebuild(): void {
    this.clearObjs()
    // 正式局只留性能页
    if (!this.host.sandbox && tab !== 'perf') tab = 'perf'
    if (!open) {
      this.view.setViewport(OFFSCREEN)
      detachMetrics()
      clearDevPerf()
      this.buildPill()
      return
    }
    startRafMeter()
    attachMetrics(this.scene.game)
    this.buildCard()
  }

  // ── 收起态：右下角一颗 🔧 药丸 ────────────────────────────

  private buildPill(): void {
    const r = 34
    const cx = viewport.logicalWidth - safeInsets.right - 12 - r
    const cy = viewport.logicalHeight - safeInsets.bottom - 12 - r
    const g = this.scene.add.graphics().setDepth(DEPTH)
    roundRect(g, cx - r, cy - r, r * 2, r * 2, r, {
      fill: 0x05060a, fillAlpha: 0.6, stroke: 0xffdc5d, strokeAlpha: 0.45, strokeWidth: 2,
    })
    const icon = emojiImage(this.scene, cx, cy, '1f527', 40).setDepth(DEPTH + 1).setAlpha(0.92)
    const zone = this.scene.add
      .zone(cx - r, cy - r, r * 2, r * 2)
      .setOrigin(0)
      .setDepth(DEPTH + 2)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.toggle())
    this.objs.push(g, icon, zone)
  }

  // ── 展开态：标题栏 + 页签 + 内容 ──────────────────────────

  private buildCard(): void {
    const res = textRes()
    const M = 12
    const w = Math.min(470, viewport.logicalWidth - safeInsets.left - safeInsets.right - M * 2)
    const x = viewport.logicalWidth - safeInsets.right - M - w
    const y = safeInsets.top + 150
    const h = viewport.logicalHeight - safeInsets.bottom - M - y

    const g = this.scene.add.graphics().setDepth(DEPTH)
    roundRect(g, x, y, w, h, 16, {
      fill: 0x05060a, fillAlpha: 0.9, stroke: 0xffdc5d, strokeAlpha: 0.45, strokeWidth: 2,
    })
    // 底板吞输入，否则在面板上滑动会拽动摇杆
    const blocker = this.scene.add.zone(x, y, w, h).setOrigin(0).setDepth(DEPTH + 1).setInteractive()
    this.objs.push(g, blocker)

    const headH = 50
    const label = this.host.sandbox ? '开发者 · 试炼场' : '开发者'
    this.objs.push(
      this.scene.add
        .text(x + 16, y + headH / 2, label, {
          fontFamily: UI_FONT, fontSize: FONT.strong, fontStyle: 'bold', color: '#ffdc5d', resolution: res,
        })
        .setOrigin(0, 0.5)
        .setDepth(DEPTH + 2),
      this.scene.add
        .text(x + w - 16, y + headH / 2, '收起 ⌄', {
          fontFamily: UI_FONT, fontSize: FONT.small, color: '#c8c8d4', resolution: res,
        })
        .setOrigin(1, 0.5)
        .setDepth(DEPTH + 2),
      this.scene.add
        .zone(x, y, w, headH)
        .setOrigin(0)
        .setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => this.toggle()),
    )

    const tabsY = y + headH
    const tabsH = this.buildTabs(x, tabsY, w, res)
    const top = tabsY + tabsH + 10
    this.view.setViewport({ x: x + 14, y: top, w: w - 28, h: y + h - top - 12 })
    this.view.scrollTo(0)

    const contentH =
      tab === 'perf' ? this.buildPerf(res)
        : tab === 'preset' ? this.buildPresets(res)
          : tab === 'team' ? this.buildTeam(res)
            : this.buildField(res)
    this.view.setContentHeight(contentH)
  }

  private buildTabs(x: number, y: number, w: number, res: number): number {
    const defs: { id: DevTab; label: string }[] = this.host.sandbox
      ? [
          { id: 'field', label: '战场' },
          { id: 'team', label: '队伍' },
          { id: 'preset', label: '强度' },
          { id: 'perf', label: '性能' },
        ]
      : []
    if (defs.length === 0) return 0
    const h = 44
    const pad = 12
    const cw = (w - pad * 2) / defs.length
    defs.forEach((d, i) => {
      const active = d.id === tab
      const cx = x + pad + i * cw
      const bg = this.scene.add.graphics().setDepth(DEPTH + 2)
      roundRect(bg, cx + 2, y, cw - 4, h, 10, {
        fill: active ? 0xffdc5d : 0xffffff,
        fillAlpha: active ? 0.9 : 0.07,
        stroke: 0xffffff,
        strokeAlpha: active ? 0 : 0.12,
      })
      const t = this.scene.add
        .text(cx + cw / 2, y + h / 2, d.label, {
          fontFamily: UI_FONT, fontSize: FONT.small, fontStyle: active ? 'bold' : 'normal',
          color: active ? '#25262e' : '#c8c8d4', resolution: res,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH + 3)
      const z = this.scene.add
        .zone(cx, y, cw, h)
        .setOrigin(0)
        .setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (tab === d.id) return
          playSfx('click')
          tab = d.id
          this.rebuild()
        })
      this.objs.push(bg, t, z)
    })
    return h
  }

  // ── 内容：各页 ────────────────────────────────────────────

  private buildField(res: number): number {
    let y = 0
    y = this.section('敌人 · 实时生效', y, res, mapEnemyRoster(this.host.run.mapId).map((d) => ({
      label: d.name,
      on: isSandboxEnemyOn(d.kind),
      tap: (): void => {
        toggleSandboxEnemy(d.kind)
        this.rebuild()
      },
    })))
    y = this.section('规模 · 在场上限', y + 12, res, SCALES.map((s) => ({
      label: `${s.label} ${s.spawn.cap}`,
      on: sandboxScale() === s.id,
      tap: (): void => {
        setSandboxScale(s.id)
        this.rebuild()
      },
    })))
    const muls: SandboxMul[] = [1, 3, 10]
    y = this.section('难度 · 敌人血量', y + 12, res, muls.map((m) => ({
      label: `×${m}`,
      on: sandboxDifficulty() === m,
      tap: (): void => {
        setSandboxDifficulty(m)
        this.rebuild()
      },
    })))
    y = this.section('攻速 · 我方冷却 ÷ 它', y + 12, res, muls.map((m) => ({
      label: `×${m}`,
      on: sandboxFireRate() === m,
      tap: (): void => {
        setSandboxFireRate(m)
        this.rebuild()
      },
    })))
    const setInv = (on: boolean): void => {
      setSandboxInvincible(on)
      this.host.applySandboxInvincible()
      this.rebuild()
    }
    y = this.section('无敌', y + 12, res, [
      { label: '开', on: sandboxInvincible(), tap: (): void => setInv(true) },
      { label: '关', on: !sandboxInvincible(), tap: (): void => setInv(false) },
    ])
    return y + 8
  }

  private buildTeam(res: number): number {
    let y = this.note(0, res, `当前 ${sandboxStarters().length} 人 · 改动后重建队伍`)
    y = this.section('角色 · 最少 1 最多 8', y + 6, res, Object.entries(CHARACTERS).map(([id, c]) => ({
      label: c.name,
      on: isSandboxCharacterOn(id as CharacterId),
      tap: (): void => {
        toggleSandboxCharacter(id as CharacterId)
        this.restartWithTeam()
      },
    })))
    const levels: { lv: SandboxLevel; label: string }[] = [
      { lv: 0, label: '基础' },
      { lv: 1, label: '一阶' },
      { lv: 2, label: '二阶' },
    ]
    y = this.section('角色等级 · 换整套能力形态', y + 12, res, levels.map((l) => ({
      label: l.label,
      on: sandboxLevel() === l.lv,
      tap: (): void => {
        setSandboxLevel(l.lv)
        this.restartWithTeam()
      },
    })))
    return y + 8
  }

  private buildPresets(res: number): number {
    const cur = sandboxPresetId()
    let y = this.note(
      0,
      res,
      cur === undefined
        ? '当前：自定义（旋钮被手动改过）'
        : `当前：${SANDBOX_PRESETS.find((p) => p.id === cur)?.label ?? cur}`,
    )
    y += 6
    const w = this.view.viewport.w
    for (const p of SANDBOX_PRESETS) {
      const on = p.id === cur
      const rowH = 62
      const bg = this.scene.add.graphics()
      roundRect(bg, 0, y, w, rowH, 12, {
        fill: on ? 0xffdc5d : 0xffffff, fillAlpha: on ? 0.16 : 0.06,
        stroke: on ? 0xffdc5d : 0xffffff, strokeAlpha: on ? 0.7 : 0.12, strokeWidth: on ? 2 : 1,
      })
      const label = this.scene.add
        .text(14, y + 18, p.label, {
          fontFamily: UI_FONT, fontSize: FONT.small, fontStyle: 'bold', color: '#ffffff', resolution: res,
        })
        .setOrigin(0, 0.5)
      const desc = this.scene.add
        .text(14, y + 42, p.desc, {
          fontFamily: UI_FONT, fontSize: FONT.caption, color: '#9a9aa8', resolution: res,
        })
        .setOrigin(0, 0.5)
      const zone = this.scene.add
        .zone(0, y, w, rowH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (this.view.wasDragged) return
          playSfx('click')
          applySandboxPreset(p.id)
          this.restartWithTeam()
        })
      this.view.add([bg, label, desc, zone])
      y += rowH + 8
    }
    return y
  }

  private buildPerf(res: number): number {
    const ecsOn = loadSettings(browserStorage()).ecs
    let y = this.section('框架 · 即设置里的「ECS 实验战斗」', 0, res, [
      { label: 'arcade', on: !ecsOn, tap: (): void => this.switchFramework(false) },
      { label: 'ECS', on: ecsOn, tap: (): void => this.switchFramework(true) },
    ])
    y = this.note(y + 4, res, ecsOn
      ? 'ECS：bitECS 数据导向 + 自绘批量渲染'
      : 'arcade：一实体一 GameObject + Arcade Physics body')
    this.perf = new PerfView(this.scene, this.host, this.view.viewport.w, y + 10, this.host.sandbox)
    this.view.add(this.perf.objects)
    this.perfH = this.perf.update(0)
    return this.perfH
  }

  // ── 控件 ──────────────────────────────────────────────────

  /** 坐标相对内容顶；返回本段底部 y */
  private section(title: string, gy: number, res: number, items: readonly ChipItem[]): number {
    const maxW = this.view.viewport.w
    const gap = 6
    this.view.add(
      this.scene.add.text(0, gy, title, {
        fontFamily: UI_FONT, fontSize: FONT.caption, fontStyle: 'bold', color: '#8a8a99', resolution: res,
      }),
    )
    let cx = 0
    let cy = gy + 26
    const chipH = 40
    for (const it of items) {
      const t = this.scene.add.text(0, 0, it.label, {
        fontFamily: UI_FONT, fontSize: FONT.caption,
        color: it.on ? '#25262e' : '#d6d6e0', resolution: res,
      })
      const cw = t.width + 24
      if (cx > 0 && cx + cw > maxW) {
        cx = 0
        cy += chipH + gap
      }
      const bg = this.scene.add.graphics()
      roundRect(bg, cx, cy, cw, chipH, 10, {
        fill: it.on ? 0xffdc5d : 0xffffff, fillAlpha: it.on ? 0.92 : 0.09,
        stroke: 0xffffff, strokeAlpha: it.on ? 0 : 0.14,
      })
      t.setPosition(cx + cw / 2, cy + chipH / 2).setOrigin(0.5)
      const z = this.scene.add
        .zone(cx, cy, cw, chipH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (this.view.wasDragged) return
          playSfx('click')
          it.tap()
        })
      this.view.add([bg, t, z])
      cx += cw + gap
    }
    return cy + chipH
  }

  /** 返回底部 y */
  private note(gy: number, res: number, text: string): number {
    const t = this.scene.add.text(0, gy, text, {
      fontFamily: UI_FONT, fontSize: FONT.caption, color: '#9a9aa8', resolution: res,
      wordWrap: { width: this.view.viewport.w },
      lineSpacing: 4,
    })
    this.view.add(t)
    return gy + t.height
  }

  // ── 需要重开战斗场景的改动 ────────────────────────────────

  /** 战斗场景重启会连带重启 UIScene */
  private restartWithTeam(): void {
    beginRun(sandboxCaptain(), sandboxStarters(), this.host.run.mapId, true)
    resetMetrics()
    this.host.scene.restart()
  }

  private switchFramework(ecs: boolean): void {
    const s = loadSettings(browserStorage())
    if (s.ecs === ecs) return
    saveSettings(browserStorage(), { ...s, ecs })
    resetMetrics()
    // 新战斗场景会在 create 里重新 launch HUD，须先停掉当前这份
    this.scene.scene.stop('ui')
    this.host.scene.start(battleSceneFor(this.host.run.mapId))
  }
}
