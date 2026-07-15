import Phaser from 'phaser'
import { COIN } from '../core/config'
import { formatTime } from '../core/format'
import { endRun } from '../core/run'
import { isDevOpen, isStress, setDevOpen, setStress } from '../ui/dev'
import { heapMB, rafHz, rendererInfo, startRafMeter } from '../ui/diagnostics'
import { emojiCacheStats, emojiImage, iconLabel } from '../ui/emoji'
import { FONT, UI_FONT } from '../ui/fonts'
import { Joystick } from '../ui/Joystick'
import {
  applyCamera,
  isStandalone,
  safeInsets,
  textRes,
  viewport,
  VIEWPORT_CHANGED,
} from '../ui/viewport'
import type { ArenaScene, HudSnapshot, WaveSummary } from './ArenaScene'

// 屏幕层：HUD、虚拟摇杆、升级提示、结算界面。
// 与 ArenaScene 并行运行，相机静止不随地图滚动，坐标即逻辑视口坐标。
export class UIScene extends Phaser.Scene {
  private joystick?: Joystick
  private xpBar!: Phaser.GameObjects.Graphics
  private levelText!: Phaser.GameObjects.Text
  private timeText!: Phaser.GameObjects.Text
  private killsText!: Phaser.GameObjects.Text
  private coinsText!: Phaser.GameObjects.Text
  private last!: HudSnapshot
  private devText?: Phaser.GameObjects.Text
  private fpsWindowMin = Infinity
  private frameMaxMs = 0
  private fpsWindowStart = 0
  private devRefreshedAt = 0
  private paused = false
  private pauseObjs: Phaser.GameObjects.GameObject[] = []

  constructor() {
    super('ui')
  }

  get joystickVector(): { x: number; y: number } {
    return this.joystick?.vector ?? { x: 0, y: 0 }
  }

  private get arena(): ArenaScene {
    return this.scene.get('arena') as ArenaScene
  }

  create(): void {
    applyCamera(this)
    const res = textRes()
    const w = viewport.logicalWidth
    // 全屏贴边的 HUD 须避开刘海/状态栏/Home 条
    const { top: sT, right: sR, left: sL } = safeInsets
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
    }

    this.joystick = new Joystick(this)

    this.xpBar = this.add.graphics()
    // 深色字 + 白描边：浅色地图与暗色背景（相机贴边时）上都可读
    const hudText = {
      fontFamily: UI_FONT,
      color: '#2b2b33',
      stroke: '#ffffff',
      strokeThickness: 3,
      resolution: res,
    }
    // 等级放在经验条下方：竖屏 720 逻辑宽下与居中的波次计时互不侵占
    this.levelText = this.add.text(sL + 12, sT + 32, 'Lv.1', { ...hudText, fontSize: FONT.body })
    this.timeText = this.add
      .text(w / 2, sT + 10, '', { ...hudText, fontSize: FONT.lead })
      .setOrigin(0.5, 0)
    emojiImage(this, w - sR - 26, sT + 26, '💀', 26, 'player')
    this.killsText = this.add
      .text(w - sR - 46, sT + 10, '0', { ...hudText, fontSize: FONT.head })
      .setOrigin(1, 0)
    emojiImage(this, w - sR - 26, sT + 64, COIN.emoji, 26, 'player')
    this.coinsText = this.add
      .text(w - sR - 46, sT + 48, '0', { ...hudText, fontSize: FONT.head })
      .setOrigin(1, 0)

    // 暂停：按钮或 ESC；已暂停或已结算时按钮行为由 togglePause 把关
    emojiImage(this, w - sR - 26, sT + 112, '⏸️', 36)
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
      '🔧',
      30,
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

    const arenaEvents = this.arena.events
    arenaEvents.on('wave-complete', this.onWaveComplete, this)
    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      arenaEvents.off('wave-complete', this.onWaveComplete, this)
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
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
        g.fillStyle(0xffd54f, 1)
        g.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 36)
      } else {
        g.fillStyle(0xffffff, 0.12)
        g.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 36)
        g.lineStyle(1, 0xffffff, 0.35)
        g.strokeRoundedRect(rect.x, rect.y, rect.w, rect.h, 36)
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
    const s = this.arena.hudSnapshot()
    if (s.xp !== this.last.xp || s.xpNext !== this.last.xpNext) this.drawXpBar(s)
    if (s.level !== this.last.level) this.levelText.setText(`Lv.${s.level}`)
    if (s.kills !== this.last.kills) this.killsText.setText(String(s.kills))
    if (s.coins !== this.last.coins) this.coinsText.setText(String(s.coins))
    // 常规显示本波倒计时；压测模式无波次限时，显示已进行时间
    const remainSec = Math.ceil(s.remainMs / 1000)
    const lastRemainSec = Math.ceil(this.last.remainMs / 1000)
    if (s.wave !== this.last.wave || remainSec !== lastRemainSec || s.seconds !== this.last.seconds) {
      this.timeText.setText(
        isStress() ? formatTime(s.seconds) : `第${s.wave}波 ${formatTime(remainSec)}`,
      )
    }
    this.last = s
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
    const stressBtn = this.add
      .text(safeInsets.left + 12, h - safeInsets.bottom - 12, `压测模式：${isStress() ? '开' : '关'}（点击切换）`, {
        fontFamily: UI_FONT,
        fontSize: FONT.caption,
        color: '#ffffff',
        backgroundColor: isStress() ? '#2e7d32' : '#c62828',
        padding: { x: 10, y: 6 },
        resolution: textRes(),
      })
      .setOrigin(0, 1)
      .setDepth(300)
      .setInteractive({ useHandCursor: true })
    stressBtn.on('pointerdown', () => {
      setStress(!isStress())
      this.arena.scene.restart()
    })
    this.devText = this.add
      .text(safeInsets.left + 12, h - safeInsets.bottom - 12 - stressBtn.height - 8, '', {
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
        color: '#ffd54f',
        resolution: res,
      })
      .setOrigin(0.5)
      .setDepth(231)
    title.setScale(0.6)
    this.tweens.add({ targets: title, scale: 1, duration: 320, ease: 'Back.easeOut' })

    const lineStyle = { fontFamily: UI_FONT, fontSize: FONT.head, color: '#ffffff', resolution: res }
    iconLabel(this, cx - 140, cy + 12, '💀', 28, `击杀 ${s.kills}`, lineStyle).setDepth(231)
    iconLabel(this, cx + 140, cy + 12, COIN.emoji, 28, `金币 +${s.coins}`, lineStyle).setDepth(231)
    if (s.levels > 0) {
      iconLabel(this, cx, cy + 72, '⬆️', 26, `队伍等级 +${s.levels}，商店里花点数招募/升级`, {
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
