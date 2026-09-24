import Phaser from 'phaser'
import { CHARACTERS } from '../data/characters'
import { ENEMY_DEFS } from '../data/enemies'
import { loadHighScore } from '../save/highscore'
import type { HighScore } from '../save/highscore'
import { randomPalette } from '../util/palette'
import type { Palette } from '../util/palette'
import { Rng } from '../util/rng'
import { browserStorage } from '../util/storage'
import { applyBackground } from '../util/background'
import { reportDebug } from '../debug'
import { emojiImage, preloadEmojis } from '../emoji/hold'
import type { EmojiRef } from '../emoji/hold'
import { iconLabel } from '../ui/emojiText'
import { FONT, UI_FONT } from '../util/fonts'
import { playSfx } from '../audio/sfx'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { roundRect } from '../ui/shapes'

function backdropDecor(): EmojiRef[] {
  const uniqEnemies = [...new Set(ENEMY_DEFS.map((e) => e.emoji))]
  return [
    ...[0.2, 0.45, 0.75]
      .map((f) => uniqEnemies[Math.min(uniqEnemies.length - 1, Math.floor(f * uniqEnemies.length))])
      .filter((e): e is string => e !== undefined)
      .map((id) => ({ id, outline: 'enemy' as const })),
    { id: '1fa93', outline: 'player' },
    { id: '1fa83', outline: 'player' },
    { id: '1f345', outline: 'player' },
  ]
}

function vignetteCast(): { heroes: string[]; foes: string[] } {
  return {
    heroes: Object.values(CHARACTERS)
      .slice(0, 3)
      .map((c) => c.emoji),
    foes: ENEMY_DEFS.slice(0, 3).map((s) => s.emoji),
  }
}

export class MenuScene extends Phaser.Scene {
  // 视口变化触发的 restart 置真，保留页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private best!: HighScore
  private menuBtn = { x: 0, y: 0, w: 0, h: 0 }
  private gearRect = { x: 0, y: 0, w: 0, h: 0 }
  private bookRect = { x: 0, y: 0, w: 0, h: 0 }
  private studioRect = { x: 0, y: 0, w: 0, h: 0 }

  constructor() {
    super('menu')
  }

