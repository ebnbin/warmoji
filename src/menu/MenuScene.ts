import Phaser from 'phaser'
import { CHARACTERS } from '../characters/registry'
import { ENEMY_DEFS } from '../enemies/registry'
import { loadHighScore } from '../run/highscore'
import { randomPalette } from '../core/palette'
import type { Palette } from '../core/palette'
import { Rng } from '../core/rng'
import { browserStorage } from '../core/storage'
import { applyBackground } from '../core/background'
import { reportDebug } from '../debug/debug'
import { emojiImage, iconLabel } from '../emoji/textures'
import { FONT, UI_FONT } from '../core/fonts'
import { playSfx } from '../audio/sfx'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../core/apply'

// 主菜单：分字母弹跳的两色 logo + 背景漂浮暗纹 + 「角色 vs 敌人」对峙小剧场，
// 全部用已预载的描边纹理与 tween，比例定位横竖屏通用
export class MenuScene extends Phaser.Scene {
  // 视口变化触发的 restart 只重排布局，保留背景色等页面状态
  private preserveOnRestart = false
  private palette?: Palette
  private menuBtn = { x: 0, y: 0, w: 0, h: 0 }
  private gearRect = { x: 0, y: 0, w: 0, h: 0 }
  private bookRect = { x: 0, y: 0, w: 0, h: 0 }
  private studioRect = { x: 0, y: 0, w: 0, h: 0 }

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
    const rng = new Rng((Date.now() ^ 0x9e3779b9) >>> 0)

    this.createBackdrop(w, h, rng)
    this.createLogo(w, h * 0.22, res)

    this.add
      .text(w / 2, h * 0.34, 'emoji 幸存者 · 走位躲避，能力全自动', {
        fontFamily: UI_FONT,
        fontSize: FONT.strong,
        color: '#8888aa',
        resolution: res,
      })
      .setOrigin(0.5)

    this.createVignette(w / 2, h * 0.52)

    const best = loadHighScore(browserStorage())
    if (best.bestWave > 0) {
      iconLabel(this, w / 2, h * 0.66, '1f3c6', 35, `最佳：第 ${best.bestWave} 波 · 击杀 ${best.bestKills}`, {
        fontFamily: UI_FONT,
        fontSize: FONT.body,
        color: '#d4b106',
        resolution: res,
      })
    }

    // 右上角入口：🧪 Emoji Studio + 📖 图鉴 + ⚙️ 设置（圆底增强可点性）
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

    // 明确的按钮 + 空格键开始，避免任意点击误触；轻微脉动引导视线
    const btn = { x: w / 2 - 170, y: h * 0.82 - 36, w: 340, h: 72 }
    this.menuBtn = btn
    const btnBg = this.add.graphics()
    btnBg.fillStyle(0xffd54f, 1)
    btnBg.fillRoundedRect(-btn.w / 2, -btn.h / 2, btn.w, btn.h, btn.h / 2)
    const btnText = this.add
      .text(0, 0, '组建队伍', {
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

    // Twemoji 图形许可（CC-BY 4.0）要求署名
    this.add
      .text(w / 2, h - safeInsets.bottom - 10, 'emoji graphics © Twemoji · CC-BY 4.0 · 有改动', {
        fontFamily: UI_FONT,
        fontSize: FONT.caption,
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(0.5, 1)
      .setAlpha(0.28)

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

  /** 背景漂浮暗纹：低透明度的敌人/能力 emoji 缓慢浮动旋转，增加画面纵深 */
  private createBackdrop(w: number, h: number, rng: Rng): void {
    const decor: { emoji: string; outline: 'enemy' | 'player' }[] = [
      { emoji: ENEMY_DEFS[1]!.emoji, outline: 'enemy' },
      { emoji: ENEMY_DEFS[2]!.emoji, outline: 'enemy' },
      { emoji: ENEMY_DEFS[4]!.emoji, outline: 'enemy' },
      { emoji: '1fa93', outline: 'player' },
      { emoji: '1fa83', outline: 'player' },
      { emoji: '1f345', outline: 'player' },
    ]
    decor.forEach((d, i) => {
      // 均匀散布在左右两侧竖条内，避开中央内容区
      const side = i % 2 === 0 ? 0.06 + rng.next() * 0.16 : 0.78 + rng.next() * 0.16
      const img = emojiImage(
        this,
        w * side,
        h * (0.12 + rng.next() * 0.76),
        d.emoji,
        75 + rng.next() * 54,
        d.outline,
      )
        .setAlpha(0.1)
        .setRotation((rng.next() - 0.5) * 0.5)
      this.tweens.add({
        targets: img,
        y: img.y - 18 - rng.next() * 18,
        rotation: img.rotation + 0.16,
        duration: 2600 + rng.next() * 2200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: rng.next() * 1200,
      })
    })
  }

  /** 分字母两色 logo：War 琥珀 + Moji 白，逐字错相弹跳；两侧⚔️摇摆 */
  private createLogo(w: number, y: number, res: number): void {
    const letters: { ch: string; color: string }[] = [
      { ch: 'W', color: '#ffd54f' },
      { ch: 'a', color: '#ffd54f' },
      { ch: 'r', color: '#ffd54f' },
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
    texts.forEach((t, i) => {
      t.setX(x)
      x += t.width
      this.tweens.add({
        targets: t,
        y: y - 9,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: i * 110,
      })
    })
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

  /** 对峙小剧场：三名角色（面朝右弹跳）与三只敌人（摇摆）隔空互射 */
  private createVignette(cx: number, cy: number): void {
    const chars = Object.values(CHARACTERS)
      .slice(0, 3)
      .map((c) => c.emoji)
    chars.forEach((emoji, i) => {
      const img = emojiImage(this, cx - 260 + i * 90, cy, emoji, 75, 'player').setFlipX(true)
      this.tweens.add({
        targets: img,
        y: cy - 12,
        duration: 620,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: i * 140,
      })
    })
    const enemies = ENEMY_DEFS.slice(0, 3).map((s) => s.emoji)
    enemies.forEach((emoji, i) => {
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
    // 互射：番茄向右、敌弹向左，循环往复（弹道两端与两队保持间隙）
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
