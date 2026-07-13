import Phaser from 'phaser'
import { COIN } from '../core/config'
import { formatTime } from '../core/format'
import { isDevOpen, isStress, setDevOpen, setStress } from '../ui/dev'
import { heapMB, rafHz, rendererInfo, startRafMeter } from '../ui/diagnostics'
import { emojiCacheStats, emojiImage, iconLabel } from '../ui/emoji'
import { UI_FONT } from '../ui/fonts'
import { Joystick } from '../ui/Joystick'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'
import type { ArenaScene, GameOverInfo, HudSnapshot } from './ArenaScene'

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
    this.levelText = this.add.text(224, 10, 'Lv.1', { ...hudText, fontSize: '16px' })
    this.timeText = this.add
      .text(w / 2, 10, '', { ...hudText, fontSize: '22px' })
      .setOrigin(0.5, 0)
    emojiImage(this, w - 22, 22, '💀', 20, true)
    this.killsText = this.add
      .text(w - 38, 10, '0', { ...hudText, fontSize: '20px' })
      .setOrigin(1, 0)
    emojiImage(this, w - 22, 50, COIN.emoji, 20, true)
    this.coinsText = this.add
      .text(w - 38, 38, '0', { ...hudText, fontSize: '20px' })
      .setOrigin(1, 0)

    const wrench = emojiImage(this, w - 12, viewport.logicalHeight - 26, '🔧', 24)
      .setOrigin(1, 1)
      .setDepth(300)
      .setAlpha(0.45)
      .setInteractive({ useHandCursor: true })
    wrench.on('pointerdown', () => {
      setDevOpen(!isDevOpen())
      this.scene.restart()
    })
    if (isDevOpen()) this.createDevPanel(res)

    const arenaEvents = this.arena.events
    arenaEvents.on('game-over', this.onGameOver, this)
    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      arenaEvents.off('game-over', this.onGameOver, this)
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })

    // 视口变化会重启本场景：若一局已结束，重建结算界面
    if (this.arena.gameOverInfo) this.onGameOver(this.arena.gameOverInfo)
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
      .text(12, h - 12, `压测模式：${isStress() ? '开' : '关'}（点击切换）`, {
        fontFamily: UI_FONT,
        fontSize: '14px',
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
      .text(12, h - 12 - stressBtn.height - 8, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '13px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 8, y: 6 },
        lineSpacing: 3,
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
      `难度 t ${p.combatSec}s · 刷怪 ${p.spawnIntervalMs}ms · 幽灵 ${(p.ghostShare * 100).toFixed(0)}% · 血量 ×${p.hpMultiplier.toFixed(2)}`,
      `视口 ${Math.round(vp.logicalWidth)}×${Math.round(vp.logicalHeight)} ×${vp.fitScale.toFixed(2)} · DPR ${vp.dpr} · 画布 ${Math.round(vp.cssWidth * vp.dpr)}×${Math.round(vp.cssHeight * vp.dpr)}`,
      gl.length > 54 ? `${gl.slice(0, 53)}…` : gl,
    ])
  }

  private onGameOver(info: GameOverInfo): void {
    const res = textRes()
    const cx = viewport.logicalWidth / 2
    const cy = viewport.logicalHeight / 2

    this.add.rectangle(cx, cy, 6000, 6000, 0x000000, 0.72).setDepth(200)
    iconLabel(this, cx, cy - 110, '💀', 50, '游戏结束', {
      fontFamily: UI_FONT,
      fontSize: '48px',
      color: '#ffffff',
      resolution: res,
    }).setDepth(201)
    this.add
      .text(cx, cy - 26, `倒在第 ${info.wave} 波 · 击杀 ${info.kills} · 等级 ${info.level}`, {
        fontFamily: UI_FONT,
        fontSize: '24px',
        color: '#dddddd',
        resolution: res,
      })
      .setOrigin(0.5)
      .setDepth(201)
    iconLabel(
      this,
      cx,
      cy + 24,
      '🏆',
      22,
      info.newBest ? '新纪录！' : `最佳：第 ${info.bestWave} 波 · 击杀 ${info.bestKills}`,
      { fontFamily: UI_FONT, fontSize: '20px', color: '#d4b106', resolution: res },
    ).setDepth(201)
    const prompt = this.add
      .text(cx, cy + 106, '点击或按任意键返回组队', {
        fontFamily: UI_FONT,
        fontSize: '20px',
        color: '#aaaaaa',
        resolution: res,
      })
      .setOrigin(0.5)
      .setDepth(201)
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 })
  }

  private drawXpBar(s: HudSnapshot): void {
    const g = this.xpBar
    g.clear()
    g.fillStyle(0x000000, 0.5)
    g.fillRect(12, 14, 204, 10)
    g.fillStyle(0x4dd0e1, 1)
    g.fillRect(13, 15, 202 * Math.min(1, s.xp / s.xpNext), 8)
  }
}
