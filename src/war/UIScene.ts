import Phaser from 'phaser'
import { CAPTAINS } from '../data/captains'
import { PICKUPS } from '../data/pickups'
import { formatTime } from '../util/format'
import { endRun, getRun } from '../run/state'
// 能量豆已移除：技能纯 CD 门槛（见 captains/skill.ts）
import { isDevOpen, setDevOpen } from './dev'
import { CHARACTERS } from '../data/characters'
import type { CharacterId } from '../types/characters'
import { mapEnemyRoster } from '../data/maps'
import { beginRun } from '../run/state'
import {
  isLabCharacterOn,
  isLabEnemyOn,
  isLabPanelOpen,
  labCaptain,
  labDensity,
  labDifficulty,
  labFireRate,
  labInvincible,
  labLevel,
  labPanelScroll,
  labStarters,
  setLabDensity,
  setLabDifficulty,
  setLabFireRate,
  setLabInvincible,
  setLabLevel,
  setLabPanelOpen,
  setLabPanelScroll,
  toggleLabCharacter,
  toggleLabEnemy,
} from '../run/lab'
import type { LabDensity, LabLevel, LabMul } from '../run/lab'
import { heapMB, rafHz, rendererInfo, startRafMeter } from './diagnostics'
import { emojiCacheStats, emojiImage } from '../emoji/textures'
import { emojiText, iconLabel } from '../ui/emojiText'
import { ScrollView } from '../ui/scroll'
import { FONT, UI_FONT } from '../util/fonts'
import { Joystick } from '../ui/Joystick'
import { playSfx } from '../audio/sfx'
import {
  applyCamera,
  isStandalone,
  safeInsets,
  textRes,
  viewport,
  VIEWPORT_CHANGED,
} from '../util/apply'
import type { HudSnapshot, WaveSummary } from './hudHost'
import { activeHudHost } from './hudHost'
import type { HudHost } from './hudHost'
import { roundRect } from '../ui/shapes'
import { BenchPanel } from './benchPanel'
import { attachMetrics, detachMetrics } from '../bench/metrics'
import { clearBench } from '../bench/probe'
import { benchRefill, benchSpec, isBenchActive, setBenchActive } from '../bench/spec'

// 屏幕层：HUD、虚拟摇杆、升级提示、结算界面。
// 与 BoundedScene 并行运行，相机静止不随地图滚动，坐标即逻辑视口坐标。
export class UIScene extends Phaser.Scene {
  private joystick?: Joystick
  private xpBar!: Phaser.GameObjects.Graphics
  private timeText!: Phaser.GameObjects.Text
  private bossBar!: Phaser.GameObjects.Graphics
  private killsText!: Phaser.GameObjects.Text
  private coinsText!: Phaser.GameObjects.Text
  private last!: HudSnapshot
  private devText?: Phaser.GameObjects.Text
  private benchPanel?: BenchPanel
  private benchRefilledAt = 0
  private fpsWindowMin = Infinity
  private frameMaxMs = 0
  private fpsWindowStart = 0
  private devRefreshedAt = 0
  private paused = false
  private pauseObjs: Phaser.GameObjects.GameObject[] = []
  /** 试炼场控制面板的可滚动容器（敌人/角色列表随内容增长，不再堆出屏外） */
  private labView?: ScrollView
  // 队长技能按钮（左下角）：底圆 + 队长头像 + 冷却扇形暗罩 + 秒数 + 就绪光圈
  private skillBase?: Phaser.GameObjects.Arc
  private skillEmoji?: Phaser.GameObjects.Image
  private skillMask?: Phaser.GameObjects.Graphics
  private skillCdText?: Phaser.GameObjects.Text
  private skillRing?: Phaser.GameObjects.Arc
  private skillCenter = { x: 0, y: 0 }
  /** 队长头像的基准缩放（emojiImage 经 setDisplaySize 得到的小数 scale） */
  private skillEmojiScale = 1
  private skillWasReady = false
  private skillShownSec = -1
  private skillShownRatio = -1
  // 战场拾取效果指示（左上，经验条下方竖排）：图标随激活集变动重建，剩余时间条每帧重绘
  private fxIcons: Phaser.GameObjects.Image[] = []
  private fxBars?: Phaser.GameObjects.Graphics
  private fxKey = ''

  constructor() {
    super('ui')
  }

