import Phaser from 'phaser'
import { formatTime } from '../core/format'
import { devMode, isStress, setStress } from '../ui/dev'
import { emojiImage, iconLabel } from '../ui/emoji'
import { UI_FONT } from '../ui/fonts'
import { Joystick } from '../ui/Joystick'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'
import type { ArenaScene, GameOverInfo, HudSnapshot } from './ArenaScene'

// 屏幕层：HUD、虚拟摇杆、升级提示、结算界面。
// 与 ArenaScene 并行运行，相机静止不随地图滚动，坐标即逻辑视口坐标。
export class UIScene extends Phaser.Scene {
  private joystick?: Joystick
  private hpBar!: Phaser.GameObjects.Graphics
  private xpBar!: Phaser.GameObjects.Graphics
  private levelText!: Phaser.GameObjects.Text
  private timeText!: Phaser.GameObjects.Text
  private killsText!: Phaser.GameObjects.Text
  private last!: HudSnapshot
  private devText?: Phaser.GameObjects.Text
  private fpsWindowMin = Infinity
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
    this.last = { hp: -1, maxHp: -1, xp: -1, xpNext: -1, level: -1, kills: -1, seconds: -1, over: false }

    this.joystick = new Joystick(this)

    this.hpBar = this.add.graphics()
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
      .text(w / 2, 10, '0:00', { ...hudText, fontSize: '22px' })
      .setOrigin(0.5, 0)
    emojiImage(this, w - 22, 22, '💀', 20, true)
    this.killsText = this.add
      .text(w - 38, 10, '0', { ...hudText, fontSize: '20px' })
      .setOrigin(1, 0)

    if (devMode) this.createDevPanel(res)

    const arenaEvents = this.arena.events
    arenaEvents.on('upgrade-toast', this.onToast, this)
    arenaEvents.on('game-over', this.onGameOver, this)
    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      arenaEvents.off('upgrade-toast', this.onToast, this)
      arenaEvents.off('game-over', this.onGameOver, this)
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })

    // 视口变化会重启本场景：若一局已结束，重建结算界面
    if (this.arena.gameOverInfo) this.onGameOver(this.arena.gameOverInfo)
  }

  update(time: number): void {
    if (this.devText) this.updateDevPanel(time)
    const s = this.arena.hudSnapshot()
    if (s.hp !== this.last.hp || s.maxHp !== this.last.maxHp) this.drawHpBar(s)
    if (s.xp !== this.last.xp || s.xpNext !== this.last.xpNext) this.drawXpBar(s)
    if (s.level !== this.last.level) this.levelText.setText(`Lv.${s.level}`)
    if (s.kills !== this.last.kills) this.killsText.setText(String(s.kills))
    if (s.seconds !== this.last.seconds) this.timeText.setText(formatTime(s.seconds))
    this.last = s
  }

  private onViewportChanged(): void {
    this.scene.restart()
  }

  private createDevPanel(res: number): void {
    this.fpsWindowMin = Infinity
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
    if (time - this.fpsWindowStart > 5000) {
      this.fpsWindowStart = time
      this.fpsWindowMin = fps
    } else if (fps < this.fpsWindowMin) {
      this.fpsWindowMin = fps
    }
    if (time - this.devRefreshedAt < 250) return
    this.devRefreshedAt = time
    const p = this.arena.perfSnapshot()
    this.devText!.setText([
      `FPS ${fps.toFixed(0)}  (5s min ${Number.isFinite(this.fpsWindowMin) ? this.fpsWindowMin.toFixed(0) : '-'})`,
      `敌人 ${p.enemies}  预告 ${p.pending}`,
      `飞刀 ${p.knives}  经验珠 ${p.gems}`,
      `总对象 ${p.objects}`,
    ])
  }

  private onToast(upgrade: { emoji: string; text: string; index: number }): void {
    const toast = iconLabel(
      this,
      viewport.logicalWidth / 2,
      viewport.logicalHeight * 0.36 + upgrade.index * 36,
      upgrade.emoji,
      26,
      upgrade.text,
      {
        fontFamily: UI_FONT,
        fontSize: '24px',
        color: '#ffe082',
        stroke: '#000000',
        strokeThickness: 4,
        resolution: textRes(),
      },
    ).setDepth(120)
    this.tweens.add({
      targets: toast,
      y: toast.y - 34,
      alpha: 0,
      duration: 1100,
      delay: 150 + upgrade.index * 150,
      onComplete: () => toast.destroy(),
    })
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
      .text(cx, cy - 26, `存活 ${formatTime(info.seconds)} · 击杀 ${info.kills} · 等级 ${info.level}`, {
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
      info.newBest ? '新纪录！' : `最佳：存活 ${formatTime(info.bestSeconds)} · 击杀 ${info.bestKills}`,
      { fontFamily: UI_FONT, fontSize: '20px', color: '#d4b106', resolution: res },
    ).setDepth(201)
    const prompt = this.add
      .text(cx, cy + 106, '点击或按任意键重新开始', {
        fontFamily: UI_FONT,
        fontSize: '20px',
        color: '#aaaaaa',
        resolution: res,
      })
      .setOrigin(0.5)
      .setDepth(201)
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 })
  }

  private drawHpBar(s: HudSnapshot): void {
    const g = this.hpBar
    g.clear()
    g.fillStyle(0x000000, 0.5)
    g.fillRect(12, 12, 204, 16)
    g.fillStyle(0xef5350, 1)
    g.fillRect(14, 14, 200 * (s.hp / s.maxHp), 12)
    g.lineStyle(1, 0x000000, 0.35)
    g.strokeRect(12, 12, 204, 16)
  }

  private drawXpBar(s: HudSnapshot): void {
    const g = this.xpBar
    g.clear()
    g.fillStyle(0x000000, 0.5)
    g.fillRect(12, 32, 204, 8)
    g.fillStyle(0x4dd0e1, 1)
    g.fillRect(13, 33, 202 * Math.min(1, s.xp / s.xpNext), 6)
  }
}