  preload(): void {
    this.best = loadHighScore(browserStorage())
    const cast = vignetteCast()
    preloadEmojis(this, [
      ...['2699', '1f4d6', '1f9ea', '2694'].map((id) => ({ id })),
      ...(this.best.bestWave > 0 ? [{ id: '1f3c6' }] : []),
      ...backdropDecor(),
      ...cast.heroes.map((id) => ({ id, outline: 'player' as const })),
      ...cast.foes.map((id) => ({ id, outline: 'enemy' as const })),
      { id: '1f345', outline: 'player' },
      { id: '1f534', outline: 'enemyProjectile' },
    ])
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
    const rng = new Rng((Date.now() ^ 0x9e3779b9) >>> 0)

    this.createBackdrop(w, h, rng)
    this.createLogo(w, h * 0.22, res)

    this.createVignette(w / 2, h * 0.52)

    const best = this.best
    if (best.bestWave > 0) {
      iconLabel(this, w / 2, h * 0.66, '1f3c6', 35, `最佳：第 ${best.bestWave} 波 · 击杀 ${best.bestKills}`, {
        fontFamily: UI_FONT,
        fontSize: FONT.body,
        color: '#ffdc5d',
        resolution: res,
      })
    }

    const iconBg = this.add.graphics()
    iconBg.fillStyle(0x000000, 0.18)
    const gearX = w - safeInsets.right - 44
    const gearY = safeInsets.top + 44
    iconBg.fillCircle(gearX, gearY, 32)
    iconBg.fillCircle(gearX - 84, gearY, 32)
    iconBg.fillCircle(gearX - 168, gearY, 32)
    emojiImage(this, gearX, gearY, '2699', 54)
      .setAlpha(0.9)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        playSfx('click')
        this.scene.start('settings')
      })
    this.gearRect = { x: gearX - 28, y: gearY - 28, w: 56, h: 56 }
    emojiImage(this, gearX - 84, gearY, '1f4d6', 54)
      .setAlpha(0.9)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        playSfx('click')
        this.scene.start('wiki')
      })
    this.bookRect = { x: gearX - 84 - 28, y: gearY - 28, w: 56, h: 56 }
    emojiImage(this, gearX - 168, gearY, '1f9ea', 54)
      .setAlpha(0.9)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        playSfx('click')
        this.scene.start('studio')
      })
    this.studioRect = { x: gearX - 168 - 28, y: gearY - 28, w: 56, h: 56 }

    const btn = { x: w / 2 - 170, y: h * 0.82 - 36, w: 340, h: 72 }
    this.menuBtn = btn
    const btnBg = this.add.graphics()
    roundRect(btnBg, -btn.w / 2, -btn.h / 2, btn.w, btn.h, btn.h / 2, { fill: 0xffdc5d })
    const btnText = this.add
      .text(0, 0, '开始战斗', {
        fontFamily: UI_FONT,
        fontSize: FONT.lead,
        fontStyle: 'bold',
        color: '#25262e',
        resolution: res,
      })
      .setOrigin(0.5)
    const btnBox = this.add.container(w / 2, h * 0.82, [btnBg, btnText])
    this.tweens.add({
      targets: btnBox,
      scale: 1.045,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.add
      .zone(btn.x, btn.y, btn.w, btn.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        playSfx('click')
        this.scene.start('map')
      })
    this.input.keyboard?.once('keydown-SPACE', () => this.scene.start('map'))
    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start('map'))

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })

    reportDebug({
      scene: 'menu',
      elapsed: 0,
      kills: 0,
      level: 1,
      viewW: w,
      viewH: h,
      menu: {
        start: {
          x: this.menuBtn.x + this.menuBtn.w / 2,
          y: this.menuBtn.y + this.menuBtn.h / 2,
          w: this.menuBtn.w,
          h: this.menuBtn.h,
        },
        settings: {
          x: this.gearRect.x + this.gearRect.w / 2,
          y: this.gearRect.y + this.gearRect.h / 2,
          w: this.gearRect.w,
          h: this.gearRect.h,
        },
        wiki: {
          x: this.bookRect.x + this.bookRect.w / 2,
          y: this.bookRect.y + this.bookRect.h / 2,
          w: this.bookRect.w,
          h: this.bookRect.h,
        },
        studio: {
          x: this.studioRect.x + this.studioRect.w / 2,
          y: this.studioRect.y + this.studioRect.h / 2,
          w: this.studioRect.w,
          h: this.studioRect.h,
        },
      },
    })
  }

  private createBackdrop(w: number, h: number, rng: Rng): void {
    backdropDecor().forEach((d, i) => {
      const side = i % 2 === 0 ? 0.06 + rng.next() * 0.16 : 0.78 + rng.next() * 0.16
      const img = emojiImage(
        this,
        w * side,
        h * (0.12 + rng.next() * 0.76),
        d.id,
        75 + rng.next() * 54,
        d.outline,
      )
        .setAlpha(0.1)
        .setRotation((rng.next() - 0.5) * 0.5)
      this.tweens.add({
        targets: img,
        rotation: img.rotation + 0.16,
        duration: 2600 + rng.next() * 2200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: rng.next() * 1200,
      })
    })
  }

  private createLogo(w: number, y: number, res: number): void {
    const letters: { ch: string; color: string }[] = [
      { ch: 'W', color: '#ffdc5d' },
      { ch: 'a', color: '#ffdc5d' },
      { ch: 'r', color: '#ffdc5d' },
      { ch: 'M', color: '#f5f5f5' },
      { ch: 'o', color: '#f5f5f5' },
      { ch: 'j', color: '#f5f5f5' },
      { ch: 'i', color: '#f5f5f5' },
    ]
    const texts = letters.map((l) =>
      this.add
        .text(0, y, l.ch, {
          fontFamily: UI_FONT,
          fontSize: FONT.display,
          fontStyle: 'bold',
          color: l.color,
          resolution: res,
        })
        .setOrigin(0, 0.5),
    )
    const total = texts.reduce((s, t) => s + t.width, 0)
    let x = w / 2 - total / 2
    for (const t of texts) {
      t.setX(x)
      x += t.width
    }
    const left = emojiImage(this, w / 2 - total / 2 - 58, y, '2694', 85)
    const right = emojiImage(this, w / 2 + total / 2 + 58, y, '2694', 85)
    this.tweens.add({
      targets: left,
      rotation: { from: -0.12, to: 0.12 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.tweens.add({
      targets: right,
      rotation: { from: 0.12, to: -0.12 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  private createVignette(cx: number, cy: number): void {
    const cast = vignetteCast()
    cast.heroes.forEach((emoji, i) => {
      emojiImage(this, cx - 260 + i * 90, cy, emoji, 75, 'player').setFlipX(true)
    })
    cast.foes.forEach((emoji, i) => {
      const img = emojiImage(this, cx + 80 + i * 90, cy, emoji, 70, 'enemy')
      this.tweens.add({
        targets: img,
        rotation: { from: -0.09, to: 0.09 },
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: i * 170,
      })
    })
    const tomato = emojiImage(this, cx - 34, cy - 6, '1f345', 40, 'player')
    this.tweens.add({
      targets: tomato,
      x: cx + 42,
      rotation: 6,
      duration: 780,
      repeat: -1,
      repeatDelay: 260,
    })
    const shot = emojiImage(this, cx + 42, cy + 22, '1f534', 30, 'enemyProjectile')
    this.tweens.add({
      targets: shot,
      x: cx - 34,
      duration: 1100,
      repeat: -1,
      repeatDelay: 420,
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}
