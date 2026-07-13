import Phaser from 'phaser'
import type { CharacterId } from '../core/config'
import { CHARACTERS, ROSTER_IDS, TEAM } from '../core/config'
import { formatTime } from '../core/format'
import { browserStorage, loadHighScore } from '../core/highscore'
import { randomPalette } from '../core/palette'
import { Rng } from '../core/rng'
import { loadLineup, saveLineup, toggleLineup } from '../core/selection'
import { applyBackground } from '../ui/background'
import { reportDebug } from '../ui/debug'
import { emojiImage, iconLabel } from '../ui/emoji'
import { UI_FONT } from '../ui/fonts'
import { applyCamera, textRes, viewport, VIEWPORT_CHANGED } from '../ui/viewport'

// 组队页布局按最小可用空间设计（横 1280×720 / 竖 720×1280），内容块居中于实际视口
interface MenuLayout {
  content: { w: number; h: number }
  title: { y: number; size: number }
  hintY: number
  grid: { cols: number; cardW: number; cardH: number; gapX: number; gapY: number; top: number }
  scoreY: number
  btn: { y: number; w: number; h: number }
}

const LANDSCAPE: MenuLayout = {
  content: { w: 1280, h: 720 },
  title: { y: 52, size: 38 },
  hintY: 102,
  grid: { cols: 3, cardW: 380, cardH: 205, gapX: 20, gapY: 18, top: 132 },
  scoreY: 592,
  btn: { y: 648, w: 280, h: 58 },
}

const PORTRAIT: MenuLayout = {
  content: { w: 720, h: 1280 },
  title: { y: 84, size: 44 },
  hintY: 142,
  grid: { cols: 2, cardW: 324, cardH: 240, gapX: 20, gapY: 18, top: 186 },
  scoreY: 1000,
  btn: { y: 1112, w: 300, h: 64 },
}

interface Card {
  id: CharacterId
  x: number
  y: number
  w: number
  h: number
  bg: Phaser.GameObjects.Graphics
  badge: Phaser.GameObjects.Image
  faces: { setAlpha(a: number): unknown }[]
}

export class MenuScene extends Phaser.Scene {
  private lineup: CharacterId[] = []
  private cards: Card[] = []
  private hintText!: Phaser.GameObjects.Text
  private btnBg!: Phaser.GameObjects.Graphics
  private btnText!: Phaser.GameObjects.Text
  private btnRect = { x: 0, y: 0, w: 0, h: 0 }

  constructor() {
    super('menu')
  }

