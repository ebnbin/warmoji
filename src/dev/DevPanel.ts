import Phaser from 'phaser'
import { CHARACTERS } from '../data/characters'
import { mapEnemyRoster } from '../data/maps'
import type { CharacterId } from '../types/characters'
import {
  applyLabPreset,
  isLabCharacterOn,
  isLabEnemyOn,
  labCaptain,
  labDifficulty,
  labFireRate,
  labInvincible,
  labLevel,
  labPresetId,
  labScale,
  labStarters,
  LAB_PRESETS,
  SCALES,
  setLabDifficulty,
  setLabFireRate,
  setLabInvincible,
  setLabLevel,
  setLabScale,
  toggleLabCharacter,
  toggleLabEnemy,
} from '../run/lab'
import type { LabLevel, LabMul } from '../run/lab'
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

// 开发者面板：战斗内唯一的开发者入口，🔧 药丸点开即整块卡片。
//
// 它替掉了此前并存的三块东西：试炼场的 chip 面板（左上）、🔧 的 dev 文本读数
//（左下）、性能基准的读数面板（右侧）。三者的门槛各不相同、还互相打架
//（基准模式下要显式把试炼场面板关掉，否则两块面板叠在一起），实际是同一件事
// 被切成了三份。合成一块带页签的卡片后，「这一局能调什么、能看什么」只有一个答案。
//
// 页签按上下文启用：正式局只有「性能」（战场/队伍旋钮会毁掉一局正式游戏），
// 试炼场四页全开。面板本身只在设置里开了「开发者模式」时才由 UIScene 挂载。
//
// 改旋钮**只重建面板自己**，不再 restart 整个 UIScene——只有真正需要重建队伍的
// 改动（角色/等级/预设）才重开战斗场景。

