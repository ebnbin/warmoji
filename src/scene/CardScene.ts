import Phaser from 'phaser'
import { RARITIES } from '../data/items'
import { CARDS, aggregateTeamCards } from '../data/cards'
import type { CardId } from '../types/cards'
import { randomPalette } from '../util/palette'
import type { Palette } from '../util/palette'
import { Rng } from '../util/rng'
import { getRun, promoteStep } from '../run/state'
import type { RunState } from '../run/state'
import { applyBackground } from '../util/background'
import { reportDebug } from '../debug'
import { emojiImage } from '../emoji/textures'
import { ScrollView } from '../ui/scroll'
import type { ScrollRect } from '../ui/scroll'
import { FONT, UI_FONT } from '../util/fonts'
import { playSfx } from '../audio/sfx'
import { applyCamera, safeInsets, textRes, viewport, VIEWPORT_CHANGED } from '../util/apply'
import { roundRect } from '../ui/shapes'
import { rollCardChoices } from '../run/draft'

const RARITY_COLOR: Record<string, number> = {
  common: 0xc8c8d4,
  rare: 0x4fc3f7,
  epic: 0xce93d8,
}

export class CardScene extends Phaser.Scene {
  private preserveOnRestart = false
  private palette?: Palette
  private run!: RunState
  private list!: ScrollView
  private listRect: ScrollRect = { x: 0, y: 0, w: 0, h: 0 }
  private choices: CardId[] = []
  private rowH = 118
  private rowGap = 12

  constructor() {
    super('cards')
  }

  create(): void {
    applyCamera(this)
    const preserved = this.preserveOnRestart
    this.preserveOnRestart = false
    this.run = getRun()
    if (this.run.cardDraws <= 0) {
      this.scene.start(this.nextScene())
      return
    }
    if (!preserved || !this.palette) this.palette = randomPalette(new Rng(Date.now() >>> 0))
    applyBackground(this.palette)

    const w = viewport.logicalWidth
    const h = viewport.logicalHeight
    const res = textRes()
    const oy = (h - Math.min(h, 1280)) / 2

    const teamFx = aggregateTeamCards(this.run.teamCards)
    const count = 3 + teamFx.draftSize
    this.choices = rollCardChoices(this.run.teamCards, Math.random, count, this.run.wave)

    this.add
      .text(w / 2, oy + 60, '升级！选一张团队卡', {
        fontFamily: UI_FONT,
        fontSize: FONT.title,
        fontStyle: 'bold',
        color: '#f5f5f5',
        resolution: res,
      })
      .setOrigin(0.5)
    this.add
      .text(w / 2, oy + 108, `还剩 ${this.run.cardDraws} 次升级抽卡`, {
        fontFamily: UI_FONT,
        fontSize: FONT.body,
        fontStyle: 'bold',
        color: '#ffdc5d',
        resolution: res,
      })
      .setOrigin(0.5)

    const listW = Math.min(w - 48, 660)
    const top = oy + 150
    const bottom = h - safeInsets.bottom - 24
    this.listRect = { x: (w - listW) / 2, y: top, w: listW, h: Math.max(160, bottom - top) }
    this.list = new ScrollView(this, this.listRect)
    this.choices.forEach((id, i) => this.buildCardRow(id, i, listW, res))
    this.list.setContentHeight(this.choices.length * (this.rowH + this.rowGap))

    this.reportCards()
    this.game.events.on(VIEWPORT_CHANGED, this.onViewportChanged, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_CHANGED, this.onViewportChanged, this)
    })
  }

  private buildCardRow(id: CardId, i: number, listW: number, res: number): void {
    const card = CARDS[id]
    const y = i * (this.rowH + this.rowGap)
    const level = this.run.teamCards[id] ?? 0
    const rc = RARITY_COLOR[card.rarity] ?? 0xffffff
    const bg = this.add.graphics()
    roundRect(bg, 0, y, listW, this.rowH, 14, { fill: 0x000000, fillAlpha: 0.28, strokeWidth: card.rarity === 'common' ? 1 : 2, stroke: rc, strokeAlpha: card.rarity === 'common' ? 0.3 : 0.85 })

    const lvText = level > 0 ? `Lv ${level} → ${level + 1}` : `${RARITIES[card.rarity].label} · 新`
    const zone = this.add
      .zone(0, y, listW, this.rowH)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (this.list.wasDragged) return
        this.pick(id)
      })

    this.list.add([
      bg,
      emojiImage(this, 52, y + this.rowH / 2, card.emoji, 64),
      this.add
        .text(100, y + 26, card.name, {
          fontFamily: UI_FONT,
          fontSize: FONT.lead,
          fontStyle: 'bold',
          color: card.rarity === 'common' ? '#ffffff' : RARITIES[card.rarity].color,
          resolution: res,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(listW - 20, y + 26, lvText, {
          fontFamily: UI_FONT,
          fontSize: FONT.small,
          color: RARITIES[card.rarity].color,
          resolution: res,
        })
        .setOrigin(1, 0.5),
      this.add
        .text(100, y + 58, card.desc, {
          fontFamily: UI_FONT,
          fontSize: FONT.body,
          color: '#d0d0d8',
          wordWrap: { width: listW - 120 },
          lineSpacing: 4,
          resolution: res,
        })
        .setOrigin(0, 0),
      zone,
    ])
  }

  private pick(id: CardId): void {
    const cur = this.run.teamCards[id] ?? 0
    this.run.teamCards[id] = Math.min(cur + 1, CARDS[id].maxLevel)
    this.run.cardDraws -= 1
    playSfx('levelup')
    this.preserveOnRestart = true
    this.scene.restart()
  }

  private nextScene(): 'promote' | 'shop' {
    return promoteStep(this.run) ? 'promote' : 'shop'
  }

  private reportCards(): void {
    reportDebug({
      scene: 'cards',
      elapsed: 0,
      hp: 0,
      alive: 0,
      kills: this.run.kills,
      level: this.run.xp.level,
      wave: this.run.wave,
      coins: this.run.coins,
      enemies: 0,
      pending: 0,
      fps: 0,
      viewW: viewport.logicalWidth,
      viewH: viewport.logicalHeight,
      playerX: 0,
      playerY: 0,
      camX: 0,
      camY: 0,
      cards: {
        remaining: this.run.cardDraws,
        owned: { ...this.run.teamCards } as Record<string, number>,
        choices: this.choices.map((id, i) => ({
          id,
          level: this.run.teamCards[id] ?? 0,
          maxLevel: CARDS[id].maxLevel,
          rarity: CARDS[id].rarity,
          x: this.listRect.x + this.listRect.w / 2,
          y: this.listRect.y + i * (this.rowH + this.rowGap) + this.rowH / 2 - this.list.scrollY,
          w: this.listRect.w,
          h: this.rowH,
        })),
      },
    })
  }

  private onViewportChanged(): void {
    this.preserveOnRestart = true
    this.scene.restart()
  }
}
