import Phaser from 'phaser'
import { CHARACTERS } from '../core/config'
import { browserStorage, loadHighScore } from '../core/highscore'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { emojiImage, iconLabel } from '../ui/emoji'
import { UI_FONT } from '../ui/fonts'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

export class MenuScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色等页面状态
  private preserveOnRestart = false
  private palette?: Palette

  constructor() {
    super('menu')
  }

  create(): void {
    applyCamera(this)
    if (!this.preserveOnRestart || !this.palette) {
      this.palette = randomPalette(new Rng(Date.now() >>> 0))
    }
    this.preserveOnRestart = false
    applyBackground(this.palette)
    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()

    const title = this.add
      .text(w / 2, h * 0.26, 'WARMOJI', {
        fontFamily: UI_FONT,
        fontSize: '64px',
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)
    const swordOffset = title.width / 2 + 64
    emojiImage(this, w / 2 - swordOffset, h * 0.26, '⚔️', 60)
    emojiImage(this, w / 2 + swordOffset, h * 0.26, '⚔️', 60)

    this.add
      .text(w / 2, h * 0.4, 'emoji 幸存者 · 走位躲避，武器全自动', {
        fontFamily: UI_FONT,
        fontSize: '20px',
        color: '#8888aa',
        resolution: res,
      })
      .setOrigin(0.5)

    // 装饰行用花名册角色（已预载 + 描边）；人数多了只展示前 6 个
    const emojis = Object.values(CHARACTERS)
      .slice(0, 6)
      .map((c) => c.emoji)
    emojis.forEach((emoji, i) => {
      const sprite = emojiImage(this, w / 2 + (i - (emojis.length - 1) / 2) * 90, h * 0.55, emoji, 48, true)
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
    if (best.bestWave > 0) {
      iconLabel(this, w / 2, h * 0.7, '🏆', 20, `最佳：第 ${best.bestWave} 波 · 击杀 ${best.bestKills}`, {
        fontFamily: UI_FONT,
        fontSize: '18px',
        color: '#d4b106',
        resolution: res,
      })
    }

    const prompt = this.add
      .text(w / 2, h * 0.82, '点击或按任意键组建队伍', {
        fontFamily: UI_FONT,
        fontSize: '22px',
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(0.5)
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 })

    // Twemoji 图形许可（CC-BY 4.0）要求署名
    this.add
      .text(w / 2, h - safeInsets.bottom - 10, 'emoji graphics © Twemoji · CC-BY 4.0', {
        fontFamily: UI_FONT,
        fontSize: '11px',
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(0.5, 1)
      .setAlpha(0.28)

    const start = (): void => {
      this.scene.start('select')
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
      alive: 0,
      kills: 0,
      level: 1,
      enemies: 0,
      pending: 0,
      fps: 0,
      viewW: w,
      viewH: h,
      playerX: 0,
      playerY: 0,
      camX: 0,
      camY: 0,
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}
