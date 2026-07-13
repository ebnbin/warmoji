import Phaser from 'phaser'
import { formatTime } from '../core/format'
import { browserStorage, loadHighScore } from '../core/highscore'
import { reportDebug } from '../ui/debug'
import { EMOJI_FONT, UI_FONT } from '../ui/fonts'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu')
  }

  create(): void {
    applyCamera(this)
    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()

    this.add
      .text(w / 2, h * 0.26, '⚔️ WARMOJI ⚔️', {
        fontFamily: EMOJI_FONT,
        fontSize: '64px',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)

    this.add
      .text(w / 2, h * 0.4, 'emoji 幸存者 · 走位躲避，武器全自动', {
        fontFamily: UI_FONT,
        fontSize: '20px',
        color: '#8888aa',
        resolution: res,
      })
      .setOrigin(0.5)

    const emojis = ['😎', '🧟', '👻', '💀', '🤖']
    emojis.forEach((emoji, i) => {
      const sprite = this.add
        .text(w / 2 + (i - (emojis.length - 1) / 2) * 90, h * 0.55, emoji, {
          fontFamily: EMOJI_FONT,
          fontSize: '48px',
          resolution: res,
        })
        .setOrigin(0.5)
      this.tweens.add({
        targets: sprite,
        y: h * 0.55 - 18,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: i * 120,
      })
    })

    const best = loadHighScore(browserStorage())
    if (best.bestSeconds > 0) {
      this.add
        .text(w / 2, h * 0.7, `🏆 最佳：存活 ${formatTime(best.bestSeconds)} · 击杀 ${best.bestKills}`, {
          fontFamily: EMOJI_FONT,
          fontSize: '18px',
          color: '#d4b106',
          resolution: res,
        })
        .setOrigin(0.5)
    }

    const prompt = this.add
      .text(w / 2, h * 0.82, '点击或按任意键开始', {
        fontFamily: UI_FONT,
        fontSize: '22px',
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(0.5)
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 })

    const start = (): void => {
      this.scene.start('arena')
    }
    this.input.once('pointerdown', start)
    this.input.keyboard?.once('keydown', start)

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })

    reportDebug({
      scene: 'menu',
      elapsed: 0,
      hp: 0,
      kills: 0,
      level: 1,
      enemies: 0,
      viewW: w,
      viewH: h,
    })
  }

  private onViewportChanged(): void {
    // 菜单无状态，直接重建适配新尺寸
    this.scene.restart()
  }
}
