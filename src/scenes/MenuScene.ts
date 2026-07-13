import Phaser from 'phaser'
import { formatTime } from '../core/format'
import { browserStorage, loadHighScore } from '../core/highscore'
import { reportDebug } from '../ui/debug'
import { EMOJI_FONT, UI_FONT } from '../ui/fonts'

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu')
  }

  create(): void {
    const { width, height } = this.scale

    this.add
      .text(width / 2, height * 0.26, '⚔️ WARMOJI ⚔️', {
        fontFamily: EMOJI_FONT,
        fontSize: '72px',
        color: '#f5f5f5',
      })
      .setOrigin(0.5)

    this.add
      .text(width / 2, height * 0.42, 'emoji 幸存者 · 走位躲避，武器全自动', {
        fontFamily: UI_FONT,
        fontSize: '20px',
        color: '#8888aa',
      })
      .setOrigin(0.5)

    const emojis = ['😎', '🧟', '👻', '💀', '🤖']
    emojis.forEach((emoji, i) => {
      const sprite = this.add
        .text(width / 2 + (i - (emojis.length - 1) / 2) * 90, height * 0.58, emoji, {
          fontFamily: EMOJI_FONT,
          fontSize: '48px',
        })
        .setOrigin(0.5)
      this.tweens.add({
        targets: sprite,
        y: height * 0.58 - 18,
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
        .text(width / 2, height * 0.72, `🏆 最佳：存活 ${formatTime(best.bestSeconds)} · 击杀 ${best.bestKills}`, {
          fontFamily: EMOJI_FONT,
          fontSize: '18px',
          color: '#d4b106',
        })
        .setOrigin(0.5)
    }

    const prompt = this.add
      .text(width / 2, height * 0.84, '点击或按任意键开始', {
        fontFamily: UI_FONT,
        fontSize: '22px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 })

    const start = (): void => {
      this.scene.start('arena')
    }
    this.input.once('pointerdown', start)
    this.input.keyboard?.once('keydown', start)

    reportDebug({ scene: 'menu', elapsed: 0, hp: 0, kills: 0, level: 1, enemies: 0 })
  }
}