  get joystickVector(): { x: number; y: number } {
    return this.joystick?.vector ?? { x: 0, y: 0 }
  }

  /** 当前战斗场景，按 HUD 宿主契约取用（两套战斗实现都满足）。
   * 宿主在自己的 create 里登记，且先于 scene.launch('ui')，故此处必然已就位 */
  private get arena(): HudHost {
    return activeHudHost()!
  }

  create(): void {
    applyCamera(this)
    const res = textRes()
    const w = viewport.logicalWidth
    // 全屏贴边的 HUD 须避开刘海/状态栏/Home 条
    const { top: sT, right: sR } = safeInsets
    this.last = {
      xp: -1,
      xpNext: -1,
      level: -1,
      kills: -1,
      coins: -1,
      wave: -1,
      seconds: -1,
      remainMs: -1,
      over: false,
      bossHp: null,
      bossMaxHp: 1,
      battleFx: [],
    }

    this.joystick = new Joystick(this)

    this.xpBar = this.add.graphics()
    this.bossBar = this.add.graphics().setDepth(120)
    // 深色字 + 白描边：浅色地图与暗色背景（相机贴边时）上都可读
    const hudText = {
      fontFamily: UI_FONT,
      color: '#2b2b33',
      stroke: '#ffffff',
      strokeThickness: 3,
      resolution: res,
    }
    // 经验条 = 距下一次团队升级抽卡的进度（升级即在战斗后开卡页三选一）
    this.timeText = this.add
      .text(w / 2, sT + 10, '', { ...hudText, fontSize: FONT.lead })
      .setOrigin(0.5, 0)
    emojiImage(this, w - sR - 26, sT + 26, '1f480', 35, 'player')
    this.killsText = this.add
      .text(w - sR - 46, sT + 10, '0', { ...hudText, fontSize: FONT.head })
      .setOrigin(1, 0)
    emojiImage(this, w - sR - 26, sT + 64, PICKUPS.coin.emoji, 35, 'player')
    this.coinsText = this.add
      .text(w - sR - 46, sT + 48, '0', { ...hudText, fontSize: FONT.head })
      .setOrigin(1, 0)

    // 暂停：按钮或 ESC；已暂停或已结算时按钮行为由 togglePause 把关
    emojiImage(this, w - sR - 26, sT + 112, '23f8', 48)
      .setDepth(300)
      .setAlpha(0.85)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.togglePause())
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause())
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.paused) this.togglePause()
    })

    const wrench = emojiImage(
      this,
      w - sR - 12,
      viewport.logicalHeight - safeInsets.bottom - 26,
      '1f527',
      40,
    )
      .setOrigin(1, 1)
      .setDepth(300)
      .setAlpha(0.45)
      .setInteractive({ useHandCursor: true })
    wrench.on('pointerdown', () => {
      if (this.paused) return
      setDevOpen(!isDevOpen())
      this.scene.restart()
    })
    if (isDevOpen()) this.createDevPanel(res)
    if (isBenchActive()) {
      startRafMeter()
      attachMetrics(this.game)
      this.benchPanel = new BenchPanel(this, this.arena)
      // B 键：停止基准并回配置页（面板上有提示）
      this.input.keyboard?.on('keydown-B', () => {
        setBenchActive(false)
        detachMetrics()
        clearBench()
        this.scene.stop('ui')
        this.arena.scene.start('bench')
      })
    }
    // 基准模式下不挂试炼场面板：它会挡住画面、且其旋钮会干扰负载
    if (this.arena.testMode && !isBenchActive()) this.createLabControls()

    this.createSkillButton(res)
    this.createFxIndicators()

    const arenaEvents = this.arena.events
    arenaEvents.on('wave-complete', this.onWaveComplete, this)
    arenaEvents.on('wave-warning', this.onWaveWarning, this)
    arenaEvents.on('skill-cast', this.onSkillCast, this)
    arenaEvents.on('field-collected', this.onFieldCollected, this)
    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      arenaEvents.off('wave-complete', this.onWaveComplete, this)
      arenaEvents.off('wave-warning', this.onWaveWarning, this)
      arenaEvents.off('skill-cast', this.onSkillCast, this)
      arenaEvents.off('field-collected', this.onFieldCollected, this)
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
      // devText 在 SHUTDOWN 里随场景对象一起销毁；清引用，否则关闭 dev 后
      // restart 不重建面板，update 仍对已销毁的 Text 调 setText → 渲染撞空 → 卡死
      this.devText = undefined
      this.benchPanel?.destroy()
      this.benchPanel = undefined
    })

    // 视口变化会重启本场景：恢复暂停浮层
    if (this.arena.scene.isPaused()) {
      this.paused = true
      this.showPauseOverlay()
    }
  }

  // ── 暂停 ────────────────────────────────────────────────────

  private togglePause(): void {
    if (this.paused) {
      this.paused = false
      for (const o of this.pauseObjs) o.destroy()
      this.pauseObjs = []
      this.arena.scene.resume()
    } else {
      this.paused = true
      this.arena.scene.pause()
      this.showPauseOverlay()
    }
  }

  private showPauseOverlay(): void {
    const res = textRes()
    const cx = viewport.logicalWidth / 2
    const cy = viewport.logicalHeight / 2
    const button = (
      y: number,
      label: string,
      filled: boolean,
      onTap: () => void,
    ): Phaser.GameObjects.GameObject[] => {
      const rect = { x: cx - 150, y: y - 36, w: 300, h: 72 }
      const g = this.add.graphics().setDepth(251)
      if (filled) {
        roundRect(g, rect.x, rect.y, rect.w, rect.h, 36, { fill: 0xffdc5d })
      } else {
        roundRect(g, rect.x, rect.y, rect.w, rect.h, 36, { fill: 0xffffff, fillAlpha: 0.12, stroke: 0xffffff, strokeAlpha: 0.35 })
      }
      const t = this.add
        .text(cx, y, label, {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: filled ? '#25262e' : '#ffffff',
          resolution: res,
        })
        .setOrigin(0.5)
        .setDepth(252)
      const z = this.add
        .zone(rect.x, rect.y, rect.w, rect.h)
        .setOrigin(0)
        .setDepth(252)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', onTap)
      return [g, t, z]
    }
    this.pauseObjs = [
      this.add.rectangle(cx, cy, 6000, 6000, 0x000000, 0.6).setDepth(250),
      this.add
        .text(cx, cy - 116, '已暂停', {
          fontFamily: UI_FONT,
          fontSize: FONT.big,
          fontStyle: 'bold',
          color: '#ffffff',
          resolution: textRes(),
        })
        .setOrigin(0.5)
        .setDepth(251),
      ...button(cy + 8, '继 续', true, () => this.togglePause()),
      ...button(cy + 100, '结束本局', false, () => {
        endRun()
        this.arena.scene.start('menu')
      }),
    ]
  }

  update(time: number): void {
    if (this.devText) this.updateDevPanel(time)
    if (this.benchPanel) {
      // 逐秒把在场数补回目标：实体会自然消亡（弹体飞出、金币被吸），不补就测不到稳态
      if (benchRefill() && time - this.benchRefilledAt > 1000) {
        this.benchRefilledAt = time
        this.arena.benchFill(benchSpec())
      }
      this.benchPanel.update(time)
    }
    this.updateSkillButton()
    const s = this.arena.hudSnapshot()
    this.updateFxIndicators(s.battleFx)
    if (s.xp !== this.last.xp || s.xpNext !== this.last.xpNext) this.drawXpBar(s)
    if (s.kills !== this.last.kills) this.killsText.setText(String(s.kills))
    if (s.coins !== this.last.coins) this.coinsText.setText(String(s.coins))
    // 常规显示本波倒计时；测试模式无波次限时，显示已进行时间
    const remainSec = Math.ceil(s.remainMs / 1000)
    const lastRemainSec = Math.ceil(this.last.remainMs / 1000)
    if (s.wave !== this.last.wave || remainSec !== lastRemainSec || s.seconds !== this.last.seconds) {
      this.timeText.setText(
        this.arena.testMode ? formatTime(s.seconds) : `第${s.wave}波 ${formatTime(remainSec)}`,
      )
    }
    if (s.bossHp !== this.last.bossHp) this.drawBossBar(s)
    this.last = s
  }

  /** 终波 Boss 血条：波次计时下方居中的红条 */
  private drawBossBar(s: HudSnapshot): void {
    const g = this.bossBar
    g.clear()
    if (s.bossHp === null) return
    const w = 320
    const x = viewport.logicalWidth / 2 - w / 2
    const y = safeInsets.top + 56
    roundRect(g, x, y, w, 16, 8, { fill: 0x000000, fillAlpha: 0.55 })
    const ratio = Math.max(0, Math.min(1, s.bossHp / s.bossMaxHp))
    roundRect(g, x + 2, y + 2, Math.max(6, (w - 4) * ratio), 12, 6, { fill: 0xef5350 })
  }

  /** 节点波警示横幅：短暂弹出后淡出（精英潮 / Boss 登场） */
  private onWaveWarning(w: { title: string; sub: string }): void {
    const res = textRes()
    const cx = viewport.logicalWidth / 2
    const cy = viewport.logicalHeight * 0.3
    playSfx('over')
    const wrapW = viewport.logicalWidth - 80
    const title = this.add
      .text(cx, cy, w.title, {
        fontFamily: UI_FONT,
        fontSize: FONT.banner,
        fontStyle: 'bold',
        color: '#ff8a80',
        stroke: '#2b0000',
        strokeThickness: 6,
        align: 'center',
        wordWrap: { width: wrapW },
        resolution: res,
      })
      .setOrigin(0.5)
      .setDepth(226)
    const sub = this.add
      .text(cx, cy + 58, w.sub, {
        fontFamily: UI_FONT,
        fontSize: FONT.head,
        color: '#ffdc5d',
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center',
        wordWrap: { width: wrapW },
        resolution: res,
      })
      .setOrigin(0.5)
      .setDepth(226)
    title.setScale(0.5)
    this.tweens.add({ targets: title, scale: 1, duration: 300, ease: 'Back.easeOut' })
    this.tweens.add({
      targets: [title, sub],
      alpha: 0,
      delay: 2300,
      duration: 500,
      onComplete: () => {
        title.destroy()
        sub.destroy()
      },
    })
  }

  // ── 队长主动技能按钮（左下角）────────────────────────────────

  private createSkillButton(res: number): void {
    const r = 55
    const cx = safeInsets.left + r + 24
    const cy = viewport.logicalHeight - safeInsets.bottom - r - 24
    this.skillCenter = { x: cx, y: cy }
    this.skillWasReady = false
    this.skillShownSec = -1
    this.skillShownRatio = -1
    this.skillBase = this.add
      .circle(cx, cy, r, 0x000000, 0.38)
      .setStrokeStyle(3, 0xffffff, 0.28)
      .setDepth(300)
    this.skillEmoji = emojiImage(this, cx, cy, CAPTAINS[getRun().captainId].emoji, 76, 'player').setDepth(301)
    this.skillEmojiScale = this.skillEmoji.scaleX
    this.skillMask = this.add.graphics().setDepth(302)
    this.skillCdText = this.add
      .text(cx, cy, '', {
        fontFamily: UI_FONT,
        fontSize: FONT.head,
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
        resolution: res,
      })
      .setOrigin(0.5)
      .setDepth(303)
    this.skillRing = this.add
      .circle(cx, cy, r + 6, 0x000000, 0)
      .setStrokeStyle(3, 0xffdc5d, 0.9)
      .setDepth(303)
      .setVisible(false)
    this.add
      .zone(cx - r, cy - r, r * 2, r * 2)
      .setOrigin(0)
      .setDepth(304)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.tryCastSkill())
    this.input.keyboard?.on('keydown-E', () => this.tryCastSkill())
  }

  private tryCastSkill(): void {
    if (this.paused) return
    this.arena.castSkill()
  }

  /** 逐帧刷新按钮状态：冷却中扇形暗罩（脏检查）；就绪时光圈呼吸（纯 CD，无弹药态） */
  private updateSkillButton(): void {
    if (!this.skillMask) return
    const sk = this.arena.skillSnapshot()
    if (!sk) return
    if (sk.remainMs > 0) {
      const remainSec = Math.ceil(sk.remainMs / 1000)
      const ratio = sk.cdMs > 0 ? sk.remainMs / sk.cdMs : 0
      if (this.skillWasReady || remainSec !== this.skillShownSec || Math.abs(ratio - this.skillShownRatio) > 0.01) {
        this.skillWasReady = false
        this.skillShownSec = remainSec
        this.skillShownRatio = ratio
        this.skillCdText?.setText(String(remainSec))
        this.skillEmoji?.setAlpha(0.4)
        this.skillRing?.setVisible(false)
        // 剩余冷却的扇形暗罩：从 12 点起顺时针，随充能收缩
        const g = this.skillMask
        g.clear()
        g.fillStyle(0x000000, 0.6)
        g.slice(this.skillCenter.x, this.skillCenter.y, 52, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2, false)
        g.fillPath()
      }
      return
    }
    if (!this.skillWasReady) {
      this.skillWasReady = true
      this.skillShownSec = -1
      this.skillMask.clear()
      this.skillCdText?.setText('')
      this.skillEmoji?.setAlpha(1)
      this.skillRing?.setVisible(true)
      // 就绪弹跳提示（各自按基准缩放做相对弹跳：emoji 的原生 scale 是小数，
      // 不能 tween 到绝对 1）
      const bump = (obj: Phaser.GameObjects.GameObject | undefined, base: number): void => {
        if (!obj) return
        this.tweens.add({
          targets: obj,
          scaleX: { from: base * 1.16, to: base },
          scaleY: { from: base * 1.16, to: base },
          duration: 260,
          ease: 'Back.easeOut',
        })
      }
      bump(this.skillBase, 1)
      bump(this.skillEmoji, this.skillEmojiScale)
    }
    this.skillRing?.setAlpha(0.5 + 0.4 * Math.sin(this.time.now / 240))
  }

  // ── 战场拾取效果指示（左上角，经验条下方竖排）───────────────

  private createFxIndicators(): void {
    this.fxIcons = []
    this.fxKey = ''
    this.fxBars = this.add.graphics().setDepth(121)
  }

  /** 激活集变动才重建图标（低频）；剩余时间条每帧重绘（绿=增益/红=减益） */
  private updateFxIndicators(list: HudSnapshot['battleFx']): void {
    const x = safeInsets.left + 26
    const y0 = safeInsets.top + 52
    const step = 40
    const key = list.map((f) => `${f.emoji}${f.polarity}`).join(',')
    if (key !== this.fxKey) {
      this.fxKey = key
      for (const o of this.fxIcons) o.destroy()
      this.fxIcons = list.map((f, i) =>
        emojiImage(this, x, y0 + i * step, f.emoji, 34, 'player').setDepth(121),
      )
    }
    const g = this.fxBars
    if (!g) return
    g.clear()
    const barW = 34
    list.forEach((f, i) => {
      const by = y0 + i * step + 20
      const ratio = f.totalMs > 0 ? Math.max(0, Math.min(1, f.remainMs / f.totalMs)) : 0
      roundRect(g, x - barW / 2, by, barW, 5, 2, { fill: 0x000000, fillAlpha: 0.5 })
      roundRect(g, x - barW / 2 + 0.5, by + 0.5, Math.max(2, (barW - 1) * ratio), 4, 2, { fill: f.polarity === 'buff' ? 0x66bb6a : 0xef5350 })
    })
  }

  /** 技能释放横幅：技能名短暂弹出（比波次警示小一号、更快收场） */
  private onSkillCast(name: string): void {
    const t = emojiText(
      this,
      viewport.logicalWidth / 2,
      viewport.logicalHeight * 0.36,
      `{26a1} ${name}`,
      {
        fontFamily: UI_FONT,
        fontSize: FONT.head,
        fontStyle: 'bold',
        color: '#ffdc5d',
        stroke: '#000000',
        strokeThickness: 5,
        align: 'center',
        wordWrap: { width: viewport.logicalWidth - 80 },
        resolution: textRes(),
      },
      { origin: 0.5 },
    )
      .setDepth(226)
      .setScale(0.6)
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' })
    this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 400, onComplete: () => t.destroy() })
  }

  /** 拾取战场增益/减益的到手横幅：名字 + 极性 + 效果说明（绿=增益/红=减益），
   * 让玩家明确知道刚拿到了什么、持续多久（HUD 左上图标是之后的常驻提醒） */
  private onFieldCollected(fx: {
    emoji: string
    name: string
    desc: string
    polarity: 'buff' | 'debuff'
  }): void {
    const res = textRes()
    const buff = fx.polarity === 'buff'
    const cx = viewport.logicalWidth / 2
    const cy = viewport.logicalHeight * 0.42
    const title = emojiText(
      this,
      cx,
      cy,
      `{${fx.emoji}} ${fx.name}`,
      {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: buff ? '#b9f6ca' : '#ff9e9e',
        stroke: '#000000',
        strokeThickness: 5,
        resolution: res,
      },
      { origin: 0.5 },
    )
      .setDepth(226)
      .setScale(0.6)
    const sub = this.add
      .text(cx, cy + 32, `${buff ? '增益' : '减益'} · ${fx.desc}`, {
        fontFamily: UI_FONT,
        fontSize: FONT.body,
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center',
        wordWrap: { width: viewport.logicalWidth - 80 },
        resolution: res,
      })
      .setOrigin(0.5, 0)
      .setDepth(226)
    this.tweens.add({ targets: title, scale: 1, duration: 220, ease: 'Back.easeOut' })
    this.tweens.add({
      targets: [title, sub],
      alpha: 0,
      delay: 1600,
      duration: 450,
      onComplete: () => {
        title.destroy()
        sub.destroy()
      },
    })
  }

  private onViewportChanged(): void {
    this.scene.restart()
  }

  private createDevPanel(res: number): void {
    startRafMeter()
    this.fpsWindowMin = Infinity
    this.frameMaxMs = 0
    this.fpsWindowStart = 0
    this.devRefreshedAt = 0
    const h = viewport.logicalHeight
    const btnY = h - safeInsets.bottom - 12
    this.devText = this.add
      .text(safeInsets.left + 12, btnY, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 8, y: 6 },
        lineSpacing: 4,
        resolution: res,
      })
      .setOrigin(0, 1)
      .setDepth(300)
      .setAlpha(0.88)
  }

  private static readonly CHIP_ON = '#2e7d32'
  private static readonly CHIP_OFF = '#555555'

  /** 试炼场控制面板（左上角）：🎯 按钮开合，内含 敌人/角色/等级/旋钮 多段勾选。
   * 敌人实时生效不重启；角色/等级改动后重开竞技场（重建队伍）——重开也会重渲本面板。
   * 各段勾选项随内容增长（敌人/角色只增不减），装进可滚动容器，绝不再堆出屏外 */
  private createLabControls(): void {
    const gx = safeInsets.left + 12
    const top = safeInsets.top + 62
    const open = isLabPanelOpen()
    this.add
      .text(gx, top, `试炼场设置：${open ? '收起' : '展开'}`, {
        fontFamily: UI_FONT,
        fontSize: FONT.caption,
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: '#3949ab',
        padding: { x: 10, y: 6 },
        resolution: textRes(),
      })
      .setDepth(300)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        setLabPanelOpen(!isLabPanelOpen())
        this.scene.restart()
      })
    if (!open) return

    // 面板从标题下方一直排到技能按钮上方；内容超出即滚动
    const viewTop = top + 34
    const skillTop = viewport.logicalHeight - safeInsets.bottom - 55 * 2 - 24
    const view = (this.labView = new ScrollView(
      this,
      { x: gx, y: viewTop, w: 372, h: Math.max(120, skillTop - viewTop - 12) },
      { initialScroll: labPanelScroll() },
    ))
    view.setDepth(300)
    view.onScroll = (): void => setLabPanelScroll(view.scrollY)

    // 角色/队长改动：用当前勾选阵容在当前地图上重开竞技场（shutdown→create 会重启本 UI，面板自动重渲）
    const applyTeam = (): void => {
      beginRun(labCaptain(), labStarters(), this.arena.run.mapId, true)
      this.arena.scene.restart()
    }
    let y = 0
    // 只列本图会出现的敌人（波次编排 + 终波 Boss + 衍生子代），不混入他图的怪
    y = this.labSection('敌人（实时）', y, mapEnemyRoster(this.arena.run.mapId).map((d) => ({
      label: d.name,
      on: () => isLabEnemyOn(d.kind),
      tap: (chip) => {
        toggleLabEnemy(d.kind)
        chip.setBackgroundColor(isLabEnemyOn(d.kind) ? UIScene.CHIP_ON : UIScene.CHIP_OFF)
      },
    })))
    y = this.labSection('角色 · 最少1最多8（改后重建队伍）', y + 8, Object.entries(CHARACTERS).map(([id, c]) => ({
      label: c.name,
      on: () => isLabCharacterOn(id as CharacterId),
      tap: () => {
        toggleLabCharacter(id as CharacterId)
        applyTeam()
      },
    })))
    // 角色等级：统一改全部角色的升级档（改后重建队伍——配装在建队员时定）
    const levels: { lv: LabLevel; label: string }[] = [
      { lv: 0, label: '基础' },
      { lv: 1, label: '一阶' },
      { lv: 2, label: '二阶' },
    ]
    y = this.labSection('角色等级（改后重建队伍）', y + 8, levels.map((l) => ({
      label: l.label,
      on: () => labLevel() === l.lv,
      tap: () => {
        setLabLevel(l.lv)
        this.arena.scene.restart()
      },
    })))
    // 旋钮实时生效（密度/难度/攻速由 arena 每帧现读，无敌见下）：只重渲本面板刷新选中态，
    // 不重开竞技场、不清场——观察不被打断
    const applyKnob = (): void => {
      this.scene.restart()
    }
    const densities: { k: LabDensity; label: string }[] = [
      { k: 'low', label: '低' },
      { k: 'mid', label: '中' },
      { k: 'high', label: '高' },
      { k: 'max', label: '爆满' },
    ]
    y = this.labSection('密度', y + 8, densities.map((d) => ({
      label: d.label,
      on: () => labDensity() === d.k,
      tap: () => {
        setLabDensity(d.k)
        applyKnob()
      },
    })))
    const muls: LabMul[] = [1, 3, 10]
    y = this.labSection('难度（敌人血量）', y + 8, muls.map((m) => ({
      label: `×${m}`,
      on: () => labDifficulty() === m,
      tap: () => {
        setLabDifficulty(m)
        applyKnob()
      },
    })))
    y = this.labSection('攻速（我方）', y + 8, muls.map((m) => ({
      label: `×${m}`,
      on: () => labFireRate() === m,
      tap: () => {
        setLabFireRate(m)
        applyKnob()
      },
    })))
    // 无敌切换即时改写全队血量上限（arena.applyTestInvincible），再重渲面板
    const applyInvincible = (on: boolean): void => {
      setLabInvincible(on)
      this.arena.applyTestInvincible()
      this.scene.restart()
    }
    y = this.labSection('无敌', y + 8, [
      { label: '开', on: () => labInvincible(), tap: () => applyInvincible(true) },
      { label: '关', on: () => !labInvincible(), tap: () => applyInvincible(false) },
    ])
    view.setContentHeight(y + 8)
  }

  /** 一段带标题的 chip 流式布局（装进 labView，坐标相对内容顶）：chip 按内容宽自适应、
   * 排满一行自动换行——名字再长也不会横向溢出。返回本段底部 localY（供下一段接着排） */
  private labSection(
    title: string,
    gy: number,
    items: { label: string; on: () => boolean; tap: (chip: Phaser.GameObjects.Text) => void }[],
  ): number {
    const view = this.labView!
    const maxW = view.viewport.w - 14
    const gap = 5
    view.add(
      this.add.text(0, gy, title, {
        fontFamily: UI_FONT,
        fontSize: FONT.caption,
        fontStyle: 'bold',
        color: '#ffdc5d',
        stroke: '#000000',
        strokeThickness: 3,
        resolution: textRes(),
      }),
    )
    let cx = 0
    let cy = gy + 22
    let rowH = 0
    for (const it of items) {
      const chip = this.add
        .text(0, 0, it.label, {
          fontFamily: UI_FONT,
          fontSize: FONT.caption,
          color: '#ffffff',
          backgroundColor: it.on() ? UIScene.CHIP_ON : UIScene.CHIP_OFF,
          padding: { x: 8, y: 5 },
          resolution: textRes(),
        })
        .setInteractive({ useHandCursor: true })
      if (cx > 0 && cx + chip.width > maxW) {
        cx = 0
        cy += rowH + gap
        rowH = 0
      }
      chip.setPosition(cx, cy)
      view.add(chip)
      chip.on('pointerup', () => {
        if (view.wasDragged) return
        it.tap(chip)
      })
      cx += chip.width + gap
      rowH = Math.max(rowH, chip.height)
    }
    return cy + rowH + gap
  }

  private updateDevPanel(time: number): void {
    const fps = this.game.loop.actualFps
    const rawDelta = this.game.loop.rawDelta
    if (time - this.fpsWindowStart > 5000) {
      this.fpsWindowStart = time
      this.fpsWindowMin = fps
      this.frameMaxMs = rawDelta
    } else {
      if (fps < this.fpsWindowMin) this.fpsWindowMin = fps
      if (rawDelta > this.frameMaxMs) this.frameMaxMs = rawDelta
    }
    if (time - this.devRefreshedAt < 250) return
    this.devRefreshedAt = time
    const p = this.arena.perfSnapshot()
    const cache = emojiCacheStats(this)
    const raf = rafHz()
    const heap = heapMB()
    const vp = viewport
    const gl = rendererInfo(this.game)
    this.devText!.setText([
      `FPS ${fps.toFixed(0)}（5s低 ${Number.isFinite(this.fpsWindowMin) ? this.fpsWindowMin.toFixed(0) : '-'}）· rAF ${raf > 0 ? raf : '-'}`,
      `帧峰值 ${this.frameMaxMs.toFixed(0)}ms${heap === undefined ? '' : ` · 内存 ${heap}MB`}`,
      `敌人 ${p.enemies} · 预告 ${p.pending} · 子弹 ${p.projectiles} · 金币 ${p.coins}`,
      `对象 ${p.objects} · 物理体 ${p.bodies} · emoji纹理 ${cache.textures}（固定 ${cache.pinned}）`,
      `难度 t ${p.combatSec}s · 刷怪 ${p.spawnIntervalMs}ms · 血量 ×${p.hpMultiplier.toFixed(2)}`,
      `视口 ${Math.round(vp.logicalWidth)}×${Math.round(vp.logicalHeight)} ×${vp.fitScale.toFixed(2)} · DPR ${vp.dpr} · 画布 ${Math.round(vp.cssWidth * vp.dpr)}×${Math.round(vp.cssHeight * vp.dpr)}`,
      `inner ${window.innerWidth}×${window.innerHeight} · screen ${screen.width}×${screen.height} · 安全区 ${Math.round(safeInsets.top)}/${Math.round(safeInsets.right)}/${Math.round(safeInsets.bottom)}/${Math.round(safeInsets.left)}${isStandalone() ? ' · PWA' : ''}`,
      gl.length > 54 ? `${gl.slice(0, 53)}…` : gl,
    ])
  }

  /** 波末结算横幅：冻结期展示本波战果，随场景切换自然销毁 */
  private onWaveComplete(s: WaveSummary): void {
    const res = textRes()
    const cx = viewport.logicalWidth / 2
    const cy = viewport.logicalHeight / 2
    this.add.rectangle(cx, cy, 6000, 6000, 0x000000, 0.55).setDepth(230)

    const title = this.add
      .text(cx, cy - 76, `第 ${s.wave} 波完成！`, {
        fontFamily: UI_FONT,
        fontSize: FONT.banner,
        fontStyle: 'bold',
        color: '#ffdc5d',
        resolution: res,
      })
      .setOrigin(0.5)
      .setDepth(231)
    title.setScale(0.6)
    this.tweens.add({ targets: title, scale: 1, duration: 320, ease: 'Back.easeOut' })

    const lineStyle = { fontFamily: UI_FONT, fontSize: FONT.head, color: '#ffffff', resolution: res }
    iconLabel(this, cx - 140, cy + 12, '1f480', 37, `击杀 ${s.kills}`, lineStyle).setDepth(231)
    iconLabel(this, cx + 140, cy + 12, PICKUPS.coin.emoji, 37, `金币 +${s.coins}`, lineStyle).setDepth(231)
    if (s.levels > 0) {
      iconLabel(this, cx, cy + 72, '1fad8', 35, `能量豆 +${s.levels}（队长技能弹药）`, {
        ...lineStyle,
        fontSize: FONT.body,
        color: '#b3e5fc',
      }).setDepth(231)
    }
  }

  private drawXpBar(s: HudSnapshot): void {
    const x = safeInsets.left + 12
    const y = safeInsets.top + 12
    const g = this.xpBar
    g.clear()
    g.fillStyle(0x000000, 0.5)
    g.fillRect(x, y, 200, 14)
    g.fillStyle(0x4dd0e1, 1)
    g.fillRect(x + 1, y + 1, 198 * Math.min(1, s.xp / s.xpNext), 12)
  }
}
