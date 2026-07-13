import Phaser from 'phaser'
import { CHARACTERS, COIN, MEMBER } from '../core/config'
import { browserStorage } from '../core/highscore'
import { randomPalette } from '../core/palette'
import { Rng } from '../core/rng'
import { getRun, waveStartHp } from '../core/run'
import { loadLineup } from '../core/selection'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { emojiImage, iconLabel } from '../ui/emoji'
import { UI_FONT } from '../ui/fonts'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

// 波次间商店（占位版）：展示战果与队伍状态，未来在此陈列商品。
// 单列布局按最小可用空间设计（横 1280×720 / 竖 720×1280），内容块居中于实际视口。
interface ShopLayout {
  content: { w: number; h: number }
  titleY: number
  coinsY: number
  teamY: number
  noteY: number
  btnY: number
  btn: { w: number; h: number }
}

const LANDSCAPE: ShopLayout = {
  content: { w: 1280, h: 720 },
  titleY: 130,
  coinsY: 210,
  teamY: 330,
  noteY: 440,
  btnY: 560,
  btn: { w: 300, h: 60 },
}

const PORTRAIT: ShopLayout = {
  content: { w: 720, h: 1280 },
  titleY: 300,
  coinsY: 390,
  teamY: 530,
  noteY: 660,
  btnY: 820,
  btn: { w: 300, h: 64 },
}

export class ShopScene extends Phaser.Scene {
  private btnRect = { x: 0, y: 0, w: 0, h: 0 }

  constructor() {
    super('shop')
  }

  create(): void {
    applyCamera(this)
    applyBackground(randomPalette(new Rng(Date.now() >>> 0)))
    const lineup = loadLineup(browserStorage())
    const run = getRun(lineup.length)

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const L = h > w ? PORTRAIT : LANDSCAPE
    const oy = (h - L.content.h) / 2

    this.add
      .text(w / 2, oy + L.titleY, `第 ${run.wave - 1} 波完成`, {
        fontFamily: UI_FONT,
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)

    // 金币余额
    iconLabel(this, w / 2, oy + L.coinsY, COIN.emoji, 34, `${run.coins}`, {
      fontFamily: UI_FONT,
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#ffd54f',
      resolution: res,
    })

    // 队伍状态：下一波开局血量（存活者延续，阵亡者低血量复活）
    const gap = Math.min(100, (L.content.w - 80) / lineup.length)
    const left = w / 2 - ((lineup.length - 1) * gap) / 2
    lineup.forEach((id, i) => {
      const x = left + i * gap
      emojiImage(this, x, oy + L.teamY, CHARACTERS[id].emoji, 48, true)
      const hp = waveStartHp(run.memberHp[i] ?? MEMBER.maxHp, MEMBER.maxHp)
      const ratio = hp / MEMBER.maxHp
      const bar = this.add.graphics()
      bar.fillStyle(0x000000, 0.45)
      bar.fillRect(x - 24, oy + L.teamY + 34, 48, 6)
      bar.fillStyle(ratio > 0.5 ? 0x66bb6a : ratio > 0.3 ? 0xffb300 : 0xef5350, 1)
      bar.fillRect(x - 23, oy + L.teamY + 35, 46 * ratio, 4)
    })

    this.add
      .text(w / 2, oy + L.noteY, '商品即将上架，敬请期待…', {
        fontFamily: UI_FONT,
        fontSize: '18px',
        color: '#9a9aa8',
        resolution: res,
      })
      .setOrigin(0.5)

    // 继续按钮
    this.btnRect = {
      x: w / 2 - L.btn.w / 2,
      y: oy + L.btnY - L.btn.h / 2,
      w: L.btn.w,
      h: L.btn.h,
    }
    const b = this.btnRect
    const btnBg = this.add.graphics()
    btnBg.fillStyle(0xffd54f, 1)
    btnBg.fillRoundedRect(b.x, b.y, b.w, b.h, b.h / 2)
    this.add
      .text(w / 2, oy + L.btnY, `开始第 ${run.wave} 波`, {
        fontFamily: UI_FONT,
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#25262e',
        resolution: res,
      })
      .setOrigin(0.5)
    this.add
      .zone(b.x, b.y, b.w, b.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.nextWave())
    this.input.keyboard?.on('keydown-ENTER', () => this.nextWave())
    this.input.keyboard?.on('keydown-SPACE', () => this.nextWave())

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })

    reportDebug({
      scene: 'shop',
      elapsed: 0,
      hp: 0,
      alive: 0,
      kills: run.kills,
      level: run.xp.level,
      wave: run.wave,
      coins: run.coins,
      enemies: 0,
      pending: 0,
      fps: 0,
      viewW: w,
      viewH: h,
      playerX: 0,
      playerY: 0,
      camX: 0,
      camY: 0,
      shop: {
        wave: run.wave,
        coins: run.coins,
        start: { x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h },
      },
    })
  }

  private nextWave(): void {
    this.scene.start('arena')
  }

  private onViewportChanged(): void {
    this.scene.restart()
  }
}