const DEPTH = 320
/** 收起时把滚动区挪出画面：它的滚轮/拖动监听常驻，留在原位会吞掉战场上的手势 */
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
    // 滚动区只建一次：它的滚轮/拖动监听挂在 scene.input 上，每次开合都新建会一路累积
    this.view = new ScrollView(scene, OFFSCREEN)
    this.view.setDepth(DEPTH + 4)
    this.rebuild()
  }

  /** 每帧调用；只有「性能」页有逐帧内容 */
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
    // 试炼场四页全开；正式局只留「性能」——战场/队伍旋钮会毁掉一局正式游戏
    if (!this.host.testMode && tab !== 'perf') tab = 'perf'
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
    // 让开右上角的击杀/金币/暂停三件 HUD——面板不该盖住玩家自己的读数
    const y = safeInsets.top + 150
    const h = viewport.logicalHeight - safeInsets.bottom - M - y

    const g = this.scene.add.graphics().setDepth(DEPTH)
    roundRect(g, x, y, w, h, 16, {
      fill: 0x05060a, fillAlpha: 0.9, stroke: 0xffdc5d, strokeAlpha: 0.45, strokeWidth: 2,
    })
    // 吞输入：浮动摇杆按「有没有点在可交互 UI 上」决定要不要起手，
    // 没有这块底板的话在面板上滑动会同时把队伍拽着跑
    const blocker = this.scene.add.zone(x, y, w, h).setOrigin(0).setDepth(DEPTH + 1).setInteractive()
    this.objs.push(g, blocker)

    const headH = 50
    const label = this.host.testMode ? '开发者 · 试炼场' : '开发者'
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
    const defs: { id: DevTab; label: string }[] = this.host.testMode
      ? [
          { id: 'field', label: '战场' },
          { id: 'team', label: '队伍' },
          { id: 'preset', label: '强度' },
          { id: 'perf', label: '性能' },
        ]
      : [{ id: 'perf', label: '性能' }]
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

  /** 战场：敌人 / 规模 / 难度 / 攻速 / 无敌——全部实时生效，不重开战斗 */
  private buildField(res: number): number {
    let y = 0
    // 只列本图会出现的敌人（波次编排 + 终波 Boss + 衍生子代），不混入他图的怪
    y = this.section('敌人 · 实时生效', y, res, mapEnemyRoster(this.host.run.mapId).map((d) => ({
      label: d.name,
      on: isLabEnemyOn(d.kind),
      tap: (): void => {
        toggleLabEnemy(d.kind)
        this.rebuild()
      },
    })))
    // 规模阶梯整条铺开：面板选得到的就是刷怪器的全部量程
    y = this.section('规模 · 在场上限', y + 12, res, SCALES.map((s) => ({
      label: `${s.label} ${s.spawn.cap}`,
      on: labScale() === s.id,
      tap: (): void => {
        setLabScale(s.id)
        this.rebuild()
      },
    })))
    const muls: LabMul[] = [1, 3, 10]
    y = this.section('难度 · 敌人血量', y + 12, res, muls.map((m) => ({
      label: `×${m}`,
      on: labDifficulty() === m,
      tap: (): void => {
        setLabDifficulty(m)
        this.rebuild()
      },
    })))
    y = this.section('攻速 · 我方冷却 ÷ 它', y + 12, res, muls.map((m) => ({
      label: `×${m}`,
      on: labFireRate() === m,
      tap: (): void => {
        setLabFireRate(m)
        this.rebuild()
      },
    })))
    // 无敌切换即时改写全队血量上限，再重渲面板
    const setInv = (on: boolean): void => {
      setLabInvincible(on)
      this.host.applyTestInvincible()
      this.rebuild()
    }
    y = this.section('无敌', y + 12, res, [
      { label: '开', on: labInvincible(), tap: (): void => setInv(true) },
      { label: '关', on: !labInvincible(), tap: (): void => setInv(false) },
    ])
    return y + 8
  }

  /** 队伍：角色与等级——都要重建队伍，故改完重开战斗场景 */
  private buildTeam(res: number): number {
    let y = this.note(0, res, `当前 ${labStarters().length} 人 · 改动后重建队伍`)
    y = this.section('角色 · 最少 1 最多 8', y + 6, res, Object.entries(CHARACTERS).map(([id, c]) => ({
      label: c.name,
      on: isLabCharacterOn(id as CharacterId),
      tap: (): void => {
        toggleLabCharacter(id as CharacterId)
        this.restartWithTeam()
      },
    })))
    const levels: { lv: LabLevel; label: string }[] = [
      { lv: 0, label: '基础' },
      { lv: 1, label: '一阶' },
      { lv: 2, label: '二阶' },
    ]
    y = this.section('角色等级 · 换整套能力形态', y + 12, res, levels.map((l) => ({
      label: l.label,
      on: labLevel() === l.lv,
      tap: (): void => {
        setLabLevel(l.lv)
        this.restartWithTeam()
      },
    })))
    return y + 8
  }

  /** 强度：一组旋钮的具名取值，点一下批量写进去 */
  private buildPresets(res: number): number {
    const cur = labPresetId()
    let y = this.note(
      0,
      res,
      cur === undefined
        ? '当前：自定义（旋钮被手动改过）'
        : `当前：${LAB_PRESETS.find((p) => p.id === cur)?.label ?? cur}`,
    )
    y += 6
    const w = this.view.viewport.w
    for (const p of LAB_PRESETS) {
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
          applyLabPreset(p.id)
          this.restartWithTeam()
        })
      this.view.add([bg, label, desc, zone])
      y += rowH + 8
    }
    return y
  }

  /** 性能：框架对照 + 帧读数 */
  private buildPerf(res: number): number {
    // 框架就是设置里那一个开关，不另设覆写——「用哪套战斗」只有一个真相。
    // 放在这里是因为 A/B 对照要在同一份负载下来回切，回设置页太远
    const ecsOn = loadSettings(browserStorage()).ecs
    let y = this.section('框架 · 即设置里的「ECS 实验战斗」', 0, res, [
      { label: 'arcade', on: !ecsOn, tap: (): void => this.switchFramework(false) },
      { label: 'ECS', on: ecsOn, tap: (): void => this.switchFramework(true) },
    ])
    y = this.note(y + 4, res, ecsOn
      ? 'ECS：bitECS 数据导向 + 自绘批量渲染'
      : 'arcade：一实体一 GameObject + Arcade Physics body')
    this.perf = new PerfView(this.scene, this.host, this.view.viewport.w, y + 10)
    this.view.add(this.perf.objects)
    this.perfH = this.perf.update(0)
    return this.perfH
  }

  // ── 控件 ──────────────────────────────────────────────────

  /** 一段带标题的 chip 流式布局（坐标相对内容顶）：chip 按内容宽自适应、
   * 排满一行自动换行——名字再长也不会横向溢出。返回本段底部 y */
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
      // 先量文字再画底：chip 宽度跟着内容走，中英混排都不会挤
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

  /** 一行灰色说明文字（自动换行），返回其底部 y */
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

  /** 角色/等级/预设：配装与站位在建队员时定死，只能重建队伍。
   * 战斗场景重启会连带重启 UIScene，本面板随之按新状态重渲 */
  private restartWithTeam(): void {
    beginRun(labCaptain(), labStarters(), this.host.run.mapId, true)
    resetMetrics()
    this.host.scene.restart()
  }

  /** 切框架：改的就是设置里那一个开关，然后按新开关重新路由战斗场景 */
  private switchFramework(ecs: boolean): void {
    const s = loadSettings(browserStorage())
    if (s.ecs === ecs) return
    saveSettings(browserStorage(), { ...s, ecs })
    resetMetrics()
    // 新战斗场景会在自己的 create 里重新 launch HUD，故先停掉当前这份
    this.scene.scene.stop('ui')
    this.host.scene.start(battleSceneFor(this.host.run.mapId))
  }
}