  create(): void {
    applyCamera(this)
    applyBackground(randomPalette(new Rng(Date.now() >>> 0)))
    this.lineup = loadLineup(browserStorage())
    this.cards = []

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const L = h > w ? PORTRAIT : LANDSCAPE
    const ox = (w - L.content.w) / 2
    const oy = (h - L.content.h) / 2

    const title = this.add
      .text(w / 2, oy + L.title.y, 'WARMOJI', {
        fontFamily: UI_FONT,
        fontSize: `${L.title.size}px`,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)
    const swordOffset = title.width / 2 + 48
    emojiImage(this, w / 2 - swordOffset, oy + L.title.y, '⚔️', L.title.size * 0.9)
    emojiImage(this, w / 2 + swordOffset, oy + L.title.y, '⚔️', L.title.size * 0.9)

    this.hintText = this.add
      .text(w / 2, oy + L.hintY, '', {
        fontFamily: UI_FONT,
        fontSize: '19px',
        color: '#e8e8f0',
        resolution: res,
      })
      .setOrigin(0.5)

    // 角色卡网格（当前 6 人一屏放得下；人数多了再做分页/滚动）
    const rows = Math.ceil(ROSTER_IDS.length / L.grid.cols)
    const blockW = L.grid.cols * L.grid.cardW + (L.grid.cols - 1) * L.grid.gapX
    const left = ox + (L.content.w - blockW) / 2
    ROSTER_IDS.forEach((id, i) => {
      const col = i % L.grid.cols
      const row = Math.floor(i / L.grid.cols)
      if (row >= rows) return
      this.cards.push(
        this.createCard(
          id,
          left + col * (L.grid.cardW + L.grid.gapX),
          oy + L.grid.top + row * (L.grid.cardH + L.grid.gapY),
          L.grid.cardW,
          L.grid.cardH,
          res,
        ),
      )
    })

    const best = loadHighScore(browserStorage())
    if (best.bestSeconds > 0) {
      iconLabel(
        this,
        w / 2,
        oy + L.scoreY,
        '🏆',
        20,
        `最佳：存活 ${formatTime(best.bestSeconds)} · 击杀 ${best.bestKills}`,
        { fontFamily: UI_FONT, fontSize: '18px', color: '#d4b106', resolution: res },
      )
    }

    this.btnRect = {
      x: w / 2 - L.btn.w / 2,
      y: oy + L.btn.y - L.btn.h / 2,
      w: L.btn.w,
      h: L.btn.h,
    }
    this.btnBg = this.add.graphics()
    this.btnText = this.add
      .text(w / 2, oy + L.btn.y, '', {
        fontFamily: UI_FONT,
        fontSize: '24px',
        fontStyle: 'bold',
        resolution: res,
      })
      .setOrigin(0.5)
    this.add
      .zone(this.btnRect.x, this.btnRect.y, this.btnRect.w, this.btnRect.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.startRun())
    this.input.keyboard?.on('keydown-ENTER', () => this.startRun())
    this.input.keyboard?.on('keydown-SPACE', () => this.startRun())

    // Twemoji 图形许可（CC-BY 4.0）要求署名
    this.add
      .text(w / 2, h - 10, 'emoji graphics © Twemoji · CC-BY 4.0', {
        fontFamily: UI_FONT,
        fontSize: '11px',
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(0.5, 1)
      .setAlpha(0.28)

    this.refreshSelection()

    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private createCard(
    id: CharacterId,
    x: number,
    y: number,
    w: number,
    h: number,
    res: number,
  ): Card {
    const spec = CHARACTERS[id]
    const bg = this.add.graphics()
    const emoji = emojiImage(this, x + w / 2, y + h * 0.3, spec.emoji, Math.min(72, h * 0.32), true)
    const name = this.add
      .text(x + w / 2, y + h * 0.56, spec.name, {
        fontFamily: UI_FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#ffffff',
        resolution: res,
      })
      .setOrigin(0.5)
    const desc = this.add
      .text(x + w / 2, y + h * 0.68, spec.desc, {
        fontFamily: UI_FONT,
        fontSize: '16px',
        color: '#d6d6de',
        align: 'center',
        wordWrap: { width: w - 36 },
        resolution: res,
      })
      .setOrigin(0.5, 0)
    const badge = emojiImage(this, x + w - 22, y + 22, '✅', 26)
    this.add
      .zone(x, y, w, h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onCardTap(id))
    return { id, x, y, w, h, bg, badge, faces: [emoji, name, desc] }
  }

  private onCardTap(id: CharacterId): void {
    if (!this.lineup.includes(id) && this.lineup.length >= TEAM.size) {
      // 满员时点替补：闪一下人数提示
      this.tweens.add({ targets: this.hintText, alpha: 0.2, yoyo: true, duration: 110, repeat: 1 })
      return
    }
    this.lineup = toggleLineup(this.lineup, id)
    saveLineup(browserStorage(), this.lineup)
    this.refreshSelection()
  }

  private refreshSelection(): void {
    for (const card of this.cards) {
      const selected = this.lineup.includes(card.id)
      const g = card.bg
      g.clear()
      g.fillStyle(0x000000, selected ? 0.42 : 0.22)
      g.fillRoundedRect(card.x, card.y, card.w, card.h, 14)
      g.lineStyle(selected ? 3 : 2, selected ? 0xffd54f : 0xffffff, selected ? 1 : 0.16)
      g.strokeRoundedRect(card.x, card.y, card.w, card.h, 14)
      card.badge.setVisible(selected)
      for (const f of card.faces) f.setAlpha(selected ? 1 : 0.45)
    }

    const ready = this.lineup.length === TEAM.size
    this.hintText.setText(`点击角色卡选择出战阵容 · 已选 ${this.lineup.length}/${TEAM.size}`)
    const { x, y, w, h } = this.btnRect
    this.btnBg.clear()
    this.btnBg.fillStyle(ready ? 0xffd54f : 0xffffff, ready ? 1 : 0.14)
    this.btnBg.fillRoundedRect(x, y, w, h, h / 2)
    this.btnText
      .setText(ready ? '出 发' : `出发（${this.lineup.length}/${TEAM.size}）`)
      .setColor(ready ? '#25262e' : '#9a9aa8')
    this.reportMenu()
  }

  private startRun(): void {
    if (this.lineup.length !== TEAM.size) return
    this.scene.start('arena')
  }

  private reportMenu(): void {
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
      viewW: viewport.logicalWidth,
      viewH: viewport.logicalHeight,
      playerX: 0,
      playerY: 0,
      camX: 0,
      camY: 0,
      menu: {
        selected: this.lineup.length,
        size: TEAM.size,
        cards: this.cards.map((c) => ({
          id: c.id,
          x: c.x,
          y: c.y,
          w: c.w,
          h: c.h,
          selected: this.lineup.includes(c.id),
        })),
        start: {
          x: this.btnRect.x + this.btnRect.w / 2,
          y: this.btnRect.y + this.btnRect.h / 2,
          w: this.btnRect.w,
          h: this.btnRect.h,
          enabled: this.lineup.length === TEAM.size,
        },
      },
    })
  }

  private onViewportChanged(): void {
    // 选择已持久化，直接重建适配新尺寸
    this.scene.restart()
  }
}
