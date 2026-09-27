import Phaser from 'phaser'
import { CHARACTERS } from '../data/characters'
import { ENEMY_DEFS } from '../data/enemies'
import { loadHighScore } from '../save/highscore'
import type { HighScore } from '../save/highscore'
import { Rng } from '../util/rng'
import { browserStorage } from '../util/storage'
import { preloadEmojis } from '../emoji/hold'
import type { EmojiRef } from '../emoji/hold'
import { beginPage, Button, Icon, IconButton, pageFrame, Pill, RichLabel } from '../ui'
import { viewport, VIEWPORT_CHANGED } from '../util/apply'
import { SceneKey } from './keys'

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

/** 右上角的入口：Studio、图鉴、设置 */
const NAV: readonly { readonly icon: string; readonly scene: SceneKey }[] = [
  { icon: '2699', scene: SceneKey.Settings },
  { icon: '1f4d6', scene: SceneKey.Wiki },
  { icon: '1f9ea', scene: SceneKey.Studio },
]

export class MenuScene extends Phaser.Scene {
  private preserveOnRestart = false
  private decorSeed = 0
  private best!: HighScore

  constructor() {
    super(SceneKey.Menu)
  }

  preload(): void {
    this.best = loadHighScore(browserStorage())
    const cast = vignetteCast()
    preloadEmojis(this, [
      ...[...NAV.map((n) => n.icon), '2694'].map((id) => ({ id })),
      ...(this.best.bestWave > 0 ? [{ id: '1f3c6' }] : []),
      ...backdropDecor(),
      ...cast.heroes.map((id) => ({ id, outline: 'player' as const })),
      ...cast.foes.map((id) => ({ id, outline: 'enemy' as const })),
      { id: '1f345', outline: 'player' },
      { id: '1f534', outline: 'enemyProjectile' },
    ])
  }

  create(): void {
    beginPage(this)
    if (!this.preserveOnRestart) this.decorSeed = (Date.now() ^ 0x9e3779b9) >>> 0
    this.preserveOnRestart = false
    const frame = pageFrame({ footer: true })
    const { content } = frame

    this.createBackdrop(new Rng(this.decorSeed))
    this.createLogo(frame.centerX, content.y + content.h * 0.24)
    this.createVignette(frame.centerX, content.y + content.h * 0.52)

    if (this.best.bestWave > 0) {
      new Pill(this, frame.centerX, frame.footerY - 100, {
        icon: '1f3c6',
        text: `最佳：第 ${this.best.bestWave} 波 · 击杀 ${this.best.bestKills}`,
        color: 'accent',
      })
    }

    NAV.forEach((n, i) => {
      new IconButton(this, frame.right - 32 - i * 84, frame.headerY, { icon: n.icon, onTap: () => this.scene.start(n.scene) })
    })

    new Button(this, frame.centerX, frame.footerY, {
      label: '开始战斗',
      pulse: true,
      keys: ['SPACE', 'ENTER'],
      onTap: () => this.scene.start(SceneKey.Map),
    })

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private createBackdrop(rng: Rng): void {
    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    backdropDecor().forEach((d, i) => {
      const side = i % 2 === 0 ? 0.06 + rng.next() * 0.16 : 0.78 + rng.next() * 0.16
      const img = new Icon(this, w * side, h * (0.12 + rng.next() * 0.76), d.id, 75 + rng.next() * 54, d.outline)
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

  private createLogo(cx: number, y: number): void {
    const logo = new RichLabel(this, cx, y, [{ text: 'War', color: 'accent' }, { text: 'Moji' }], {
      kind: 'display',
      outline: true,
      gap: 0,
      originX: 0.5,
    })
    const half = logo.spanWidth / 2 + 62
    const swords = [
      new Icon(this, cx - half, y, '2694', 85),
      new Icon(this, cx + half, y, '2694', 85),
    ]
    swords.forEach((s, i) => {
      const dir = i === 0 ? 1 : -1
      this.tweens.add({
        targets: s,
        rotation: { from: -0.12 * dir, to: 0.12 * dir },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    })
  }

  private createVignette(cx: number, cy: number): void {
    const cast = vignetteCast()
    cast.heroes.forEach((emoji, i) => {
      new Icon(this, cx - 260 + i * 90, cy, emoji, 75, 'player').setFlipX(true)
    })
    cast.foes.forEach((emoji, i) => {
      const img = new Icon(this, cx + 80 + i * 90, cy, emoji, 70, 'enemy')
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
    const tomato = new Icon(this, cx - 34, cy - 6, '1f345', 40, 'player')
    this.tweens.add({ targets: tomato, x: cx + 42, rotation: 6, duration: 780, repeat: -1, repeatDelay: 260 })
    const shot = new Icon(this, cx + 42, cy + 22, '1f534', 30, 'enemyProjectile')
    this.tweens.add({ targets: shot, x: cx - 34, duration: 1100, repeat: -1, repeatDelay: 420 })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}
